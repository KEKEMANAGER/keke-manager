import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BookingRow } from '../lib/bookings';
import {
  driverPayableGel,
  hasDriverPayoutSnapshot,
  hostNetGel,
  isFleetHostBooking,
  isFleetSubDriverBooking,
} from '../lib/bookingPayout';
import { COLORS } from '../constants/theme';

type Props = {
  booking: BookingRow;
  viewerUserId: string;
  size?: 'md' | 'lg';
};

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

/** Small note under the price telling the driver what it does/doesn't cover. */
function PriceNotes({ booking }: { booking: BookingRow }) {
  const { t } = useTranslation();
  const notes: string[] = [];
  if (booking.price_includes_fuel === false) {
    notes.push(t('bookingPrice.fuelNotIncluded'));
  }
  if (booking.driver_overnight_by === 'company') {
    notes.push(t('bookingPrice.overnightByCompany'));
  } else if (booking.driver_overnight_by === 'keke') {
    notes.push(t('bookingPrice.overnightByKeke'));
  }
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map((note) => (
        <Text key={note} style={styles.subLineMuted}>
          {note}
        </Text>
      ))}
    </>
  );
}

export function BookingPriceDisplay({ booking, viewerUserId, size = 'md' }: Props) {
  const { t } = useTranslation();
  const isSub = isFleetSubDriverBooking(booking, viewerUserId);
  const isHost = isFleetHostBooking(booking, viewerUserId);
  const mainStyle = size === 'lg' ? styles.priceLg : styles.priceMd;

  if (isSub && hasDriverPayoutSnapshot(booking)) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{t('fleet.yourPayLabel')}</Text>
        <Text style={mainStyle} numberOfLines={1}>
          {formatGel(driverPayableGel(booking))}
        </Text>
        <PriceNotes booking={booking} />
      </View>
    );
  }

  if (isHost && hasDriverPayoutSnapshot(booking)) {
    return (
      <View style={styles.wrap}>
        <Text style={mainStyle} numberOfLines={1}>
          {formatGel(Number(booking.price_gel))}
        </Text>
        <Text style={styles.subLine}>
          {t('fleet.driverPayoutLine', { amount: formatGel(driverPayableGel(booking)) })}
        </Text>
        <Text style={styles.subLineMuted}>
          {t('fleet.hostNetLine', { amount: formatGel(hostNetGel(booking)) })}
        </Text>
        <PriceNotes booking={booking} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={mainStyle} numberOfLines={1}>
        {formatGel(Number(booking.price_gel))}
      </Text>
      <PriceNotes booking={booking} />
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The notes under the price are full sentences ("ფასში საწვავი არ შედის —
   * ცალკე ანაზღაურდება"), and a column is as wide as its widest child. Without
   * `flexShrink` this block claimed that whole sentence's width inside a row,
   * pushed itself past the card's edge and took the price with it — a four
   * digit total rendered as "120". Shrinking lets the sentence wrap instead,
   * and the price, held to one line, is never the thing that gives way.
   */
  wrap: { alignItems: 'flex-end', flexShrink: 1, minWidth: 0 },
  label: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  priceMd: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '800',
  },
  priceLg: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '800',
  },
  subLine: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
    textAlign: 'right',
    flexShrink: 1,
  },
  subLineMuted: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'right',
    flexShrink: 1,
  },
});
