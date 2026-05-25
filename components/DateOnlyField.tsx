import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDisplayDate } from '../lib/dateTime';
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
  const [draft, setDraft] = useState<Date>(() => value ?? new Date());

  const displayText = value == null ? '' : formatDisplayDate(value);

  function openPicker() {
    setDraft(value ?? new Date());
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
    const picked = selected ?? draft;
    setDraft(picked);
    if (Platform.OS === 'android') {
      onChange(picked);
      closePicker();
    }
  }

  function confirmIos() {
    onChange(draft);
    closePicker();
  }

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

      {open ? (
        <View style={styles.pickerSheet}>
          <DateTimePicker
            value={draft}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
            maximumDate={maximumDate}
            onChange={onPickerChange}
            themeVariant="light"
          />
          {Platform.OS === 'ios' ? (
            <View style={styles.iosActions}>
              <Pressable onPress={closePicker} style={styles.iosBtnGhost}>
                <Text style={styles.iosBtnGhostText}>{t('dateTimeField.cancel')}</Text>
              </Pressable>
              <Pressable onPress={confirmIos} style={styles.iosBtnPrimary}>
                <Text style={styles.iosBtnPrimaryText}>{t('dateTimeField.done')}</Text>
              </Pressable>
            </View>
          ) : null}
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
