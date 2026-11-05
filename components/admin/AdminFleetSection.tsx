/**
 * Admin tab "ავტოპარკი": the cars by category (sedan, minivan, microbus, bus,
 * SUV), filters by class, seats and language, and one tap on a driver for
 * everything about him (AdminFleetDriverPanel).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { adminStyles } from './adminStyles';
import { fetchFleetEntries } from '../../lib/adminFleet';
import {
  FLEET_CLASSES,
  FLEET_PROBLEM_TONE,
  FLEET_TIERED_CATEGORIES,
  driversWithoutLanguages,
  filterFleetEntries,
  fleetCategoriesInUse,
  fleetEntryStatus,
  fleetInitials,
  fleetProblemsOf,
  summarizeFleetCategory,
  tierSeatsLabel,
  type FleetCategoryId,
  type FleetClass,
  type FleetEntry,
} from '../../lib/adminFleetLogic';
import { FLEET_CLASS_TONE, FLEET_TONE_COLORS, FleetBadge, FleetFilterChip } from './FleetChip';
import { AdminFleetDriverPanel, FLEET_STATUS_KEY, FLEET_STATUS_TONE } from './AdminFleetDriverPanel';
import { AdminUserDetailModal } from './AdminUserDetailModal';

/** From this width the driver opens beside the list instead of over it. */
const SIDE_PANEL_MIN_WIDTH = 1100;

const LANGUAGE_FILTERS: { id: string; key: string }[] = [
  { id: 'all', key: 'adminFleet.all' },
  { id: 'en', key: 'adminFleet.langEnglish' },
  { id: 'ru', key: 'adminFleet.langRussian' },
  { id: 'none', key: 'adminFleet.langNone' },
];

export function AdminFleetSection() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= SIDE_PANEL_MIN_WIDTH;

  const [entries, setEntries] = useState<FleetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<FleetCategoryId>('sedan');
  const [cls, setCls] = useState<FleetClass | 'all'>('all');
  const [tier, setTier] = useState('all');
  const [lang, setLang] = useState('all');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [fullProfileId, setFullProfileId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchFleetEntries();
    setLoading(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setEntries(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => fleetCategoriesInUse(entries), [entries]);
  const summaries = useMemo(
    () => new Map(categories.map((c) => [c, summarizeFleetCategory(entries, c)] as const)),
    [categories, entries],
  );
  const summary = summaries.get(category) ?? summarizeFleetCategory(entries, category);
  const filtered = useMemo(
    () => filterFleetEntries(entries, { category, cls, tier, lang, onlyProblems, query }),
    [entries, category, cls, tier, lang, onlyProblems, query],
  );
  const callListCount = useMemo(() => driversWithoutLanguages(entries).length, [entries]);

  const selected = useMemo(() => entries.find((e) => e.key === selectedKey) ?? null, [entries, selectedKey]);
  const selectedDriverEntries = useMemo(() => {
    if (!selected) return [];
    const mine = entries.filter((e) => e.driver.id === selected.driver.id);
    return [selected, ...mine.filter((e) => e.key !== selected.key)];
  }, [entries, selected]);

  const pickCategory = (c: FleetCategoryId) => {
    setCategory(c);
    setCls('all');
    setTier('all');
    setSelectedKey(null);
  };

  const onLanguagesSaved = useCallback((driverId: string, languages: string[]) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.driver.id !== driverId) return e;
        const next = { ...e, driver: { ...e.driver, languages }, languages };
        return { ...next, problems: fleetProblemsOf(next) };
      }),
    );
  }, []);

  if (loading && entries.length === 0) {
    return <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.xl }} />;
  }

  if (error && entries.length === 0) {
    return (
      <View style={adminStyles.errBox}>
        <Text style={adminStyles.errText}>{t('adminFleet.loadError')}</Text>
        <Pressable onPress={() => void load()} accessibilityRole="button" style={adminStyles.retry}>
          <Text style={adminStyles.retryText}>{t('adminFleet.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const panel = selected ? (
    <AdminFleetDriverPanel
      entry={selected}
      driverEntries={selectedDriverEntries}
      onClose={() => setSelectedKey(null)}
      onLanguagesSaved={onLanguagesSaved}
      onOpenFullProfile={setFullProfileId}
    />
  ) : null;

  return (
    <View style={styles.root}>
      {callListCount > 0 ? (
        <View style={styles.callList}>
          <View style={styles.callListText}>
            <Text style={styles.callListTitle}>{t('adminFleet.callListTitle', { count: callListCount })}</Text>
            <Text style={styles.callListHint}>{t('adminFleet.callListHint')}</Text>
          </View>
          <FleetFilterChip
            label={t('adminFleet.langNone')}
            active={lang === 'none'}
            onPress={() => setLang(lang === 'none' ? 'all' : 'none')}
          />
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('adminFleet.searchPlaceholder')}
          placeholderTextColor={COLORS.textMuted}
          accessibilityLabel={t('adminFleet.searchPlaceholder')}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.cats}>
        {categories.map((c) => {
          const s = summaries.get(c);
          const on = c === category;
          return (
            <Pressable
              key={c}
              onPress={() => pickCategory(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.cat, on && styles.catActive, pressed && styles.pressed]}
            >
              <View style={styles.catHead}>
                <Text style={styles.catName}>{t(`adminFleet.categories.${c}`)}</Text>
                <Text style={styles.catTotal}>{s?.total ?? 0}</Text>
              </View>
              <Text style={styles.catMeta}>{t('adminFleet.activeCount', { count: s?.active ?? 0 })}</Text>
              {s && s.driversWithoutLanguages > 0 ? (
                <Text style={styles.catDanger}>{t('adminFleet.noLangCount', { count: s.driversWithoutLanguages })}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{t('adminFleet.filterClass')}</Text>
          <View style={styles.wrapRow}>
            <FleetFilterChip label={t('adminFleet.all')} count={summary.total} active={cls === 'all'} onPress={() => setCls('all')} />
            {FLEET_CLASSES.map((c) =>
              summary.byClass[c] > 0 ? (
                <FleetFilterChip
                  key={c}
                  label={t(`adminFleet.classes.${c}`)}
                  count={summary.byClass[c]}
                  active={cls === c}
                  onPress={() => setCls(c)}
                />
              ) : null,
            )}
          </View>
        </View>
        {FLEET_TIERED_CATEGORIES.includes(category) && summary.byTier.length > 0 ? (
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>{t('adminFleet.filterSeats')}</Text>
            <View style={styles.wrapRow}>
              <FleetFilterChip label={t('adminFleet.all')} active={tier === 'all'} onPress={() => setTier('all')} />
              {summary.byTier.map((x) => (
                <FleetFilterChip
                  key={x.tier}
                  label={x.tier === 'none' ? t('adminFleet.seatsNone') : t('adminFleet.seats', { seats: tierSeatsLabel(x.tier) })}
                  count={x.count}
                  active={tier === x.tier}
                  onPress={() => setTier(x.tier)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{t('adminFleet.filterLanguage')}</Text>
          <View style={styles.wrapRow}>
            {LANGUAGE_FILTERS.map((l) => (
              <FleetFilterChip key={l.id} label={t(l.key)} active={lang === l.id} onPress={() => setLang(l.id)} />
            ))}
          </View>
        </View>
        <View style={[styles.filterRow, styles.problemsRow]}>
          <FleetFilterChip
            label={t('adminFleet.onlyProblems')}
            active={onlyProblems}
            onPress={() => setOnlyProblems((v) => !v)}
          />
          {summary.problems.length > 0 ? <Text style={styles.inCategory}>{t('adminFleet.inCategory')}</Text> : null}
          {summary.problems.map((p) => (
            <FleetBadge
              key={p.code}
              label={`${t(`adminFleet.problems.${p.code}`)} · ${p.count}`}
              tone={FLEET_PROBLEM_TONE[p.code]}
            />
          ))}
        </View>
      </View>

      <View style={[styles.body, wide && styles.bodyWide]}>
        <View style={styles.list}>
          {filtered.length === 0 ? (
            <Text style={adminStyles.empty}>{t('adminFleet.empty')}</Text>
          ) : (
            filtered.map((e) => <FleetRow key={e.key} entry={e} selected={e.key === selectedKey} onPress={() => setSelectedKey(e.key)} />)
          )}
        </View>
        {wide ? (
          <View style={styles.side}>
            {panel ?? (
              <View style={styles.sideEmpty}>
                <Text style={styles.sideEmptyText}>{t('adminFleet.selectDriver')}</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {!wide ? (
        <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelectedKey(null)}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalInner}>
            {panel}
          </ScrollView>
        </Modal>
      ) : null}

      <AdminUserDetailModal
        userId={fullProfileId}
        onClose={() => setFullProfileId(null)}
        onOpenUser={(id) => setFullProfileId(id)}
      />
    </View>
  );
}

function FleetRow({ entry, selected, onPress }: { entry: FleetEntry; selected: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const e = entry;
  const status = fleetEntryStatus(e);
  const docsOk = [e.idOk, e.licenseOk, e.techOk].filter(Boolean).length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{fleetInitials(e.driver.full_name)}</Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowName} numberOfLines={1}>
            {e.driver.full_name?.trim() || '—'}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {[e.driver.phone, e.driver.city].filter(Boolean).join(' · ') || '—'}
          </Text>
          <Text style={styles.rowVehicle} numberOfLines={1}>
            {[e.vehicle.model, e.vehicle.plate, e.vehicle.year].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
        <FleetBadge label={t(FLEET_STATUS_KEY[status])} tone={FLEET_STATUS_TONE[status]} />
      </View>
      <View style={styles.wrapRow}>
        {e.cls ? <FleetBadge label={t(`adminFleet.classes.${e.cls}`)} tone={FLEET_CLASS_TONE[e.cls]} /> : null}
        {FLEET_TIERED_CATEGORIES.includes(e.category) ? (
          <FleetBadge
            label={e.tier ? t('adminFleet.seats', { seats: tierSeatsLabel(e.tier) }) : t('adminFleet.seatsNone')}
            tone={e.tier ? 'muted' : 'warn'}
          />
        ) : null}
        <FleetBadge
          label={e.languages.length > 0 ? e.languages.map((c) => c.toUpperCase()).join(' · ') : t('adminFleet.langNone')}
          tone={e.languages.length > 0 ? 'info' : 'danger'}
        />
        <FleetBadge label={t('adminFleet.docsShort', { ok: docsOk })} tone={docsOk === 3 ? 'success' : 'danger'} />
        <FleetBadge label={t('adminFleet.photosShort', { count: e.photosCount })} tone={e.photosCount === 5 ? 'success' : 'warn'} />
      </View>
      {e.problems.filter((p) => p !== 'no_languages' && p !== 'no_seat_tier' && p !== 'photos_missing').length > 0 ? (
        <View style={styles.wrapRow}>
          {e.problems
            .filter((p) => p !== 'no_languages' && p !== 'no_seat_tier' && p !== 'photos_missing')
            .map((p) => (
              <FleetBadge key={p} label={t(`adminFleet.problems.${p}`)} tone={FLEET_PROBLEM_TONE[p]} />
            ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.md, paddingBottom: SPACING.xl },
  callList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    backgroundColor: FLEET_TONE_COLORS.danger.bg,
    borderWidth: 1,
    borderColor: FLEET_TONE_COLORS.danger.border,
  },
  callListText: { flexGrow: 1, flexShrink: 1, flexBasis: 240, gap: 2 },
  callListTitle: { color: FLEET_TONE_COLORS.danger.fg, fontSize: 15, fontWeight: '800' },
  callListHint: { color: '#7F1D1D', fontSize: 13, lineHeight: 18 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
  },
  searchInput: { flex: 1, paddingVertical: 12, color: COLORS.text, fontSize: 15 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  cat: {
    flexGrow: 1,
    flexBasis: 150,
    gap: 4,
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  catActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  catHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  catName: { color: COLORS.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  catTotal: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  catMeta: { color: '#4B5563', fontSize: 12 },
  catDanger: { color: FLEET_TONE_COLORS.danger.fg, fontSize: 12, fontWeight: '700' },
  filters: {
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  filterLabel: { width: 84, color: '#4B5563', fontSize: 13, fontWeight: '700' },
  problemsRow: { paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.surfaceAlt },
  inCategory: { color: '#4B5563', fontSize: 13 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  body: { gap: SPACING.md },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start' },
  list: { flex: 1, minWidth: 0, gap: SPACING.sm },
  side: { width: 460 },
  sideEmpty: {
    padding: SPACING.xl,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    backgroundColor: COLORS.white,
  },
  sideEmptyText: { color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  row: {
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  rowSelected: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: '#F5D18A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#92400E', fontSize: 14, fontWeight: '800' },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  rowMeta: { color: COLORS.textSecondary, fontSize: 12 },
  rowVehicle: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  modalScroll: { flex: 1, backgroundColor: COLORS.surface },
  modalInner: { padding: SPACING.lg, paddingTop: SPACING.xl },
  pressed: { opacity: 0.85 },
});
