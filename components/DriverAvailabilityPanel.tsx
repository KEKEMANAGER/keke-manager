import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SearchableCitySelect } from './SearchableCitySelect';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { setDriverAvailable, setDriverUnavailable } from '../lib/driverAvailability';
import { getSupabaseErrorMessage } from '../lib/errorHandler';

type Props = {
  userId: string | undefined;
  isAvailable: boolean;
  currentCity: string | null;
  onUpdated: () => void | Promise<void>;
};

export function DriverAvailabilityPanel({
  userId,
  isAvailable,
  currentCity,
  onUpdated,
}: Props) {
  const { t } = useTranslation();
  const [city, setCity] = useState(currentCity ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCity(currentCity ?? '');
  }, [currentCity]);

  const runUpdate = useCallback(
    async (nextAvailable: boolean, cityValue: string) => {
      if (!userId) return;
      setSaving(true);
      setError(null);
      const res = nextAvailable
        ? await setDriverAvailable(userId, cityValue)
        : await setDriverUnavailable(userId);
      setSaving(false);
      if (!res.ok) {
        setError(getSupabaseErrorMessage(res.error));
        return;
      }
      await onUpdated();
    },
    [userId, onUpdated],
  );

  function toggleAvailability() {
    if (saving) return;
    if (isAvailable) {
      void runUpdate(false, city);
      return;
    }
    const trimmed = city.trim();
    if (!trimmed) {
      setError(t('driverAvailability.cityRequired'));
      return;
    }
    void runUpdate(true, trimmed);
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggleAvailability}
        disabled={saving || !userId}
        style={({ pressed }) => [
          styles.toggle,
          isAvailable ? styles.toggleOn : styles.toggleOff,
          pressed && styles.pressed,
          saving && styles.toggleDisabled,
        ]}
      >
        {saving ? (
          <ActivityIndicator color={isAvailable ? COLORS.white : COLORS.text} size="small" />
        ) : (
          <>
            <Text style={styles.toggleEmoji}>{isAvailable ? '🟢' : '⚫'}</Text>
            <Text style={[styles.toggleText, isAvailable && styles.toggleTextOn]}>
              {isAvailable ? t('driverAvailability.available') : t('driverAvailability.unavailable')}
            </Text>
          </>
        )}
      </Pressable>

      {isAvailable ? (
        <Text style={styles.activeCityValue}>
          {t('driverAvailability.activeInCity', { city: currentCity?.trim() || city })}
        </Text>
      ) : (
        <SearchableCitySelect
          label={t('driverAvailability.cityLabel')}
          value={city || null}
          onChange={(next) => {
            setCity(next ?? '');
            setError(null);
          }}
          disabled={saving || !userId}
          error={error}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.button,
    marginBottom: SPACING.sm,
  },
  toggleOn: {
    backgroundColor: '#059669',
  },
  toggleOff: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleDisabled: {
    opacity: 0.7,
  },
  toggleEmoji: {
    fontSize: 16,
  },
  toggleText: {
    fontWeight: '800',
    fontSize: 15,
    color: COLORS.text,
  },
  toggleTextOn: {
    color: COLORS.white,
  },
  activeCityValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.88,
  },
});
