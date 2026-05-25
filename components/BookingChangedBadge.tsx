import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import type { BookingRow } from '../lib/bookings';
import { acknowledgeBookingUpdate } from '../lib/bookingUpdate';
import { useAuth } from '../contexts/AuthContext';

type Props = {
  booking: BookingRow;
  onAcknowledged?: () => void;
};

export function BookingChangedBadge({ booking, onAcknowledged }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!booking.driver_update_pending) return null;

  const summary = booking.update_change_summary;
  const lines = summary ? Object.values(summary).slice(0, 5) : [];

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t('bookings.updatedBadge')}</Text>
      {lines.map((line, idx) => (
        <Text key={`${line.label}-${idx}`} style={styles.line}>
          {line.label}: <Text style={styles.old}>{line.old}</Text> →{' '}
          <Text style={styles.newVal}>{line.new}</Text>
        </Text>
      ))}
      <Pressable
        onPress={() => {
          if (!user?.id) return;
          void acknowledgeBookingUpdate(booking.id, user.id).then(() => onAcknowledged?.());
        }}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <Text style={styles.btnText}>{t('bookings.ackUpdate')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: '#FEF2F2',
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.error,
  },
  line: {
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 18,
  },
  old: { textDecorationLine: 'line-through', color: COLORS.textSecondary },
  newVal: { fontWeight: '700', color: COLORS.text },
  btn: {
    marginTop: SPACING.xs,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gold,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
  },
  btnPressed: { opacity: 0.9 },
  btnText: { fontWeight: '700', fontSize: 13, color: COLORS.black },
});
