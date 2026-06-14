import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import type { BookingRow, TourDayPersisted } from '../lib/bookings';
import { bookingStatusLabel, formatBookingDate } from '../lib/bookings';
import { bookingKindLabel } from '../lib/bookingLabels';
import type { ConvoyPeerLeg } from '../lib/convoyPeers';
import type { CompanyVoucherConvoyLeg, CompanyVoucherData } from '../lib/companyVoucherData';
import {
  convoyVoucherCode,
  enrichCompanyVoucherFromBooking,
  fetchCompanyVoucherData,
  vehicleMakeModelYearLine,
} from '../lib/companyVoucherData';
import { vehicleClassLabel, vehicleTypeLabel } from '../lib/vehicleCatalog';
import { formatStoredDateForDisplay } from '../lib/dateTime';
import { countTourOvernights } from '../lib/tourDays';
import { bookingOfferedPriceGel } from '../lib/bookingPrice';
import { formatLocationRoute, formatLocationDisplay } from '../lib/bookingLocations';
import { formatVoucherPriceGel, stripVoucherEmojis } from '../lib/bookingVoucherDisplay';
import { formatBankAccountForDisplay } from '../lib/bankAccount';
import { shareCompanyVoucherPDF } from '../lib/voucher';
import { BookingPaymentBadge } from './BookingPaymentBadge';
import { BookingOdometerSection, shouldShowBookingOdometer } from './BookingOdometerSection';
import { MeetGreetVoucherSection } from './MeetGreetVoucherSection';
import { NameWithVerifiedBadge } from './NameWithVerifiedBadge';
import { TouristBookingVoucherContent } from './TouristBookingVoucher';
import { UserAvatar } from './UserAvatar';
import { VoucherModeTabs, type VoucherMode } from './VoucherModeTabs';

const VOUCHER_LOCATION = { withIcon: false as const };

type ContentProps = {
  data: CompanyVoucherData;
  onClose?: () => void;
  showClose?: boolean;
  /** False for drivers — operational voucher only; companies keep tourist tab. */
  allowTouristTab?: boolean;
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

type ConvoyLegCardProps = {
  leg: CompanyVoucherConvoyLeg;
  onChat: (driverId: string, driverName: string, bookingId: string) => void;
  onCall: (phone: string) => void;
};

function ConvoyLegVoucherCard({ leg, onChat, onCall }: ConvoyLegCardProps) {
  const { t } = useTranslation();
  const { booking, driver, vehicle } = leg;
  const legPrice = bookingOfferedPriceGel(booking);

  return (
    <View style={styles.convoyLegCard}>
      <Text style={styles.convoyLegTitle}>
        {t('companyVoucher.convoyLegN', { n: leg.legIndex })}
      </Text>
      <DetailRow
        label={t('companyVoucher.vehicleType')}
        value={
          booking.vehicle_type
            ? vehicleTypeLabel(booking.vehicle_type)
            : vehicle?.typeLabel ?? '—'
        }
      />
      <DetailRow
        label={t('companyVoucher.vehicleClass')}
        value={
          booking.vehicle_class
            ? vehicleClassLabel(booking.vehicle_class)
            : vehicle?.classLabel ?? '—'
        }
      />
      <DetailRow label={t('companyVoucher.passengers')} value={String(booking.passengers ?? 1)} />
      <DetailRow
        label={t('companyVoucher.legPrice')}
        value={`${legPrice.toLocaleString('ka-GE')} ₾`}
      />
      <DetailRow label={t('companyVoucher.legStatus')} value={bookingStatusLabel(booking.status)} />

      {driver ? (
        <View style={styles.convoyDriverBlock}>
          <SectionHeader title={t('companyVoucher.sectionDriver')} />
          <View style={styles.driverRow}>
            <UserAvatar name={driver.fullName} uri={driver.avatarUrl} size={48} />
            <View style={styles.driverMeta}>
              <NameWithVerifiedBadge
                name={driver.fullName ?? t('common.driver')}
                verified={driver.isVerified}
                isGuide={driver.isGuideDriver}
                plainGuideBadge
                textStyle={styles.driverName}
              />
              {driver.phone ? (
                <Pressable onPress={() => onCall(driver.phone!)}>
                  <Text style={styles.phoneLink}>{driver.phone}</Text>
                </Pressable>
              ) : (
                <Text style={styles.metaLine}>{t('companyVoucher.phoneMissing')}</Text>
              )}
            </View>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              onPress={() =>
                onChat(driver.userId, driver.fullName ?? t('common.driver'), booking.id)
              }
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            >
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.black} />
              <Text style={styles.actionBtnText}>{t('companyVoucher.chatDriver')}</Text>
            </Pressable>
            {driver.phone ? (
              <Pressable
                onPress={() => onCall(driver.phone!)}
                style={({ pressed }) => [styles.actionBtnOutline, pressed && styles.pressed]}
              >
                <Ionicons name="call-outline" size={16} color={COLORS.goldDark} />
                <Text style={styles.actionBtnOutlineText}>{t('companyVoucher.callDriver')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={styles.convoyPending}>{t('companyVoucher.driverPending')}</Text>
      )}

      {vehicle && (vehicle.plate || vehicle.makeName || vehicle.mainPhotoUrl) ? (
        <View style={styles.convoyVehicleBlock}>
          <SectionHeader title={t('companyVoucher.sectionVehicle')} />
          {vehicle.mainPhotoUrl ? (
            <Image source={{ uri: vehicle.mainPhotoUrl }} style={styles.vehicleHero} resizeMode="cover" />
          ) : null}
          <DetailRow
            label={t('companyVoucher.makeModelYear')}
            value={vehicleMakeModelYearLine(vehicle)}
          />
          {vehicle.plate ? <DetailRow label={t('companyVoucher.plate')} value={vehicle.plate} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function ConvoyPeerLegCard({ leg }: { leg: ConvoyPeerLeg }) {
  const { t } = useTranslation();
  const typeLabel = leg.vehicleTypeLabel ?? leg.vehicleType ?? '—';
  const classLabel = leg.vehicleClassLabel ?? leg.vehicleClass ?? '—';

  return (
    <View style={[styles.convoyLegCard, leg.isOwnLeg && styles.convoyPeerOwn]}>
      <View style={styles.convoyPeerTop}>
        <Text style={styles.convoyLegTitle}>
          {t('companyVoucher.convoyLegN', { n: leg.legIndex })}
        </Text>
        {leg.isOwnLeg ? (
          <Text style={styles.convoyPeerOwnBadge}>{t('companyVoucher.convoyPeerOwnBadge')}</Text>
        ) : null}
      </View>
      <DetailRow label={t('companyVoucher.vehicleType')} value={typeLabel} />
      <DetailRow label={t('companyVoucher.vehicleClass')} value={classLabel} />
      <DetailRow label={t('companyVoucher.passengers')} value={String(leg.passengers)} />
      <DetailRow
        label={t('companyVoucher.sectionDriver')}
        value={leg.driverName ?? t('companyVoucher.driverPending')}
      />
    </View>
  );
}

export function CompanyBookingVoucherContent({
  data,
  onClose,
  showClose = true,
  allowTouristTab = true,
}: ContentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [voucherMode, setVoucherMode] = useState<VoucherMode>('company');

  const { booking, driver, vehicle, host, company, convoyLegs, convoyPeerLegs } = data;
  const isConvoy = !!(booking.is_group_master && convoyLegs && convoyLegs.length > 0);
  const hasConvoyPeers = !!(convoyPeerLegs && convoyPeerLegs.length > 0);

  if (allowTouristTab && !isConvoy && voucherMode === 'tourist') {
    return (
      <TouristBookingVoucherContent
        data={data}
        onClose={onClose}
        showClose={showClose}
        voucherMode={voucherMode}
        onVoucherModeChange={setVoucherMode}
      />
    );
  }

  const viewerId = String(user?.id ?? '').trim();
  // Driver/host viewer sees the company card instead of their own driver card.
  const isCompanyViewer = !viewerId || viewerId === String(booking.company_id ?? '').trim();
  const isHostViewer = !!viewerId && viewerId === String(booking.host_driver_id ?? '').trim();
  const offeredGel = bookingOfferedPriceGel(booking);
  const voucherCode = isConvoy
    ? convoyVoucherCode(booking)
    : booking.group_code?.trim() ||
      booking.voucher_code?.trim() ||
      `KEKE-${booking.id.slice(0, 6).toUpperCase()}`;
  const isTour = booking.kind === 'tour' || booking.kind === 'day_tour';
  const tourDays = (booking.tour_days ?? []) as TourDayPersisted[];

  async function onPdf() {
    setSharing(true);
    try {
      await shareCompanyVoucherPDF(data);
    } finally {
      setSharing(false);
    }
  }

  async function onPrint() {
    setPrinting(true);
    try {
      await shareCompanyVoucherPDF(data);
    } finally {
      setPrinting(false);
    }
  }

  function openChat(
    peerId: string,
    peerName: string,
    threadType: 'company_driver' | 'company_host',
    targetBookingId?: string,
  ) {
    router.push({
      pathname: '/(app)/chat',
      params: {
        uid: peerId,
        name: peerName,
        bookingId: targetBookingId ?? booking.id,
        threadType,
        senderRole: 'company',
        receiverRole: threadType === 'company_host' ? 'host' : 'driver',
      },
    });
    onClose?.();
  }

  function callPhone(phone: string) {
    void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  }

  function openCompanyChat() {
    if (!company) return;
    router.push({
      pathname: '/(driver)/chat',
      params: {
        uid: company.userId,
        name: company.name ?? t('companyVoucher.sectionCompany'),
        bookingId: booking.id,
        threadType: isHostViewer ? 'company_host' : 'company_driver',
        senderRole: isHostViewer ? 'host' : 'driver',
        receiverRole: 'company',
      },
    });
    onClose?.();
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
        <Text style={styles.brandSub}>{t('companyVoucher.brandSubtitle')}</Text>
        {allowTouristTab ? (
          <VoucherModeTabs mode={voucherMode} onChange={setVoucherMode} />
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, SPACING.lg) + 80 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.voucherBox, SHADOWS.gold]}>
          <Text style={styles.priceOfferLine}>
            {stripVoucherEmojis(`${t('companyVoucher.price')}: ${formatVoucherPriceGel(offeredGel)}`)}
          </Text>

          {booking.driver_update_pending ? (
            <View style={styles.voucherTopRow}>
              <View style={styles.updatedPill}>
                <Text style={styles.updatedPillText}>
                  {t('companyVoucher.updated')}{' '}
                  {formatStoredDateForDisplay(
                    booking.updated_at?.slice(0, 10) ?? booking.created_at.slice(0, 10),
                  )}
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.voucherCode}>{voucherCode}</Text>
          {isConvoy ? (
            <Text style={styles.convoySummary}>
              {t('companyVoucher.convoySummary', {
                count: convoyLegs!.length,
                passengers: booking.passengers ?? 1,
              })}
            </Text>
          ) : hasConvoyPeers ? (
            <Text style={styles.convoySummary}>
              {t('companyVoucher.convoyPeerSummary', { count: convoyPeerLegs!.length })}
            </Text>
          ) : null}
          <Text style={styles.statusLine}>{stripVoucherEmojis(bookingStatusLabel(booking.status))}</Text>
          {booking.status === 'completed' ? (
            <View style={styles.paymentBadgeWrap}>
              <BookingPaymentBadge
                paymentStatus={booking.payment_status}
                bookingStatus={booking.status}
              />
            </View>
          ) : null}

          <SectionHeader title={t('companyVoucher.sectionBooking')} />
          <DetailRow label={t('companyVoucher.type')} value={bookingKindLabel(booking.kind, booking.flight_direction)} />
          <DetailRow label={t('companyVoucher.date')} value={formatBookingDate(booking)} />
          {booking.from_location ? (
            <DetailRow
              label={t('companyVoucher.from')}
              value={formatLocationDisplay(booking.from_location, booking.from_location_type, VOUCHER_LOCATION)}
            />
          ) : null}
          {booking.to_location ? (
            <DetailRow
              label={t('companyVoucher.to')}
              value={formatLocationDisplay(booking.to_location, booking.to_location_type, VOUCHER_LOCATION)}
            />
          ) : null}
          <DetailRow label={t('companyVoucher.passengers')} value={String(booking.passengers ?? 1)} />
          {booking.flight_number?.trim() ? (
            <DetailRow
              label={t('companyVoucher.flightNumber')}
              value={booking.flight_number.trim()}
            />
          ) : null}

          <MeetGreetVoucherSection
            booking={booking}
            sectionTitle={t('bookings.voucherMeetGreetSection')}
            passengerNameLabel={t('companyVoucher.passengerName')}
            passengerPhoneLabel={t('companyVoucher.passengerPhone')}
            pickupSignNameLabel={t('bookings.voucherPickupSignName')}
            pickupSignLogoLabel={t('bookings.voucherPickupSignLogo')}
            pickupSignPdfHint={t('bookings.voucherPickupSignPdfHint')}
          />

          {booking.comment?.trim() ? (
            <View style={styles.notesBlock}>
              <Text style={styles.notesTitle}>{t('bookings.voucherNotes')}</Text>
              <Text style={styles.notesBody}>{booking.comment.trim()}</Text>
            </View>
          ) : null}

          {isTour && booking.transfer_in && (booking.transfer_in.airport || booking.transfer_in.hotel) ? (
            <DetailRow
              label={t('newBooking.form.transferArrivalSection')}
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
              label={t('newBooking.form.transferDepartureSection')}
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
          ) : null}
        </View>

        {!isCompanyViewer && company ? (
          <View style={[styles.card, SHADOWS.card]}>
            <SectionHeader title={t('companyVoucher.sectionCompany')} />
            <View style={styles.driverRow}>
              <UserAvatar name={company.name} uri={company.avatarUrl} size={56} />
              <View style={styles.driverMeta}>
                <View style={styles.nameRow}>
                  <NameWithVerifiedBadge
                    name={company.name ?? t('companyVoucher.sectionCompany')}
                    verified={company.isVerified}
                    textStyle={styles.driverName}
                  />
                </View>
                {company.phone ? (
                  <Pressable onPress={() => callPhone(company.phone!)}>
                    <Text style={styles.phoneLink}>{company.phone}</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.metaLine}>{t('companyVoucher.phoneMissing')}</Text>
                )}
              </View>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                onPress={openCompanyChat}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chatbubble-outline" size={16} color={COLORS.black} />
                <Text style={styles.actionBtnText}>{t('companyVoucher.chatCompany')}</Text>
              </Pressable>
              {company.phone ? (
                <Pressable
                  onPress={() => callPhone(company.phone!)}
                  style={({ pressed }) => [styles.actionBtnOutline, pressed && styles.pressed]}
                >
                  <Ionicons name="call-outline" size={16} color={COLORS.goldDark} />
                  <Text style={styles.actionBtnOutlineText}>{t('companyVoucher.callCompany')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {isCompanyViewer && isConvoy ? (
          <View style={[styles.card, SHADOWS.card]}>
            <SectionHeader
              title={t('companyVoucher.convoyVehicles', { count: convoyLegs!.length })}
            />
            {convoyLegs!.map((leg) => (
              <ConvoyLegVoucherCard
                key={leg.booking.id}
                leg={leg}
                onChat={(driverId, driverName, legBookingId) =>
                  openChat(driverId, driverName, 'company_driver', legBookingId)
                }
                onCall={callPhone}
              />
            ))}
          </View>
        ) : null}

        {!isCompanyViewer && hasConvoyPeers ? (
          <View style={[styles.card, SHADOWS.card]}>
            <SectionHeader
              title={t('companyVoucher.convoyPeersTitle', { count: convoyPeerLegs!.length })}
            />
            <Text style={styles.convoyPeerHint}>{t('companyVoucher.convoyPeerHint')}</Text>
            {convoyPeerLegs!.map((leg) => (
              <ConvoyPeerLegCard key={leg.legBookingId} leg={leg} />
            ))}
          </View>
        ) : null}

        {isCompanyViewer && !isConvoy && driver ? (
          <View style={[styles.card, SHADOWS.card]}>
            <SectionHeader title={t('companyVoucher.sectionDriver')} />
            <View style={styles.driverRow}>
              <UserAvatar name={driver.fullName} uri={driver.avatarUrl} size={56} />
              <View style={styles.driverMeta}>
                <View style={styles.nameRow}>
                  <NameWithVerifiedBadge
                    name={driver.fullName ?? t('common.driver')}
                    verified={driver.isVerified}
                    isGuide={driver.isGuideDriver}
                    plainGuideBadge
                    textStyle={styles.driverName}
                  />
                </View>
                <Text style={styles.ratingLine}>
                  {driver.ratingCount > 0
                    ? t('company.ratingFormat', {
                        avg: driver.ratingAverage.toFixed(1),
                        count: driver.ratingCount,
                      })
                    : '—'}
                </Text>
                {driver.languagesLabel ? (
                  <Text style={styles.metaLine}>
                    {t('companyVoucher.languages')}: {driver.languagesLabel}
                  </Text>
                ) : null}
                {driver.city ? (
                  <Text style={styles.metaLine}>
                    {t('companyVoucher.city')}: {driver.city}
                  </Text>
                ) : null}
                {driver.phone ? (
                  <Pressable onPress={() => callPhone(driver.phone!)}>
                    <Text style={styles.phoneLink}>{driver.phone}</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.metaLine}>{t('companyVoucher.phoneMissing')}</Text>
                )}
                {booking.status === 'completed' ? (
                  driver.bankAccount ? (
                    <Text style={styles.ibanLine}>
                      {t('bookingPayment.ibanLabel')}: {formatBankAccountForDisplay(driver.bankAccount)}
                    </Text>
                  ) : (
                    <Text style={styles.metaLine}>{t('bookingPayment.ibanMissing')}</Text>
                  )
                ) : null}
              </View>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() =>
                  openChat(driver.userId, driver.fullName ?? t('common.driver'), 'company_driver')
                }
                style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chatbubble-outline" size={16} color={COLORS.black} />
                <Text style={styles.actionBtnText}>{t('companyVoucher.chatDriver')}</Text>
              </Pressable>
              {driver.phone ? (
                <Pressable
                  onPress={() => callPhone(driver.phone!)}
                  style={({ pressed }) => [styles.actionBtnOutline, pressed && styles.pressed]}
                >
                  <Ionicons name="call-outline" size={16} color={COLORS.goldDark} />
                  <Text style={styles.actionBtnOutlineText}>{t('companyVoucher.callDriver')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {shouldShowBookingOdometer(booking) ? (
          <View style={[styles.card, SHADOWS.card]}>
            <BookingOdometerSection booking={booking} />
          </View>
        ) : null}

        {!isConvoy && vehicle ? (
          <View style={[styles.card, SHADOWS.card]}>
            <SectionHeader title={t('companyVoucher.sectionVehicle')} />
            {vehicle.mainPhotoUrl ? (
              <Image source={{ uri: vehicle.mainPhotoUrl }} style={styles.vehicleHero} resizeMode="cover" />
            ) : null}
            {vehicle.photoUrls.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                {vehicle.photoUrls.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.thumb} resizeMode="cover" />
                ))}
              </ScrollView>
            ) : null}
            <DetailRow
              label={t('companyVoucher.makeModelYear')}
              value={vehicleMakeModelYearLine(vehicle)}
            />
            {vehicle.plate ? <DetailRow label={t('companyVoucher.plate')} value={vehicle.plate} /> : null}
            {vehicle.color ? <DetailRow label={t('companyVoucher.color')} value={vehicle.color} /> : null}
            {vehicle.typeLabel ? <DetailRow label={t('companyVoucher.vehicleType')} value={vehicle.typeLabel} /> : null}
            {vehicle.classLabel ? <DetailRow label={t('companyVoucher.vehicleClass')} value={vehicle.classLabel} /> : null}
          </View>
        ) : null}

        {isCompanyViewer && !isConvoy && host ? (
          <View style={[styles.card, SHADOWS.card]}>
            <SectionHeader title={t('companyVoucher.sectionHost')} />
            <DetailRow label={t('companyVoucher.hostName')} value={host.fullName ?? '—'} />
            {host.phone ? (
              <Pressable onPress={() => callPhone(host.phone!)}>
                <DetailRow label={t('companyVoucher.hostPhone')} value={host.phone} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() =>
                openChat(host.userId, host.fullName ?? t('companyVoucher.host'), 'company_host')
              }
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            >
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.black} />
              <Text style={styles.actionBtnText}>{t('companyVoucher.chatHost')}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footerActions, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
        <Pressable
          onPress={() => void onPdf()}
          disabled={sharing}
          style={({ pressed }) => [styles.footerBtn, (pressed || sharing) && styles.pressed]}
        >
          {sharing ? (
            <ActivityIndicator color={COLORS.black} />
          ) : (
            <>
              <Ionicons name="document-outline" size={18} color={COLORS.black} />
              <Text style={styles.footerBtnText}>{t('companyVoucher.downloadPdf')}</Text>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={() => void onPrint()}
          disabled={printing}
          style={({ pressed }) => [styles.footerBtnOutline, (pressed || printing) && styles.pressed]}
        >
          {printing ? (
            <ActivityIndicator color={COLORS.goldDark} />
          ) : (
            <>
              <Ionicons name="print-outline" size={18} color={COLORS.goldDark} />
              <Text style={styles.footerBtnOutlineText}>{t('companyVoucher.print')}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

type ModalProps = {
  booking: BookingRow | null;
  visible: boolean;
  onClose: () => void;
};

export function CompanyBookingVoucherModal({ booking, visible, onClose }: ModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CompanyVoucherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!booking?.id) return;
    setLoading(true);
    setError(null);
    const res = user?.id
      ? await fetchCompanyVoucherData(booking.id, user.id, user.id)
      : await enrichCompanyVoucherFromBooking(booking);
    setLoading(false);
    if (res.error) setError(res.error.message);
    setData(res.data ?? null);
  }, [booking, user?.id]);

  useEffect(() => {
    if (visible && booking) {
      void load();
    } else {
      setData(null);
      setError(null);
    }
  }, [visible, booking, load]);

  if (!booking) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.modalSheet,
            {
              marginTop: insets.top + SPACING.sm,
              marginBottom: Math.max(insets.bottom, SPACING.sm),
              maxWidth: Platform.OS === 'web' ? 520 : undefined,
              alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
              width: Platform.OS === 'web' ? '94%' : undefined,
              maxHeight: Platform.OS === 'web' ? '92%' : '96%',
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.gold} style={{ margin: 48 }} />
          ) : data ? (
            <CompanyBookingVoucherContent data={data} onClose={onClose} />
          ) : (
            <Text style={styles.errorText}>{error ?? t('companyVoucher.loadError')}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Web: modal; native: full-screen route. */
export function openCompanyVoucher(
  router: { push: (href: string) => void },
  bookingId: string,
  setModalBooking?: (b: BookingRow | null) => void,
  booking?: BookingRow,
) {
  if (Platform.OS === 'web' && setModalBooking && booking) {
    setModalBooking(booking);
    return;
  }
  router.push(`/(app)/company-voucher/${encodeURIComponent(bookingId)}`);
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
  updatedPill: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  updatedPillText: { fontSize: 11, fontWeight: '700', color: '#B91C1C' },
  bookingNumberLine: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  priceOfferLine: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.success,
    marginBottom: SPACING.sm,
  },
  voucherCode: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.goldDark,
    marginTop: SPACING.sm,
    letterSpacing: 1,
  },
  bookingIdLine: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  statusLine: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  paymentBadgeWrap: { marginBottom: SPACING.sm },
  ibanLine: { fontSize: 13, color: COLORS.text, marginTop: 4 },
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
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.black },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
  },
  actionBtnOutlineText: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark },
  vehicleHero: {
    width: '100%',
    height: 160,
    borderRadius: RADIUS.button,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  photoStrip: { marginBottom: SPACING.sm },
  thumb: {
    width: 88,
    height: 64,
    borderRadius: 8,
    marginRight: 8,
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
  convoySummary: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.goldDark,
    textAlign: 'center',
    marginBottom: 6,
  },
  convoyLegCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.background,
  },
  convoyLegTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.goldDark,
    marginBottom: SPACING.sm,
  },
  convoyPeerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  convoyPeerOwn: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  convoyPeerOwnBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.goldDark,
    textTransform: 'uppercase',
  },
  convoyPeerHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 17,
  },
  convoyPending: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
  },
  convoyDriverBlock: { marginTop: SPACING.sm },
  convoyVehicleBlock: { marginTop: SPACING.sm },
  footerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
  },
  footerBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.black },
  footerBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
  },
  footerBtnOutlineText: { fontSize: 14, fontWeight: '800', color: COLORS.goldDark },
  pressed: { opacity: 0.88 },
  modalOverlay: {
    flex: 1,
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
  },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: {
    flex: Platform.OS === 'web' ? undefined : 1,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  errorText: { padding: SPACING.lg, textAlign: 'center', color: COLORS.textSecondary },
});
