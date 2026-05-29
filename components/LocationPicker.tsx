import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import {
  LOCATION_TYPE_ICONS,
  LOCATION_TYPES,
  type LocationType,
  type LocationValue,
  locationUsesPresetDropdown,
  presetOptionsForType,
} from '../lib/bookingLocations';

type Props = {
  label: string;
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  /** Restrict which types appear (default: all four). */
  allowedTypes?: LocationType[];
  textPlaceholder?: string;
  presetPlaceholder?: string;
};

export function LocationPicker({
  label,
  value,
  onChange,
  allowedTypes = LOCATION_TYPES,
  textPlaceholder,
  presetPlaceholder,
}: Props) {
  const { t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const types = allowedTypes.length > 0 ? allowedTypes : LOCATION_TYPES;
  const selectedType = value.type && types.includes(value.type) ? value.type : null;
  const presets = selectedType ? presetOptionsForType(selectedType) : [];
  const useDropdown = selectedType ? locationUsesPresetDropdown(selectedType) : false;

  function selectType(type: LocationType) {
    if (value.type === type) return;
    onChange({ type, name: '' });
    setDropdownOpen(false);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.typeRow}>
        {types.map((type) => {
          const active = selectedType === type;
          return (
            <Pressable
              key={type}
              onPress={() => selectType(type)}
              style={({ pressed }) => [
                styles.typeChip,
                active && styles.typeChipActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                {LOCATION_TYPE_ICONS[type]} {t(`locationPicker.types.${type}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!selectedType ? (
        <Text style={styles.hint}>{t('locationPicker.selectTypeHint')}</Text>
      ) : useDropdown ? (
        <>
          <Pressable
            onPress={() => setDropdownOpen((o) => !o)}
            style={({ pressed }) => [styles.ddTrigger, pressed && styles.pressed]}
          >
            <Text style={[styles.ddTriggerText, !value.name.trim() && styles.ddPlaceholder]}>
              {value.name.trim() ||
                presetPlaceholder ||
                t('locationPicker.presetPlaceholder')}
            </Text>
            <Ionicons
              name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.gold}
            />
          </Pressable>
          {dropdownOpen ? (
            <View style={styles.ddList}>
              {presets.map((option) => {
                const active = value.name === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      onChange({ type: selectedType, name: option });
                      setDropdownOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.ddItem,
                      active && styles.ddItemActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.ddItemText, active && styles.ddItemTextActive]}>
                      {LOCATION_TYPE_ICONS[selectedType]} {option}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={16} color={COLORS.gold} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      ) : (
        <TextInput
          value={value.name}
          onChangeText={(name) => onChange({ type: selectedType, name })}
          placeholder={
            textPlaceholder ||
            (selectedType === 'hotel'
              ? t('locationPicker.hotelPlaceholder')
              : t('locationPicker.addressPlaceholder'))
          }
          placeholderTextColor={COLORS.textMuted}
          style={styles.textInput}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: SPACING.md },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  typeChipTextActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  ddTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
  },
  ddTriggerText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    marginRight: 8,
  },
  ddPlaceholder: { color: COLORS.textMuted },
  ddList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
  },
  ddItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  ddItemActive: { backgroundColor: COLORS.goldTint },
  ddItemText: { fontSize: 14, color: COLORS.text, flex: 1 },
  ddItemTextActive: { fontWeight: '700', color: COLORS.text },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  pressed: { opacity: 0.85 },
});
