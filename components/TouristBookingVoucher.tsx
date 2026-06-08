import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import type { TourDayPersisted } from '../lib/bookings';
import { bookingKindLabel } from '../lib/bookingLabels';
import { formatLocationRoute, formatLocationDisplay } from '../lib/bookingLocations';
import { formatBookingDisplayNumber, stripVoucherEmojis } from '../lib/bookingVoucherDisplay';
import type { CompanyVoucherData } from '../lib/companyVoucherData';
import { vehicleMakeModelYearLine } from '../lib/companyVoucherData';
import { formatStoredDateForDisplay, parseStoredDateTime } from '../lib/dateTime';
import { countTourOvernights } from '../lib/tourDays';
import {
  touristVoucherDateLocale,
  touristVoucherStrings,
  type TouristVoucherLocale,
} from '../lib/touristVoucherLocale';
import { shareTouristVoucherPDF } from '../lib/voucher';
import { NameWithVerifiedBadge } from './NameWithVerifiedBadge';
import { UserAvatar } from './UserAvatar';

const VOUCHER_LOCATION = { withIcon: false as const };

const LOCALE_OPTIONS: { code: TouristVoucherLocale; labelKey: 'langKa' | 'langEn' | 'langRu' }[] = [
  { code: 'ka', labelKey: 'langKa' },
  { code: 'en', labelKey: 'langEn' },
  { code: 'ru', labelKey: 'langRu' },
];

type Props = {
  data: CompanyVoucherData;
  onClose?: () => void;
  showClose?: boolean;
  topSlot?: ReactNode;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  const clean = stripVoucherEmojis(value);
  if (!clean.trim()) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{clean}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{stripVoucherEmojis(title)}</Text>;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''));
}

function formatDateForLocale(dateDisplay: string | null | undefined, locale: TouristVoucherLocale): string {
  const parsed = parseStoredDateTime(dateDisplay);
  const d = parsed ?? (dateDisplay?.trim() ? new Date(dateDisplay.trim()) : null);
  if (!d || Number.isNaN(d.getTime())) return dateDisplay?.trim() || '—';
  return d.toLocaleString(touristVoucherDateLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TouristBookingVoucherContent({ data, onClose, showClose = true, topSlot }: Props) {
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [locale, setLocale] = useState<TouristVoucherLocale>(() => {
    const code = (i18n.resolvedLanguage || i18n.language || 'ka').split('-')[0]?.toLowerCase();
    if (code === 'en' || code === 'ru') return code;
    return 'ka';
  });
  const [sharing, setSharing] = useState(false);

  const s = touristVoucherStrings(locale);
  const { booking, driver, vehicle } = data;
  const bookingNumber = formatBookingDisplayNumber(booking.id);
  const voucherCode =
    booking.voucher_code?.trim() || `KEKE-${booking.id.slice(0, 6).toUpperCase()}`;
  const isTour = booking.kind === 'tour' || booking.kind === 'day_tour';
  const tourDays = (booking.tour_days ?? []) as TourDayPersisted[];
  const logoUrl = booking.pickup_sign_logo_url?.trim();
  const logoIsPdf = logoUrl ? /\.pdf(\?|$)/i.test(logoUrl) : false;
  const companyName = booking.company_name?.trim() || '—';

  async function onSharePdf() {
    setSharing(true);
    try {
      await shareTouristVoucherPDF(data, locale);
    } finally {
      setSharing(false);
    }
  }

  function callPhone(phone: string) {
    void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  }

  return (
    <View style={styles.root}>
      <View style={styles.brandHeader}>
        {showClose && onClose ? (
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeTop}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </Pressable>
        ) : null}
        <Text style={styles.brandLogo}>KEKE MANAGER</Text>
        <Text style={styles.brandSub}>{s.brandSubtitle}</Text>
        {topSlot}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, SPACING.lg) + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.langRow}>
          <Text style={styles.langLabel}>{s.language}</Text>
          <View style={styles.langPills}>
            {LOCALE_OPTIONS.map(({ code, labelKey }) => {
              const active = locale === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setLocale(code)}
                  style={[styles.langPill, active && styles.langPillActive]}
                >
                  <Text style={[styles.langPillText, active && styles.langPillTextActive]}>
                    {s[labelKey]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.voucherBox, SHADOWS.gold]}>
          <View style={styles.voucherTopRow}>
            <View style={styles.voucherPill}>
              <Text style={styles.voucherPillText}>{s.badge}</Text>
            </View>
          </View>

          <Text style={styles.bookingNumberLine}>
            {stripVoucherEmojis(`${s.bookingNumber} ${bookingNumber}`)}
          </Text>
          <Text style={styles.companyLine}>
            {s.company}: {companyName}
          </Text>
          <Text style={styles.voucherCode}>{voucherCode}</Text>

          <SectionHeader title={s.sectionBooking} />
          <DetailRow
            label={s.type}
            value={bookingKindLabel(booking.kind, booking.flight_direction, locale)}
          />
          <DetailRow label={s.date} value={formatDateForLocale(booking.date_display, locale)} />
          {booking.from_location ? (
            <DetailRow
              label={s.from}
              value={formatLocationDisplay(booking.from_location, booking.from_location_type, VOUCHER_LOCATION)}
            />
          ) : null}
          {booking.to_location ? (
            <DetailRow
              label={s.to}
              value={formatLocationDisplay(booking.to_location, booking.to_location_type, VOUCHER_LOCATION)}
            />
          ) : null}
          <DetailRow label={s.passengers} value={String(booking.passengers ?? 1)} />
          {booking.flight_number?.trim() ? (
            <DetailRow label={s.flightNumber} value={booking.flight_number.trim()} />
          ) : null}
          {booking.sign_text?.trim() ? (
            <DetailRow label={s.pickupSignName} value={booking.sign_text.trim()} />
          ) : null}

          {logoUrl ? (
            <View style={styles.logoBlock}>
              <Text style={styles.logoTitle}>{s.pickupSignLogo}</Text>
              {logoIsPdf ? (
                <Pressable onPress={() => void Linking.openURL(logoUrl)} style={styles.pdfBox}>
                  <Ionicons name="document-text-outline" size={40} color={COLORS.goldDark} />
                  <Text style={styles.pdfHint}>{s.pickupSignPdfHint}</Text>
                </Pressable>
              ) : (
                <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="contain" />
              )}
            </View>
          ) : null}

          {booking.comment?.trim() ? (
            <View style={styles.notesBlock}>
              <Text style={styles.notesTitle}>{s.notes}</Text>
              <Text style={styles.notesBody}>{booking.comment.trim()}</Text>
            </View>
          ) : null}

          {isTour && booking.transfer_in && (booking.transfer_in.airport || booking.transfer_in.hotel) ? (
            <DetailRow
              label={s.transferArrival}
              value={formatLocationRoute(
                booking.transfer_in.airport,
                booking.transfer_in.airport_type,
                booking.transfer_in.hotel,
                booking.transfer_in.hotel_type,
                VOUCHER_LOCATION,
              )}
            />
          ) : null}
          {isTour && booking.transfer_out && (booking.transfer_out.airport || booking.transfer_out.hotel) ? (
            <DetailRow
              label={s.transferDeparture}
              value={formatLocationRoute(
                booking.transfer_out.hotel,
                booking.transfer_out.hotel_type,
                booking.transfer_out.airport,
                booking.transfer_out.airport_type,
                VOUCHER_LOCATION,
              )}
            />
          ) : null}

          {isTour && tourDays.length > 0 ? (
            <View style={styles.tourBlock}>
              <Text style={styles.tourTitle}>{s.tourDays}</Text>
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
                      {interpolate(s.day, { day: d.day })} ·{' '}
                      {formatStoredDateForDisplay(d.date)}
                    </Text>
                    <Text style={styles.tourDayRoute}>
                      {(d.fromPlace || '—').trim()} → {(d.toPlace || '—').trim()}
                    </Text>
                    {stops ? (
                      <Text style={styles.tourDayMeta}>
                        {s.stops}: {stops}
                      </Text>
                    ) : null}
                    {hotel ? (
                      <Text style={styles.tourDayMeta}>
                        {s.hotel}: {hotel}
                      </Text>
                    ) : null}
                    {overnight ? (
                      <Text style={styles.tourDayMeta}>
                        {s.overnight}: {overnight}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              {countTourOvernights(tourDays.length) > 0 ? (
                <Text style={styles.tourNights}>
                  {interpolate(s.totalNightsLine, { count: countTourOvernights(tourDays.length) })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {driver ? (
          <View style={[styles.card, SHADOWS.card]}>
            <SectionHeader title={s.sectionDriver} />
            <View style={styles.driverRow}>
              <UserAvatar name={driver.fullName} uri={driver.avatarUrl} size={56} />
              <View style={styles.driverMeta}>
                <View style={styles.nameRow}>
                  <NameWithVerifiedBadge
                    name={driver.fullName ?? s.sectionDriver}
                    verified={driver.isVerified}
                    isGuide={driver.isGuideDriver}
                    plainGuideBadge
                    textStyle={styles.driverName}
                  />
                </View>
                <Text style={styles.ratingLine}>
                  {driver.ratingCount > 0
                    ? interpolate(s.ratingFormat, {
                        avg: driver.ratingAverage.toFixed(1),
                        count: driver.ratingCount,
                      })
                    : '—'}
                </Text>
                {driver.languagesLabel ? (
                  <Text style={styles.metaLine}>
                    {s.languages}: {driver.languagesLabel}
                  </Text>
                ) : null}
                {driver.city ? (
                  <Text style={styles.metaLine}>
                    {s.city}: {driver.city}
                  </Text>
                ) : null}
                {driver.phone ? (
                  <Pressable onPress={() => callPhone(driver.phone!)}>
                    <Text style={styles.phoneLink}>{driver.phone}</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.metaLine}>{s.phoneMissing}</Text>
                )}
              </View>
            </View>
          </View>
        ) : null}

        {vehicle ? (
          <View style={[styles.card, SHADOWS.card]}>
            <SectionHeader title={s.sectionVehicle} />
            {vehicle.mainPhotoUrl ? (
              <Image source={{ uri: vehicle.mainPhotoUrl }} style={styles.vehicleHero} resizeMode="cover" />
            ) : null}
            <DetailRow label={s.makeModelYear} value={vehicleMakeModelYearLine(vehicle)} />
            {vehicle.plate ? <DetailRow label={s.plate} value={vehicle.plate} /> : null}
            {vehicle.color ? <DetailRow label={s.color} value={vehicle.color} /> : null}
            {vehicle.typeLabel ? <DetailRow label={s.vehicleType} value={vehicle.typeLabel} /> : null}
            {vehicle.classLabel ? <DetailRow label={s.vehicleClass} value={vehicle.classLabel} /> : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footerActions, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
        <Pressable
          onPress={() => void onSharePdf()}
          disabled={sharing}
          style={({ pressed }) => [styles.footerBtn, (pressed || sharing) && styles.pressed]}
        >
          {sharing ? (
            <ActivityIndicator color={COLORS.black} />
          ) : (
            <>
              <Ionicons name="share-outline" size={18} color={COLORS.black} />
              <Text style={styles.footerBtnText}>{s.sharePdf}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  brandHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.black,
  },
  brandLogo: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.gold,
    letterSpacing: 2,
  },
  brandSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  closeTop: { position: 'absolute', right: SPACING.md, top: SPACING.md, zIndex: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, gap: SPACING.md },
  langRow: { gap: SPACING.sm },
  langLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  langPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  langPillActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  langPillText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  langPillTextActive: { color: COLORS.goldDark, fontWeight: '800' },
  voucherBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.gold,
    borderStyle: 'dashed',
    padding: SPACING.md,
  },
  voucherTopRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  voucherPill: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  voucherPillText: { fontSize: 12, fontWeight: '800', color: COLORS.black },
  bookingNumberLine: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  companyLine: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  voucherCode: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.goldDark,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
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
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  driverRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  driverMeta: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  driverName: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  ratingLine: { fontSize: 13, color: COLORS.textSecondary },
  metaLine: { fontSize: 12, color: COLORS.textSecondary },
  phoneLink: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.goldDark,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  vehicleHero: {
    width: '100%',
    height: 160,
    borderRadius: RADIUS.button,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  logoBlock: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.button,
    alignItems: 'center',
  },
  logoTitle: { fontSize: 13, fontWeight: '700', alignSelf: 'stretch', textAlign: 'center' },
  logoImage: { width: '100%', height: 140, borderRadius: 8 },
  pdfBox: { alignItems: 'center', padding: SPACING.md },
  pdfHint: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  notesBlock: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.goldTint,
    borderRadius: RADIUS.button,
  },
  notesTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  notesBody: { fontSize: 13, lineHeight: 18 },
  tourBlock: { marginTop: SPACING.sm },
  tourTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  tourDayCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.button,
    padding: SPACING.sm,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tourDayHead: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark },
  tourDayRoute: { fontSize: 13, marginTop: 4 },
  tourDayMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tourNights: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  footerActions: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
  },
  footerBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.black },
  pressed: { opacity: 0.88 },
});
