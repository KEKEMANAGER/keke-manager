import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { openAndroidDateTimePicker } from '../lib/androidDateTimePicker';
import { coerceValidDate, formatDisplayDate } from '../lib/dateTime';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';

type Props = {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  placeholder?: string;
  maximumDate?: Date;
};

export function DateOnlyField({
  label,
  value,
  onChange,
  placeholder,
  maximumDate,
}: Props) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('dateOnlyField.default');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => coerceValidDate(value));

  const safeValue =
    value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
  const displayText = safeValue == null ? '' : formatDisplayDate(safeValue);

  function openPicker() {
    if (Platform.OS === 'android') {
      openAndroidDateTimePicker({
        value: safeValue,
        mode: 'date',
        maximumDate,
        onSelect: (picked) => onChange(picked),
      });
      return;
    }
    setDraft(coerceValidDate(safeValue));
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed') {
      closePicker();
      return;
    }
    const picked = coerceValidDate(selected ?? draft);
    setDraft(picked);
    onChange(picked);
    closePicker();
  }

  function confirmIos() {
    onChange(coerceValidDate(draft));
    closePicker();
  }

  const safeMaximumDate =
    maximumDate instanceof Date && !Number.isNaN(maximumDate.getTime())
      ? maximumDate
      : undefined;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={openPicker}
        style={({ pressed }) => [styles.input, pressed && styles.inputPressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={displayText ? styles.valueText : styles.placeholderText}>
          {displayText || resolvedPlaceholder}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' && open ? (
        <View style={styles.pickerSheet}>
          <DateTimePicker
            value={coerceValidDate(draft)}
            mode="date"
            display="spinner"
            maximumDate={safeMaximumDate}
            onChange={onPickerChange}
            themeVariant="light"
          />
          <View style={styles.iosActions}>
            <Pressable onPress={closePicker} style={styles.iosBtnGhost}>
              <Text style={styles.iosBtnGhostText}>{t('dateTimeField.cancel')}</Text>
            </Pressable>
            <Pressable onPress={confirmIos} style={styles.iosBtnPrimary}>
              <Text style={styles.iosBtnPrimaryText}>{t('dateTimeField.done')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
  },
  label: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  inputPressed: {
    borderColor: COLORS.gold,
    opacity: 0.95,
  },
  valueText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  placeholderText: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
  pickerSheet: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  iosActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  iosBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  iosBtnGhostText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  iosBtnPrimary: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  iosBtnPrimaryText: {
    color: '#000000',
    fontWeight: '800',
  },
});
