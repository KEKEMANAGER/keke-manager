import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { LeafletDriverMap } from '../LeafletDriverMap';
import { isSignalLost, lostAtLabel } from '../../lib/signalAge';
import type { FullScreenDriverMapProps, FullScreenDriverRow } from './FullScreenDriverMap';

export type { FullScreenDriverMapProps, FullScreenDriverRow } from './FullScreenDriverMap';

/** Side panel next to the map from this width; a strip of names above it below. */
const WIDE_MIN_WIDTH = 820;

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function fullscreenElement(): Element | null {
  const doc = document as FullscreenDoc;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function exitBrowserFullscreen() {
  const doc = document as FullscreenDoc;
  if (!fullscreenElement()) return;
  try {
    const result = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.();
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Already out of full screen.
  }
}

/** Returns whether a request was made; a refusal later simply leaves the map in the window. */
function requestBrowserFullscreen(onRefused: () => void): boolean {
  const root = document.documentElement as FullscreenRoot;
  const request = root.requestFullscreen
    ? () => root.requestFullscreen()
    : root.webkitRequestFullscreen
      ? () => root.webkitRequestFullscreen?.()
      : null;
  if (!request) return false;
  try {
    const result = request();
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(onRefused);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Opening and closing the big map. Opening fills the browser window and, where
 * the browser allows it, the whole screen. Every natural way back closes it and
 * leaves the page exactly as it was: the "Back" button, Esc, the browser's own
 * back button or gesture, and leaving the browser's full screen.
 */
export function useFullScreenMap(): { open: boolean; openMap: () => void; closeMap: () => void } {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  /** We added one history entry for the big map; it is taken back when the map closes. */
  const pushedRef = useRef(false);
  /** The browser's full screen was asked for by us. */
  const fullscreenRef = useRef(false);

  const close = useCallback((fromHistory = false) => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    if (fullscreenRef.current) {
      fullscreenRef.current = false;
      exitBrowserFullscreen();
    }
    if (pushedRef.current) {
      pushedRef.current = false;
      if (!fromHistory) window.history.back();
    }
  }, []);

  const openMap = useCallback(() => {
    if (openRef.current) return;
    openRef.current = true;
    setOpen(true);
    try {
      const state = window.history.state;
      window.history.pushState(
        { ...(state && typeof state === 'object' ? state : {}), kekeMapFull: true },
        '',
      );
      pushedRef.current = true;
    } catch {
      pushedRef.current = false;
    }
    // Must run inside the click itself, or the browser refuses.
    fullscreenRef.current = requestBrowserFullscreen(() => {
      fullscreenRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPopState = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        close(true);
      }
    };
    const onFullscreenChange = () => {
      if (!fullscreenElement() && fullscreenRef.current) {
        fullscreenRef.current = false;
        close();
      }
    };
    window.addEventListener('popstate', onPopState);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, [open, close]);

  useEffect(
    () => () => {
      // Leaving the screen with the big map open: give the screen back too.
      if (fullscreenRef.current) {
        fullscreenRef.current = false;
        exitBrowserFullscreen();
      }
    },
    [],
  );

  return { open, openMap, closeMap: () => close() };
}

/** The button in the corner of the normal map that opens the big one. */
export function FullScreenMapButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('mapFullScreen.open')}
      testID="map-fullscreen-open"
      style={({ pressed }) => [styles.openBtn, pressed && styles.pressed]}
    >
      <Ionicons name="expand-outline" size={18} color={COLORS.black} />
      <Text style={styles.openText}>{t('mapFullScreen.open')}</Text>
    </Pressable>
  );
}

function formatAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return '< 5s';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** The map over the whole window, with the drivers beside it and the chosen one's details below. */
export function FullScreenDriverMap({
  open,
  onClose,
  title,
  subtitle,
  pins,
  selectedId,
  hostDriverId,
  onSelect,
  rows,
  badge,
  trail,
}: FullScreenDriverMapProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_MIN_WIDTH;
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const when = (row: FullScreenDriverRow) =>
    row.updatedAt
      ? isSignalLost(row.updatedAt)
        ? t('tracking.signalLostAt', { time: lostAtLabel(row.updatedAt) })
        : `${formatAgo(row.updatedAt)} ${t('tracking.ago')}`
      : t('tracking.noSignal');

  return (
    <Modal visible={open} animationType="none" transparent={false} onRequestClose={onClose}>
      <View style={styles.root} testID="map-fullscreen">
        <LeafletDriverMap
          pins={pins}
          selectedId={selectedId}
          hostDriverId={hostDriverId}
          onSelectPin={onSelect}
          style={styles.map}
          controlsTopOffset={wide ? 64 : 120}
          trail={trail}
        />

        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('mapFullScreen.back')}
            testID="map-fullscreen-back"
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.black} />
            <Text style={styles.backText}>{t('mapFullScreen.back')}</Text>
          </Pressable>
          <View style={styles.titleCard}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {badge ? <View style={styles.badgeSlot}>{badge}</View> : null}
        </View>

        {rows.length > 0 ? (
          wide ? (
            <View style={styles.sidePanel}>
              <Text style={styles.sideTitle}>{t('tracking.driversOnMap')}</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {rows.map((row) => (
                  <Pressable
                    key={row.id}
                    onPress={() => onSelect(row.id)}
                    style={[styles.row, selectedId === row.id && styles.rowSelected]}
                  >
                    <View style={[styles.dot, { backgroundColor: row.dotColor }]} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {row.name}
                        {row.tag ? ` (${row.tag})` : ''}
                      </Text>
                      {row.route ? (
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {row.route}
                        </Text>
                      ) : null}
                      <Text style={styles.rowMeta}>{when(row)}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipStrip}
              contentContainerStyle={styles.chipStripContent}
            >
              {rows.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => onSelect(row.id)}
                  style={[styles.chip, selectedId === row.id && styles.chipSelected]}
                >
                  <View style={[styles.dot, { backgroundColor: row.dotColor }]} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {row.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )
        ) : null}

        {selected ? (
          <View style={[styles.detail, wide ? styles.detailWide : styles.detailNarrow]}>
            <Text style={styles.detailName} numberOfLines={1}>
              {selected.name}
              {selected.tag ? ` (${selected.tag})` : ''}
            </Text>
            {selected.route ? (
              <Text style={styles.detailMeta} numberOfLines={2}>
                {selected.route}
              </Text>
            ) : null}
            <Text style={styles.detailMeta}>{when(selected)}</Text>
            {selected.phone ? (
              <Pressable
                onPress={() => void Linking.openURL(`tel:${selected.phone!.replace(/\s/g, '')}`)}
                accessibilityRole="link"
                style={({ pressed }) => [styles.phoneBtn, pressed && styles.pressed]}
              >
                <Ionicons name="call-outline" size={16} color={COLORS.goldDark} />
                <Text style={styles.phoneText}>{selected.phone}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  openBtn: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    zIndex: 1100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  openText: { fontSize: 13, fontWeight: '700', color: COLORS.black },
  pressed: { opacity: 0.85 },
  root: { flex: 1, backgroundColor: COLORS.background },
  map: { ...StyleSheet.absoluteFillObject, minHeight: 0 },
  topBar: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.gold,
    ...SHADOWS.card,
  },
  backText: { fontSize: 15, fontWeight: '800', color: COLORS.black },
  titleCard: {
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.button,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  /** The screen's badges are see-through; over a busy map they need a white backing. */
  badgeSlot: { marginLeft: 'auto', backgroundColor: COLORS.white, borderRadius: 999 },
  sidePanel: {
    position: 'absolute',
    top: 72,
    right: SPACING.md,
    bottom: SPACING.md,
    width: 300,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    ...SHADOWS.cardStrong,
  },
  sideTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderRadius: 6,
  },
  rowSelected: { backgroundColor: COLORS.goldTint },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  rowMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipStrip: {
    position: 'absolute',
    top: 68,
    left: 0,
    right: 0,
    maxHeight: 44,
    zIndex: 10,
  },
  chipStripContent: { paddingHorizontal: SPACING.md, gap: SPACING.xs, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: 200,
  },
  chipSelected: { backgroundColor: COLORS.goldTint, borderColor: COLORS.gold },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  detail: {
    position: 'absolute',
    bottom: SPACING.md,
    zIndex: 10,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: 3,
    ...SHADOWS.cardStrong,
  },
  detailWide: { left: SPACING.md, width: 340 },
  detailNarrow: { left: SPACING.md, right: SPACING.md },
  detailName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  detailMeta: { fontSize: 13, color: COLORS.textSecondary },
  phoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.button,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
  },
  phoneText: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark },
});
