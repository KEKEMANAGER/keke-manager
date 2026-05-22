import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import {
  filterSpokenLanguageOptions,
  sanitizeLanguageCodes,
  spokenLanguageLabel,
  type SpokenLanguageCode,
} from '../lib/spokenLanguages';

type Props = {
  label: string;
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  hint?: string;
};

export function LanguageMultiSelect({ label, value, onChange, disabled, hint }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => sanitizeLanguageCodes(value), [value]);

  const options = useMemo(() => filterSpokenLanguageOptions(query), [query]);

  function toggle(code: SpokenLanguageCode) {
    if (disabled) return;
    const next = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code];
    onChange(next);
  }

  function remove(code: string) {
    if (disabled) return;
    onChange(selected.filter((c) => c !== code));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {selected.length > 0 ? (
        <View style={styles.chipRow}>
          {selected.map((code) => (
            <Pressable
              key={code}
              disabled={disabled}
              onPress={() => remove(code)}
              style={({ pressed }) => [
                styles.chip,
                styles.chipSelected,
                pressed && !disabled && styles.pressed,
              ]}
            >
              <Text style={styles.chipTextSelected}>{spokenLanguageLabel(code)}</Text>
              {!disabled ? <Text style={styles.chipRemove}>×</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>{t('spokenLanguages.noneSelected')}</Text>
      )}

      <Pressable
        disabled={disabled}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        style={({ pressed }) => [styles.addBtn, pressed && !disabled && styles.pressed]}
      >
        <Text style={styles.addBtnText}>{t('spokenLanguages.addLanguages')}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('spokenLanguages.pickTitle')}</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('spokenLanguages.searchPlaceholder')}
              placeholderTextColor={COLORS.textMuted}
              style={styles.search}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <FlatList
              data={options}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item }) => {
                const active = selected.includes(item.code);
                return (
                  <Pressable
                    onPress={() => toggle(item.code)}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {item.label}
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
  wrap: {
    marginBottom: SPACING.md,
  },
  label: {
    color: COLORS.grayLight,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: SPACING.xs,
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
  chipSelected: {},
  chipTextSelected: {
    color: COLORS.goldLight,
    fontSize: 14,
    fontWeight: '700',
  },
  chipRemove: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  empty: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginBottom: SPACING.sm,
  },
  addBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  addBtnText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '78%',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  search: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  list: {
    maxHeight: 360,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  optionActive: {
    backgroundColor: 'rgba(245, 166, 35, 0.08)',
  },
  optionText: {
    fontSize: 15,
    color: COLORS.text,
  },
  optionTextActive: {
    fontWeight: '700',
    color: COLORS.goldLight,
  },
  check: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '800',
  },
  doneBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.input,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.88,
  },
});
