import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { bookingKindLabel } from '../lib/bookingLabels';
import type { BookingRow, TourDayPersisted } from '../lib/bookings';
import { bookingStatusLabel, formatBookingDate, routeSummary } from '../lib/bookings';
import { formatStoredDateForDisplay } from '../lib/dateTime';
import { countTourOvernights, formatTourBookingNotificationBody } from '../lib/tourDays';
import { shareVoucherPDF } from '../lib/voucher';
import { vehicleClassLabel, vehicleTypeLabel } from '../lib/vehicleCatalog';

type Props = {
  booking: BookingRow | null;
  visible: boolean;
  onClose: () => void;
};

function tourDayRows(booking: BookingRow): TourDayPersisted[] {
  return booking.tour_days ?? [];
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function BookingVoucherModal({ booking, visible, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);

  if (!booking) return null;

  const voucherCode =
    booking.voucher_code?.trim() || `KEKE-${booking.id.slice(0, 6).toUpperCase()}`;
  const isTour = booking.kind === 'tour' || booking.kind === 'day_tour';
  const tourDays = tourDayRows(booking);
  const vehicleLine = [
    booking.vehicle_type ? vehicleTypeLabel(booking.vehicle_type) : null,
    booking.vehicle_class ? vehicleClassLabel(booking.vehicle_class) : null,
    booking.driver_plate?.trim(),
  ]
    .filter(Boolean)
    .join(' · ');

  async function onSharePdf() {
    setSharing(true);
    try {
      await shareVoucherPDF(booking!);
    } finally {
      setSharing(false);
    }
  }

  const signText = booking.sign_text?.trim();
  const logoUrl = booking.pickup_sign_logo_url?.trim();
  const logoIsPdf = logoUrl ? /\.pdf(\?|$)/i.test(logoUrl) : false;

  function onDownloadLogo() {
    if (!logoUrl) return;
    void Linking.openURL(logoUrl);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            SHADOWS.card,
            {
              marginTop: insets.top + SPACING.md,
              marginBottom: Math.max(insets.bottom, SPACING.md),
              maxWidth: Platform.OS === 'web' ? 480 : undefined,
              alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
              width: Platform.OS === 'web' ? '92%' : undefined,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('bookings.voucherModalTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.voucherCode}>{voucherCode}</Text>
            <Text style={styles.statusLine}>{bookingStatusLabel(booking.status)}</Text>

            <DetailRow
              label={t('bookings.voucherCompany')}
              value={booking.company_name?.trim() || t('common.companyDefault')}
            />
            <DetailRow label={t('bookings.voucherDate')} value={formatBookingDate(booking)} />
            <DetailRow
              label={t('bookings.voucherType')}
              value={bookingKindLabel(booking.kind, booking.flight_direction)}
            />
            <DetailRow label={t('bookings.voucherRoute')} value={routeSummary(booking)} />
            {booking.from_location ? (
              <DetailRow label={t('bookings.voucherFrom')} value={booking.from_location} />
            ) : null}
            {booking.to_location ? (
              <DetailRow label={t('bookings.voucherTo')} value={booking.to_location} />
            ) : null}
            <DetailRow
              label={t('bookings.voucherPassengers')}
              value={String(booking.passengers ?? 1)}
            />
            {vehicleLine ? (
              <DetailRow label={t('bookings.voucherVehicle')} value={vehicleLine} />
            ) : null}
            {booking.passenger_name?.trim() ? (
              <DetailRow label={t('bookings.voucherPassengerName')} value={booking.passenger_name} />
            ) : null}
            {booking.flight_number?.trim() ? (
              <DetailRow label={t('bookings.voucherFlight')} value={booking.flight_number} />
            ) : null}

            {signText ? (
              <DetailRow label={t('bookings.voucherPickupSignName')} value={signText} />
            ) : null}

            {logoUrl ? (
              <View style={styles.logoBlock}>
                <Text style={styles.logoTitle}>{t('bookings.voucherPickupSignLogo')}</Text>
                {logoIsPdf ? (
                  <View style={styles.pdfBox}>
                    <Ionicons name="document-text-outline" size={40} color={COLORS.goldDark} />
                    <Text style={styles.pdfHint}>{t('bookings.voucherPickupSignPdfHint')}</Text>
                    <Pressable
                      onPress={onDownloadLogo}
                      style={({ pressed }) => [styles.downloadBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="download-outline" size={18} color={COLORS.black} />
                      <Text style={styles.downloadBtnText}>
                        {t('bookings.voucherDownloadPdf')}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Image
                      source={{ uri: logoUrl }}
                      style={styles.logoImage}
                      resizeMode="contain"
                    />
                    <Pressable
                      onPress={onDownloadLogo}
                      style={({ pressed }) => [styles.downloadBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="download-outline" size={18} color={COLORS.black} />
                      <Text style={styles.downloadBtnText}>
                        {t('bookings.voucherDownloadLogo')}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : null}

            {isTour && tourDays.length > 0 ? (
              <View style={styles.tourBlock}>
                <Text style={styles.tourTitle}>{t('bookings.voucherTourDays')}</Text>
                {tourDays.map((d) => {
                  const hotel =
                    d.touristHotel?.trim() ||
                    (d as { tourist_hotel?: string }).tourist_hotel?.trim() ||
                    '';
                  const overnight =
                    d.driverOvernight?.trim() ||
                    (d as { driver_overnight?: string }).driver_overnight?.trim() ||
                    '';
                  const stops = Array.isArray(d.stops)
                    ? d.stops.filter(Boolean).join(', ')
                    : String(d.stops ?? '').trim();
                  return (
                    <View key={`${d.day}-${d.date}`} style={styles.tourDayCard}>
                      <Text style={styles.tourDayHead}>
                        {t('bookings.voucherDay', { day: d.day })} ·{' '}
                        {formatStoredDateForDisplay(d.date)}
                      </Text>
                      <Text style={styles.tourDayRoute}>
                        {(d.fromPlace || '—').trim()} → {(d.toPlace || '—').trim()}
                      </Text>
                      {stops ? (
                        <Text style={styles.tourDayMeta}>
                          {t('bookings.voucherStops')}: {stops}
                        </Text>
                      ) : null}
                      {hotel ? (
                        <Text style={styles.tourDayMeta}>
                          {t('bookings.voucherHotel')}: {hotel}
                        </Text>
                      ) : null}
                      {overnight ? (
                        <Text style={styles.tourDayMeta}>
                          {t('bookings.voucherOvernight')}: {overnight}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                {countTourOvernights(tourDays.length) > 0 ? (
                  <Text style={styles.tourNights}>
                    {t('bookings.voucherTotalNights', {
                      count: countTourOvernights(tourDays.length),
                    })}
                  </Text>
                ) : null}
              </View>
            ) : isTour ? (
              <Text style={styles.tourFallback}>
                {formatTourBookingNotificationBody({
                  tour_days: booking.tour_days,
                  transfer_in: booking.transfer_in,
                  transfer_out: booking.transfer_out,
                })}
              </Text>
            ) : null}

            {booking.comment?.trim() ? (
              <View style={styles.notesBlock}>
                <Text style={styles.notesTitle}>{t('bookings.voucherNotes')}</Text>
                <Text style={styles.notesBody}>{booking.comment.trim()}</Text>
              </View>
            ) : null}

            <DetailRow
              label={t('bookings.voucherPrice')}
              value={`${Number(booking.price_gel).toLocaleString('ka-GE')} ₾`}
            />
          </ScrollView>

          <Pressable
            onPress={() => void onSharePdf()}
            disabled={sharing}
            style={({ pressed }) => [styles.shareBtn, (pressed || sharing) && styles.pressed]}
          >
            {sharing ? (
              <ActivityIndicator color={COLORS.black} />
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color={COLORS.black} />
                <Text style={styles.shareBtnText}>{t('bookings.voucherSharePdf')}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    flex: Platform.OS === 'web' ? undefined : 1,
    maxHeight: Platform.OS === 'web' ? '85%' : '92%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    borderRadius: Platform.OS === 'web' ? RADIUS.card : 0,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  closeBtn: { padding: 4 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingVertical: SPACING.md, gap: 2 },
  voucherCode: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.goldDark,
    letterSpacing: 1,
    marginBottom: 4,
  },
  statusLine: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  detailLabel: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  detailValue: {
    flex: 1.2,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'right',
  },
  tourBlock: { marginTop: SPACING.sm, gap: SPACING.sm },
  tourTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  tourDayCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.button,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tourDayHead: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark },
  tourDayRoute: { fontSize: 13, color: COLORS.text, marginTop: 4 },
  tourDayMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tourNights: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  tourFallback: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  notesBlock: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.goldTint,
    borderRadius: RADIUS.button,
  },
  notesTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  notesBody: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  logoBlock: {
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  logoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  logoImage: {
    width: '100%',
    maxWidth: 400,
    height: 160,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surfaceAlt,
  },
  pdfBox: {
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
  },
  pdfHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
    marginTop: SPACING.xs,
  },
  downloadBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.black,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gold,
    paddingVertical: 14,
    borderRadius: RADIUS.button,
    marginTop: SPACING.sm,
  },
  shareBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.black },
  pressed: { opacity: 0.88 },
});
