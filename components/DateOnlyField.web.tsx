import { createElement, useCallback, useId } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

function toInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromInputValue(raw: string): Date | null {
  if (!raw.trim()) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function DateOnlyField({
  label,
  value,
  onChange,
  placeholder,
  maximumDate,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const resolvedPlaceholder = placeholder ?? t('dateOnlyField.default');
  const displayText = value == null ? '' : formatDisplayDate(value);

  const onNativeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(fromInputValue(e.target.value));
    },
    [onChange],
  );

  const inputStyle: CSSProperties = {
    position: 'absolute',
    opacity: 0,
    width: '100%',
    height: '100%',
    inset: 0,
    cursor: 'pointer',
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.input}>
        {createElement('input', {
          id,
          type: 'date',
          value: toInputValue(value),
          max: maximumDate ? toInputValue(maximumDate) : undefined,
          onChange: onNativeChange,
          style: inputStyle,
          'aria-label': label,
        })}
        <Text style={displayText ? styles.valueText : styles.placeholderText}>
          {displayText || resolvedPlaceholder}
        </Text>
      </View>
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
    position: 'relative',
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
});
