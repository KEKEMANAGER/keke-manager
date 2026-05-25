import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { filterGeorgianCities } from '../lib/georgianCities';

type Props = {
  label: string;
  value: string | null;
  onChange: (city: string | null) => void;
  disabled?: boolean;
  error?: string | null;
  /** Show "all cities" empty option (for filters). */
  allowEmpty?: boolean;
  emptyLabel?: string;
};

export function SearchableCitySelect({
  label,
  value,
  onChange,
  disabled,
  error,
  allowEmpty = false,
  emptyLabel,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => filterGeorgianCities(query), [query]);
  const displayValue = value?.trim() || (allowEmpty ? emptyLabel ?? t('city.allCities') : t('city.selectCity'));

  function pick(city: string | null) {
    onChange(city);
    setOpen(false);
    setQuery('');
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.webRow}>
          <TextInput
            value={open ? query : value ?? ''}
            onChangeText={(text) => {
              setQuery(text);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setTimeout(() => setOpen(false), 150);
            }}
            editable={!disabled}
            placeholder={t('city.searchPlaceholder')}
            placeholderTextColor={COLORS.textMuted}
            style={[styles.input, error ? styles.inputError : null]}
          />
        </View>
        {open && options.length > 0 ? (
          <View style={styles.webList}>
            {allowEmpty ? (
              <Pressable onPress={() => pick(null)} style={styles.option}>
                <Text style={styles.optionText}>{emptyLabel ?? t('city.allCities')}</Text>
              </Pressable>
            ) : null}
            {options.map((city) => (
              <Pressable key={city} onPress={() => pick(city)} style={styles.option}>
                <Text style={[styles.optionText, value === city && styles.optionTextActive]}>{city}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        disabled={disabled}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.trigger,
          error ? styles.inputError : null,
          disabled && styles.triggerDisabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]} numberOfLines={1}>
          {displayValue}
        </Text>
        <Text style={styles.chevron}>▼</Text>
      </Pressable>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{label}</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('city.searchPlaceholder')}
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              autoFocus
            />
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                allowEmpty ? (
                  <Pressable onPress={() => pick(null)} style={styles.option}>
                    <Text style={styles.optionText}>{emptyLabel ?? t('city.allCities')}</Text>
                  </Pressable>
                ) : null
              }
              renderItem={({ item }) => (
                <Pressable onPress={() => pick(item)} style={styles.option}>
                  <Text style={[styles.optionText, value === item && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              )}
              style={styles.list}
            />
            <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>{t('common.close')}</Text>
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
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input ?? 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    minHeight: 48,
  },
  triggerDisabled: {
    opacity: 0.55,
  },
  triggerText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  triggerPlaceholder: {
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  chevron: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginLeft: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  fieldError: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 4,
  },
  webRow: {
    position: 'relative',
  },
  webList: {
    marginTop: 4,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  optionText: {
    color: COLORS.text,
    fontSize: 16,
  },
  optionTextActive: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: SPACING.sm,
    color: COLORS.text,
  },
  list: {
    maxHeight: 320,
  },
  closeBtn: {
    marginTop: SPACING.md,
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeBtnText: {
    color: COLORS.gold,
    fontWeight: '700',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.9,
  },
});
