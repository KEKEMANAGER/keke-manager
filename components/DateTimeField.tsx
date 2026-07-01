import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRef, useState } from 'react';
import {
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { openAndroidDateTimeFlow } from '../lib/androidDateTimePicker';
import {
  coerceValidDate,
  formatDisplayDateTime,
  formatDisplayTime,
  mergeDateAndTime,
} from '../lib/dateTime';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';

type PickerStep = 'none' | 'date' | 'time';

type Props = {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  placeholder?: string;
  /** `datetime` = calendar then clock; `time` = clock only */
  mode?: 'datetime' | 'time';
  minimumDate?: Date;
};

export function DateTimeField({
  label,
  value,
  onChange,
  placeholder,
  mode = 'datetime',
  minimumDate,
}: Props) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('dateTimeField.default');
  const [step, setStep] = useState<PickerStep>('none');
  const [draft, setDraft] = useState<Date>(() => coerceValidDate(value));
  /** Date portion kept between iOS date → time steps */
  const datePartRef = useRef<Date>(coerceValidDate(value));

  const safeValue =
    value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;

  const displayText =
    safeValue == null
      ? ''
      : mode === 'time'
        ? formatDisplayTime(safeValue)
        : formatDisplayDateTime(safeValue);

  function finish(next: Date) {
    if (Number.isNaN(next.getTime())) return;
    onChange(next);
    setStep('none');
  }

  function openPicker() {
    const base = coerceValidDate(safeValue);
    datePartRef.current = base;

    if (Platform.OS === 'android') {
      openAndroidDateTimeFlow({
        value: safeValue,
        mode,
        minimumDate,
        onChange: (picked) => finish(picked),
      });
      return;
    }

    setDraft(base);
    setStep(mode === 'time' ? 'time' : 'date');
  }

  function closePicker() {
    setStep('none');
  }

  function openTimeStep(afterDate: Date) {
    datePartRef.current = afterDate;
    const withPreservedTime = safeValue
      ? mergeDateAndTime(afterDate, safeValue)
      : afterDate;
    setDraft(withPreservedTime);
    closePicker();
    InteractionManager.runAfterInteractions(() => {
      setStep('time');
    });
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed') {
      closePicker();
      return;
    }

    const picked = coerceValidDate(selected ?? draft);

    if (step === 'date') {
      datePartRef.current = picked;
      setDraft(picked);
      if (mode === 'datetime') {
        openTimeStep(picked);
      } else {
        finish(picked);
      }
      return;
    }

    const final =
      mode === 'datetime' ? mergeDateAndTime(datePartRef.current, picked) : picked;
    setDraft(final);
    finish(final);
  }

  function confirmIosStep() {
    if (step === 'date' && mode === 'datetime') {
      openTimeStep(draft);
      return;
    }
    const final =
      mode === 'datetime' ? mergeDateAndTime(datePartRef.current, draft) : draft;
    finish(final);
  }

  const safeMinimumDate =
    minimumDate instanceof Date && !Number.isNaN(minimumDate.getTime())
      ? minimumDate
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

      {Platform.OS === 'ios' && step !== 'none' ? (
        <View style={styles.pickerSheet}>
          <DateTimePicker
            value={coerceValidDate(draft)}
            mode={step === 'date' ? 'date' : 'time'}
            display="spinner"
            is24Hour
            minuteInterval={1}
            minimumDate={step === 'date' ? safeMinimumDate : undefined}
            onChange={onPickerChange}
            themeVariant="light"
          />
          <View style={styles.iosActions}>
            <Pressable onPress={closePicker} style={styles.iosBtnGhost}>
              <Text style={styles.iosBtnGhostText}>{t('dateTimeField.cancel')}</Text>
            </Pressable>
            <Pressable onPress={confirmIosStep} style={styles.iosBtnPrimary}>
              <Text style={styles.iosBtnPrimaryText}>
                {step === 'date' && mode === 'datetime'
                  ? t('dateTimeField.nextToTime')
                  : t('dateTimeField.done')}
              </Text>
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
