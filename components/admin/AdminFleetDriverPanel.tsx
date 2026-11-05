/**
 * Everything about one driver on one screen: what is missing, the languages
 * (the admin can mark them after a phone call), the ID and licence photos,
 * and every car with its five photos and registration certificate.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { DocumentImage } from '../DocumentImage';
import { StorageImage } from '../StorageImage';
import { LanguageMultiSelect } from '../LanguageMultiSelect';
import { viewableDocumentUri } from '../../lib/documentStorage';
import { spokenLanguageLabel } from '../../lib/spokenLanguages';
import { saveDriverLanguagesAsAdmin } from '../../lib/adminFleet';
import {
  FLEET_PROBLEM_TONE,
  fleetEntryStatus,
  fleetInitials,
  tierSeatsLabel,
  type FleetEntry,
  type FleetEntryStatus,
} from '../../lib/adminFleetLogic';
import { FLEET_CLASS_TONE, FLEET_TONE_COLORS, FleetBadge, type FleetTone } from './FleetChip';

type Props = {
  entry: FleetEntry;
  /** Every car of this driver; the selected one first. */
  driverEntries: FleetEntry[];
  onClose: () => void;
  onLanguagesSaved: (driverId: string, languages: string[]) => void;
  onOpenFullProfile: (driverId: string) => void;
};

type Preview = { uri: string; title: string; kind: 'document' | 'photo' };

export const FLEET_STATUS_TONE: Record<FleetEntryStatus, FleetTone> = {
  blocked: 'danger',
  review: 'info',
  off: 'muted',
  active: 'success',
};

export const FLEET_STATUS_KEY: Record<FleetEntryStatus, string> = {
  blocked: 'adminFleet.statusBlocked',
  review: 'adminFleet.statusReview',
  off: 'adminFleet.statusOff',
  active: 'adminFleet.statusActive',
};

function Tile({
  label,
  uri,
  kind,
  height,
  onOpen,
}: {
  label: string;
  uri: string | null;
  kind: 'document' | 'photo';
  height: number;
  onOpen: (p: Preview) => void;
}) {
  const { t } = useTranslation();
  const has = !!uri && uri.trim().length > 0;
  return (
    <View style={styles.tile}>
      {has ? (
        <Pressable
          onPress={() => onOpen({ uri: uri as string, title: label, kind })}
          accessibilityRole="imagebutton"
          accessibilityLabel={label}
          style={({ pressed }) => [styles.tileBox, { height }, pressed && styles.pressed]}
        >
          {kind === 'document' ? (
            <DocumentImage uri={uri} style={styles.tileImage} resizeMode="cover" />
          ) : (
            <StorageImage uri={uri} size={{ width: 240, height: 180, quality: 70 }} style={styles.tileImage} resizeMode="cover" />
          )}
        </Pressable>
      ) : (
        <View style={[styles.tileBox, styles.tileMissing, { height }]}>
          <Ionicons name="alert-circle-outline" size={20} color={FLEET_TONE_COLORS.danger.fg} />
        </View>
      )}
      <View style={styles.tileFoot}>
        <Text style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.tileStatus, { color: has ? FLEET_TONE_COLORS.success.fg : FLEET_TONE_COLORS.danger.fg }]}>
          {has ? t('adminFleet.panel.uploaded') : t('adminFleet.panel.missing')}
        </Text>
      </View>
    </View>
  );
}

export function AdminFleetDriverPanel({ entry, driverEntries, onClose, onLanguagesSaved, onOpenFullProfile }: Props) {
  const { t, i18n } = useTranslation();
  const d = entry.driver;
  const status = fleetEntryStatus(entry);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(entry.languages);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    setEditing(false);
    setDraft(entry.languages);
    setMessage(null);
    // A new driver opened: start from his own languages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

  async function saveLanguages() {
    setSaving(true);
    setMessage(null);
    const res = await saveDriverLanguagesAsAdmin(d.id, draft);
    setSaving(false);
    if (res.error) {
      setMessage({ ok: false, text: t('adminFleet.panel.saveError') });
      return;
    }
    setEditing(false);
    setDraft(res.languages);
    setMessage({ ok: true, text: t('adminFleet.panel.saved') });
    onLanguagesSaved(d.id, res.languages);
  }

  const phone = (d.phone ?? '').trim();

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{fleetInitials(d.full_name)}</Text>
        </View>
        <View style={styles.headText}>
          <Text style={styles.name}>{d.full_name?.trim() || '—'}</Text>
          <Text style={styles.meta}>{[phone, d.city].filter(Boolean).join(' · ') || '—'}</Text>
          <FleetBadge label={t(FLEET_STATUS_KEY[status])} tone={FLEET_STATUS_TONE[status]} />
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('adminFleet.panel.close')}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={20} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.actions}>
        {phone ? (
          <Pressable
            onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}
          >
            <Ionicons name="call-outline" size={18} color={COLORS.text} />
            <Text style={styles.btnGoldText}>{t('adminFleet.panel.call')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onOpenFullProfile(d.id)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}
        >
          <Text style={styles.btnOutlineText}>{t('adminFleet.panel.fullProfile')}</Text>
        </Pressable>
      </View>

      {entry.problems.length > 0 ? (
        <View style={styles.missingBox}>
          <Text style={styles.missingTitle}>{t('adminFleet.panel.whatMissing')}</Text>
          <View style={styles.wrapRow}>
            {entry.problems.map((p) => (
              <FleetBadge key={p} label={t(`adminFleet.problems.${p}`)} tone={FLEET_PROBLEM_TONE[p]} />
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.okBox}>
          <Ionicons name="checkmark-circle-outline" size={18} color={FLEET_TONE_COLORS.success.fg} />
          <Text style={styles.okText}>{t('adminFleet.panel.nothingMissing')}</Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('adminFleet.panel.languages')}</Text>
          {!editing ? (
            <Pressable
              onPress={() => {
                setDraft(entry.languages);
                setMessage(null);
                setEditing(true);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btnSmall, pressed && styles.pressed]}
            >
              <Ionicons name="create-outline" size={16} color={COLORS.text} />
              <Text style={styles.btnSmallText}>{t('adminFleet.panel.editLanguages')}</Text>
            </Pressable>
          ) : null}
        </View>
        {editing ? (
          <View style={styles.editBox}>
            <LanguageMultiSelect
              label={t('adminFleet.panel.languages')}
              hint={t('adminFleet.panel.languagesHint')}
              value={draft}
              onChange={setDraft}
              disabled={saving}
            />
            <View style={styles.actions}>
              <Pressable
                onPress={() => void saveLanguages()}
                disabled={saving}
                accessibilityRole="button"
                style={({ pressed }) => [styles.btnGold, (pressed || saving) && styles.pressed]}
              >
                {saving ? <ActivityIndicator color={COLORS.text} size="small" /> : null}
                <Text style={styles.btnGoldText}>{t('adminFleet.panel.save')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEditing(false);
                  setDraft(entry.languages);
                }}
                disabled={saving}
                accessibilityRole="button"
                style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}
              >
                <Text style={styles.btnOutlineText}>{t('adminFleet.panel.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        ) : entry.languages.length > 0 ? (
          <View style={styles.wrapRow}>
            {entry.languages.map((code) => (
              <FleetBadge key={code} label={spokenLanguageLabel(code, i18n.language)} tone="info" />
            ))}
          </View>
        ) : (
          <Text style={styles.dangerText}>{t('adminFleet.panel.languagesNone')}</Text>
        )}
        {message ? (
          <Text style={[styles.message, { color: message.ok ? FLEET_TONE_COLORS.success.fg : FLEET_TONE_COLORS.danger.fg }]}>
            {message.text}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('adminFleet.panel.personalDocs')}</Text>
        <View style={styles.grid2}>
          <Tile label={t('adminFleet.panel.idFront')} uri={d.id_front ?? d.id_photo} kind="document" height={96} onOpen={setPreview} />
          <Tile label={t('adminFleet.panel.idBack')} uri={d.id_back} kind="document" height={96} onOpen={setPreview} />
          <Tile label={t('adminFleet.panel.licenseFront')} uri={d.license_front ?? d.license_photo} kind="document" height={96} onOpen={setPreview} />
          <Tile label={t('adminFleet.panel.licenseBack')} uri={d.license_back} kind="document" height={96} onOpen={setPreview} />
        </View>
        <Text style={styles.hint}>{t('adminFleet.panel.tapToEnlarge')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t('adminFleet.panel.vehicles')} · {driverEntries.length}
        </Text>
        {driverEntries.map((e) => {
          const v = e.vehicle;
          return (
            <View key={e.key} style={[styles.vehicle, e.key === entry.key && styles.vehicleSelected]}>
              <View style={styles.vehicleHead}>
                <View style={styles.vehicleTitleWrap}>
                  <Text style={styles.vehicleTitle}>{[v.model, v.year].filter(Boolean).join(' · ') || '—'}</Text>
                  <Text style={styles.meta}>{[v.plate, v.color].filter(Boolean).join(' · ') || '—'}</Text>
                </View>
                <View style={styles.wrapRow}>
                  <FleetBadge label={t(`adminFleet.categories.${e.category}`)} tone="muted" />
                  {e.cls ? <FleetBadge label={t(`adminFleet.classes.${e.cls}`)} tone={FLEET_CLASS_TONE[e.cls]} /> : null}
                  {e.tier ? (
                    <FleetBadge label={t('adminFleet.seats', { seats: tierSeatsLabel(e.tier) })} tone="muted" />
                  ) : null}
                  {typeof v.passenger_capacity === 'number' && v.passenger_capacity > 0 ? (
                    <FleetBadge label={t('adminFleet.panel.passengers', { count: v.passenger_capacity })} tone="muted" />
                  ) : null}
                  {e.problems.includes('vehicle_off') ? (
                    <FleetBadge label={t('adminFleet.problems.vehicle_off')} tone="muted" />
                  ) : null}
                  {e.problems.includes('vehicle_not_approved') ? (
                    <FleetBadge label={t('adminFleet.problems.vehicle_not_approved')} tone="info" />
                  ) : null}
                </View>
              </View>
              <Text style={styles.subTitle}>
                {t('adminFleet.panel.photos')} · {e.photosCount}/5
              </Text>
              <View style={styles.grid5}>
                <Tile label={t('adminFleet.panel.photoFront')} uri={v.photo_front} kind="photo" height={64} onOpen={setPreview} />
                <Tile label={t('adminFleet.panel.photoRear')} uri={v.photo_rear} kind="photo" height={64} onOpen={setPreview} />
                <Tile label={t('adminFleet.panel.photoLeft')} uri={v.photo_left} kind="photo" height={64} onOpen={setPreview} />
                <Tile label={t('adminFleet.panel.photoRight')} uri={v.photo_right} kind="photo" height={64} onOpen={setPreview} />
                <Tile label={t('adminFleet.panel.photoInterior')} uri={v.photo_interior} kind="photo" height={64} onOpen={setPreview} />
              </View>
              <Text style={styles.subTitle}>{t('adminFleet.panel.techPassport')}</Text>
              <View style={styles.grid2}>
                <Tile label={t('adminFleet.panel.techFront')} uri={v.tech_passport_front} kind="document" height={96} onOpen={setPreview} />
                <Tile label={t('adminFleet.panel.techBack')} uri={v.tech_passport_back} kind="document" height={96} onOpen={setPreview} />
              </View>
            </View>
          );
        })}
      </View>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreview(null)}>
          <View style={styles.previewCard}>
            <Text style={styles.sectionTitle}>{preview?.title}</Text>
            {preview ? (
              preview.kind === 'document' ? (
                <DocumentImage uri={preview.uri} style={styles.previewImage} resizeMode="contain" />
              ) : (
                <StorageImage uri={preview.uri} size={{ width: 1200, height: 900, quality: 85 }} style={styles.previewImage} resizeMode="contain" />
              )
            ) : null}
            <Pressable
              onPress={() => {
                if (!preview) return;
                // A private document opens through a signed link, not its stored address.
                void viewableDocumentUri(preview.uri).then((url) => {
                  if (url) void Linking.openURL(url);
                });
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}
            >
              <Text style={styles.btnOutlineText}>{t('adminFleet.panel.openDocument')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: '#F5D18A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#92400E', fontSize: 18, fontWeight: '800' },
  headText: { flex: 1, minWidth: 0, gap: 4 },
  name: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  meta: { color: COLORS.textSecondary, fontSize: 13 },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  btnGold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.gold,
  },
  btnGoldText: { color: COLORS.text, fontWeight: '800', fontSize: 14 },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  btnOutlineText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  btnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  btnSmallText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  missingBox: {
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: FLEET_TONE_COLORS.danger.bg,
    borderWidth: 1,
    borderColor: FLEET_TONE_COLORS.danger.border,
  },
  missingTitle: { color: FLEET_TONE_COLORS.danger.fg, fontSize: 13, fontWeight: '800' },
  okBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: FLEET_TONE_COLORS.success.bg,
  },
  okText: { color: FLEET_TONE_COLORS.success.fg, fontWeight: '700' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  section: { gap: SPACING.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  subTitle: { color: '#4B5563', fontSize: 12, fontWeight: '700', marginTop: SPACING.xs },
  editBox: { gap: SPACING.sm },
  dangerText: { color: FLEET_TONE_COLORS.danger.fg, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  message: { fontSize: 13, fontWeight: '700' },
  hint: { color: COLORS.textSecondary, fontSize: 12 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  grid5: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { flexGrow: 1, flexBasis: 0, minWidth: 64, gap: 4 },
  tileBox: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMissing: {
    backgroundColor: COLORS.white,
    borderStyle: 'dashed',
    borderColor: '#EF4444',
  },
  tileImage: { width: '100%', height: '100%' },
  tileFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  tileLabel: { flexShrink: 1, color: COLORS.text, fontSize: 11, fontWeight: '600' },
  tileStatus: { fontSize: 11, fontWeight: '700' },
  vehicle: {
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  vehicleSelected: { borderColor: COLORS.gold },
  vehicleHead: { gap: SPACING.sm },
  vehicleTitleWrap: { gap: 2 },
  vehicleTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  previewCard: {
    width: '100%',
    maxWidth: 900,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  previewImage: { width: '100%', height: 520, backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.md },
  pressed: { opacity: 0.85 },
});
