import { useCallback, useId, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDisplayDateTime, formatDisplayTime } from '../lib/dateTime';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';

type Props = {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  placeholder?: string;
  mode?: 'datetime' | 'time';
  minimumDate?: Date;
};

function toInputValue(date: Date | null, mode: 'datetime' | 'time'): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  if (mode === 'time') return `${h}:${min}`;
  return `${y}-${m}-${d}T${h}:${min}`;
}

function toMinAttribute(minimumDate: Date | undefined, mode: 'datetime' | 'time'): string | undefined {
  if (!minimumDate) return undefined;
  return toInputValue(minimumDate, mode);
}

function fromInputValue(raw: string, mode: 'datetime' | 'time'): Date | null {
  if (!raw.trim()) return null;
  if (mode === 'time') {
    const [h, min] = raw.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    const d = new Date();
    d.setHours(h, min, 0, 0);
    return d;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function openNativePicker(input: HTMLInputElement | null) {
  if (!input) return;
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
  } catch {
    // Safari / older browsers
  }
  input.click();
}

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();

  const displayText = useMemo(() => {
    if (!value) return '';
    return mode === 'time' ? formatDisplayTime(value) : formatDisplayDateTime(value);
  }, [value, mode]);

  const minAttr = useMemo(() => toMinAttribute(minimumDate, mode), [minimumDate, mode]);

  const handleOpen = useCallback(() => {
    openNativePicker(inputRef.current);
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} nativeID={`${inputId}-label`}>
        {label}
      </Text>
      <Pressable
        onPress={handleOpen}
        style={({ pressed }) => [styles.inputWrap, pressed && styles.inputPressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.valueText, !displayText && styles.placeholderText]}>
          {displayText || resolvedPlaceholder}
        </Text>
      </Pressable>
      {/* Hidden native picker — Pressable triggers showPicker()/click (RN Web blocks overlay taps). */}
      <input
        id={inputId}
        ref={inputRef}
        type={mode === 'time' ? 'time' : 'datetime-local'}
        value={toInputValue(value, mode)}
        min={minAttr}
        aria-labelledby={`${inputId}-label`}
        onChange={(e) => onChange(fromInputValue(e.target.value, mode))}
        style={styles.hiddenInput}
        tabIndex={-1}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
    position: 'relative',
  },
  label: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  inputWrap: {
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
    color: COLORS.textMuted,
    fontWeight: '400',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
    left: -9999,
  } as const,
});
