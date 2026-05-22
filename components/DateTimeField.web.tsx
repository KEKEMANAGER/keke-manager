import { useMemo, useRef } from 'react';
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

export function DateTimeField({
  label,
  value,
  onChange,
  placeholder,
  mode = 'datetime',
}: Props) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('dateTimeField.default');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const displayText = useMemo(() => {
    if (!value) return '';
    return mode === 'time' ? formatDisplayTime(value) : formatDisplayDateTime(value);
  }, [value, mode]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Text style={[styles.valueText_abs, displayText ? styles.valueText : styles.placeholderText]}>
          {displayText || resolvedPlaceholder}
        </Text>
        <input
          ref={inputRef}
          type={mode === 'time' ? 'time' : 'datetime-local'}
          value={toInputValue(value, mode)}
          onChange={(e) => onChange(fromInputValue(e.target.value, mode))}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            zIndex: 1,
          }}
        />
      </View>
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
  },
  valueText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  inputWrap: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  valueText_abs: {
    fontSize: 16,
    fontWeight: '500',
    pointerEvents: 'none',
  },
  placeholderText: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
});
