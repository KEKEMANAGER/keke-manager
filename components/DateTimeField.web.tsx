import { createElement, useCallback, useId, useMemo } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

function openPicker(el: HTMLInputElement) {
  try {
    if (typeof el.showPicker === 'function') {
      el.showPicker();
      return;
    }
  } catch {
    // Safari may throw without a direct user gesture
  }
  el.focus();
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
  const inputId = useId();

  const inputValue = useMemo(() => toInputValue(value, mode), [value, mode]);
  const minAttr = useMemo(() => toMinAttribute(minimumDate, mode), [minimumDate, mode]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(fromInputValue(e.target.value, mode));
    },
    [mode, onChange],
  );

  const handleActivate = useCallback((e: { currentTarget: HTMLInputElement }) => {
    openPicker(e.currentTarget);
  }, []);

  const inputStyle = useMemo((): CSSProperties => {
    const hasValue = Boolean(inputValue);
    return {
      width: '100%',
      boxSizing: 'border-box',
      display: 'block',
      margin: 0,
      backgroundColor: COLORS.white,
      border: '1px solid #E5E7EB',
      borderRadius: RADIUS.input,
      padding: '14px 16px',
      minHeight: 48,
      fontSize: 16,
      fontWeight: hasValue ? 500 : 400,
      color: hasValue ? COLORS.text : COLORS.textMuted,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      cursor: 'pointer',
      WebkitAppearance: 'none',
      appearance: 'none',
    };
  }, [inputValue]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} nativeID={`${inputId}-label`}>
        {label}
      </Text>
      {createElement('input', {
        id: inputId,
        type: mode === 'time' ? 'time' : 'datetime-local',
        value: inputValue,
        min: minAttr,
        'aria-label': label,
        'aria-labelledby': `${inputId}-label`,
        title: resolvedPlaceholder,
        onChange: handleChange,
        onClick: handleActivate,
        onFocus: handleActivate,
        style: inputStyle,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
    width: '100%',
  },
  label: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
});
