import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import {
  GEORGIA_REGION_CODES,
  REGION_LABELS,
  isGeorgiaRegionCode,
  type GeorgiaRegionCode,
} from '../lib/georgiaRegions';

type Props = {
  label: string;
  regions: string[];
  onChangeRegions: (codes: string[]) => void;
  travelsCountrywide: boolean;
  onChangeTravelsCountrywide: (value: boolean) => void;
  disabled?: boolean;
};

function labelFor(code: GeorgiaRegionCode, language: string): string {
  const row = REGION_LABELS[code];
  if (language.startsWith('en')) return row.en;
  if (language.startsWith('ru')) return row.ru;
  if (language.startsWith('hy')) return row.hy;
  return row.ka;
}

/**
 * Where this driver is willing to work.
 *
 * Choosing nothing is a real answer and the default one: it means "send me
 * everything", which is exactly how the platform behaved before this existed.
 * The empty state says so out loud, because a driver who thinks an empty list
 * means "no work" would tick all twelve boxes and we would have learned
 * nothing.
 */
export function ServiceRegionsSelect({
  label,
  regions,
  onChangeRegions,
  travelsCountrywide,
  onChangeTravelsCountrywide,
  disabled,
}: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => regions.filter(isGeorgiaRegionCode), [regions]);
  const language = i18n.language ?? 'ka';

  function toggle(code: GeorgiaRegionCode) {
    if (disabled) return;
    onChangeRegions(
      selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code],
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      {selected.length === 0 ? (
        <Text style={styles.allRegions}>{t('serviceRegions.allRegionsHint')}</Text>
      ) : (
        <>
          <Text style={styles.hint}>{t('serviceRegions.selectedHint')}</Text>
          <View style={styles.chipRow}>
            {selected.map((code) => (
              <Pressable
                key={code}
                disabled={disabled}
                onPress={() => toggle(code)}
                style={({ pressed }) => [styles.chip, pressed && !disabled && styles.pressed]}
              >
                <Text style={styles.chipText}>{labelFor(code, language)}</Text>
                {!disabled ? <Text style={styles.chipRemove}>×</Text> : null}
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.addBtn, pressed && !disabled && styles.pressed]}
      >
        <Text style={styles.addBtnText}>
          {selected.length === 0 ? t('serviceRegions.choose') : t('serviceRegions.change')}
        </Text>
      </Pressable>

      {selected.length > 0 ? (
        <View style={styles.switchRow}>
          <View style={styles.switchTextWrap}>
            <Text style={styles.switchTitle}>{t('serviceRegions.countrywideTitle')}</Text>
            <Text style={styles.switchHint}>{t('serviceRegions.countrywideHint')}</Text>
          </View>
          <Switch
            value={travelsCountrywide}
            onValueChange={onChangeTravelsCountrywide}
            disabled={disabled}
            trackColor={{ false: COLORS.border, true: COLORS.gold }}
          />
        </View>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('serviceRegions.pickTitle')}</Text>
            <Text style={styles.modalHint}>{t('serviceRegions.pickHint')}</Text>
            <FlatList
              data={GEORGIA_REGION_CODES}
              keyExtractor={(item) => item}
              style={styles.list}
              renderItem={({ item }) => {
                const active = selected.includes(item);
                return (
                  <Pressable
                    onPress={() => toggle(item)}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {labelFor(item, language)}
                    </Text>
                    {active ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
            >
              <Text style={styles.doneBtnText}>{t('dateTimeField.done')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.md },
  label: {
    color: COLORS.grayLight,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  hint: { color: COLORS.textMuted, fontSize: 12, marginBottom: SPACING.xs },
  allRegions: {
    color: COLORS.goldLight,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245, 166, 35, 0.14)',
  },
  chipText: { color: COLORS.goldLight, fontSize: 14, fontWeight: '700' },
  chipRemove: { color: COLORS.gold, fontSize: 16, fontWeight: '800', lineHeight: 18 },
  addBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  addBtnText: { color: COLORS.gold, fontSize: 14, fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  switchTextWrap: { flex: 1 },
  switchTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  switchHint: { color: COLORS.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '82%',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  modalHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: SPACING.sm,
  },
  list: { maxHeight: 420 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  optionActive: { backgroundColor: 'rgba(245, 166, 35, 0.08)' },
  optionText: { fontSize: 15, color: COLORS.text, flex: 1, paddingRight: SPACING.sm },
  optionTextActive: { fontWeight: '700', color: COLORS.goldLight },
  check: { color: COLORS.gold, fontSize: 16, fontWeight: '800' },
  doneBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.input,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
  pressed: { opacity: 0.88 },
});
