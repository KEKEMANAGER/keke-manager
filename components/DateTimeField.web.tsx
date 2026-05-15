import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDisplayDateTime, formatDisplayTime } from '../lib/dateTime';
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
  placeholder = 'აირჩიეთ თარიღი და დრო',
  mode = 'datetime',
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const displayText = useMemo(() => {
    if (!value) return '';
    return mode === 'time' ? formatDisplayTime(value) : formatDisplayDateTime(value);
  }, [value, mode]);

  const openNativePicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      el.showPicker();
    } else {
      el.click();
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={openNativePicker}
        style={({ pressed }) => [styles.input, pressed && styles.inputPressed]}
      >
        <Text style={displayText ? styles.valueText : styles.placeholderText}>
          {displayText || placeholder}
        </Text>
      </Pressable>
      {/* Web-only native picker; hidden visually */}
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
      <input
        ref={inputRef}
        type={mode === 'time' ? 'time' : 'datetime-local'}
        value={toInputValue(value, mode)}
        onChange={(e) => onChange(fromInputValue(e.target.value, mode))}
        style={{
          position: 'absolute',
          opacity: 0,
          width: 1,
          height: 1,
          pointerEvents: 'none',
        }}
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
  placeholderText: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
});
