import { Image, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AuthInput } from '../AuthInput';
import { formatDisplayDateTime } from '../../lib/dateTime';
import { formatLocationDisplay } from '../../lib/bookingLocations';
import type { PickupSignLogoFile } from '../../lib/bookings';
import {
  countTourOvernights,
  type TourDayForm,
} from '../../lib/tourDays';
import type { ServiceFlags } from '../../lib/bookingCompose';
import {
  isPureArrivalTransfer,
  isPureDepartureTransfer,
  isPureTransfer,
  serviceSummaryLabel,
} from '../../lib/bookingCompose';
import { formatLocationRoute, type LocationValue } from '../../lib/bookingLocations';
import { isPickupSignLogoPdf } from '../../lib/pickupSignLogo';
import {
  vehicleClassLabel,
  vehicleTypeLabel,
  type VehicleClassCode,
  type VehicleTypeCode,
} from '../../lib/vehicleCatalog';
import { SHADOWS } from '../../constants/theme';

type PaymentWhen = 'now' | 'later' | 'clientCard';

type Props = {
  flags: ServiceFlags;
  companyName: string;
  operatorName: string | null;
  previewVoucherId: string;
  selectedVehicleType: VehicleTypeCode;
  vehicleClass: VehicleClassCode;
  transferInDateTime: Date | null;
  transferInAirportLoc: LocationValue;
  transferInHotelLoc: LocationValue;
  arrivalFlightNo: string;
  transferOutDateTime: Date | null;
  transferOutHotelLoc: LocationValue;
  transferOutAirportLoc: LocationValue;
  departureFlightNo: string;
  tourStartDate: Date | null;
  tourEndDate: Date | null;
  tourDays: TourDayForm[];
  passengerName: string;
  meetGreet: boolean;
  signText: string;
  pickupSignLogo: PickupSignLogoFile | null;
  pax: number;
  paymentWhen: PaymentWhen;
  paymentLabel: (when: PaymentWhen) => string;
  clientPriceStr: string;
  onClientPriceStrChange: (v: string) => void;
  driverOfferGel: number;
  offeredGelParsed: number;
  formatGel: (n: number) => string;
  paymentOptions: PaymentWhen[];
  onPaymentWhenChange: (p: PaymentWhen) => void;
  styles: Record<string, object>;
};

export function BookingSummaryStep({
  flags,
  companyName,
  operatorName,
  previewVoucherId,
  selectedVehicleType,
  vehicleClass,
  transferInDateTime,
  transferInAirportLoc,
  transferInHotelLoc,
  arrivalFlightNo,
  transferOutDateTime,
  transferOutHotelLoc,
  transferOutAirportLoc,
  departureFlightNo,
  tourStartDate,
  tourEndDate,
  tourDays,
  passengerName,
  meetGreet,
  signText,
  pickupSignLogo,
  pax,
  paymentWhen,
  paymentLabel,
  clientPriceStr,
  onClientPriceStrChange,
  driverOfferGel,
  offeredGelParsed,
  formatGel,
  paymentOptions,
  onPaymentWhenChange,
  styles,
}: Props) {
  const { t } = useTranslation();
  const tourOvernightCount = countTourOvernights(tourDays.length);
  const pureArrival = isPureArrivalTransfer(flags);
  const pureDeparture = isPureDepartureTransfer(flags);
  const pureTransfer = isPureTransfer(flags);

  return (
    <View>
      <Text style={styles.sectionHeader as object}>{t('newBooking.form.prices')}</Text>
      <AuthInput
        label={t('newBooking.form.offeredPrice')}
        value={clientPriceStr}
        onChangeText={onClientPriceStrChange}
        keyboardType="decimal-pad"
        placeholder={t('newBooking.form.placeholders.zero')}
      />
      <View style={styles.priceBox as object}>
        <Text style={styles.priceLabel as object}>{t('newBooking.form.offeredPriceDriver')}</Text>
        <Text style={styles.priceBig as object}>{formatGel(driverOfferGel)}</Text>
        {offeredGelParsed <= 0 ? (
          <Text style={styles.priceNote as object}>
            {t('newBooking.form.offeredPriceRequiredHint')}
          </Text>
        ) : (
          <Text style={styles.priceNote as object}>{t('newBooking.form.offeredPriceSameNote')}</Text>
        )}
      </View>
      <Text style={styles.fieldLabel as object}>{t('newBooking.form.paymentMethod')}</Text>
      {paymentOptions.map((p) => (
        <Pressable
          key={p}
          onPress={() => onPaymentWhenChange(p)}
          style={[styles.payRow as object, paymentWhen === p && styles.payRowActive]}
        >
          <Text style={[styles.payText as object, paymentWhen === p && styles.payTextActive]}>
            {paymentLabel(p)}
          </Text>
        </Pressable>
      ))}
      <View style={[styles.voucher as object, SHADOWS.gold, styles.voucherSpaced as object]}>
        <Text style={styles.voucherTitle as object}>{t('newBooking.form.voucherTitle')}</Text>
        <Text style={styles.voucherId as object}>{previewVoucherId}</Text>
        <View style={styles.vDivider as object} />
        <Text style={styles.vLine as object}>
          {t('newBooking.form.voucherCompany')}: {companyName}
        </Text>
        {operatorName?.trim() ? (
          <Text style={styles.vLine as object}>
            {t('newBooking.form.voucherOperator')}: {operatorName.trim()}
          </Text>
        ) : null}
        <Text style={styles.vLine as object}>
          {t('newBooking.form.voucherType')}: {serviceSummaryLabel(flags, t)}
        </Text>
        <Text style={styles.vLine as object}>
          {t('newBooking.form.voucherVehicle')}: {vehicleTypeLabel(selectedVehicleType)}
        </Text>
        <Text style={styles.vLine as object}>
          {t('newBooking.form.voucherClass')}: {vehicleClassLabel(vehicleClass)}
        </Text>

        {pureArrival ? (
          <>
            <Text style={styles.vLine as object}>{t('newBooking.form.voucherArrival')}</Text>
            <Text style={styles.vLine as object}>
              {formatLocationRoute(
                transferInAirportLoc.name,
                transferInAirportLoc.type,
                transferInHotelLoc.name,
                transferInHotelLoc.type,
              )}
            </Text>
            {transferInDateTime ? (
              <Text style={styles.vLine as object}>{formatDisplayDateTime(transferInDateTime)}</Text>
            ) : null}
            {arrivalFlightNo.trim() ? (
              <Text style={styles.vLineMuted as object}>
                {t('companyVoucher.flightNumber')}: {arrivalFlightNo.trim()}
              </Text>
            ) : null}
          </>
        ) : null}

        {pureDeparture ? (
          <>
            <Text style={styles.vLine as object}>{t('newBooking.form.voucherDeparture')}</Text>
            <Text style={styles.vLine as object}>
              {formatLocationRoute(
                transferOutHotelLoc.name,
                transferOutHotelLoc.type,
                transferOutAirportLoc.name,
                transferOutAirportLoc.type,
              )}
            </Text>
            {transferOutDateTime ? (
              <Text style={styles.vLine as object}>{formatDisplayDateTime(transferOutDateTime)}</Text>
            ) : null}
            {departureFlightNo.trim() ? (
              <Text style={styles.vLineMuted as object}>
                {t('companyVoucher.flightNumber')}: {departureFlightNo.trim()}
              </Text>
            ) : null}
          </>
        ) : null}

        {!pureTransfer && flags.wantArrivalTransfer ? (
          <Text style={styles.vLineMuted as object}>
            {t('newBooking.form.voucherTransferInRoute', {
              datetime: transferInDateTime ? formatDisplayDateTime(transferInDateTime) : '—',
              from: formatLocationDisplay(transferInAirportLoc.name, transferInAirportLoc.type),
              to: formatLocationDisplay(transferInHotelLoc.name, transferInHotelLoc.type),
            })}
          </Text>
        ) : null}

        {flags.wantTour && tourStartDate && tourEndDate ? (
          <Text style={styles.vLineMuted as object}>
            {t('newBooking.form.voucherTourRange', {
              from: formatDisplayDateTime(tourStartDate),
              to: formatDisplayDateTime(tourEndDate),
            })}
          </Text>
        ) : null}

        {flags.wantTour
          ? tourDays.map((d, idx) => {
              const isLast = idx === tourDays.length - 1;
              return (
                <Text key={`preview-tour-day-${d.day}`} style={styles.vLineMuted as object}>
                  {d.stops.trim()
                    ? t('newBooking.form.voucherDayRouteWithStops', {
                        day: d.day,
                        from: d.from.trim() || '—',
                        to: d.to.trim() || '—',
                        stops: d.stops.trim(),
                      })
                    : t('newBooking.dayLine', {
                        day: d.day,
                        from: d.from.trim() || '—',
                        to: d.to.trim() || '—',
                      })}
                  {!isLast && d.touristHotel.trim()
                    ? ` · ${t('newBooking.form.touristHotel')}: ${d.touristHotel.trim()}`
                    : ''}
                  {!isLast && d.driverOvernight.trim()
                    ? ` · ${t('newBooking.form.driverOvernight')}: ${d.driverOvernight.trim()}`
                    : ''}
                </Text>
              );
            })
          : null}

        {flags.wantTour && tourOvernightCount > 0 ? (
          <Text style={styles.vLineMuted as object}>
            {t('newBooking.form.totalOvernights', { count: tourOvernightCount })}
          </Text>
        ) : null}

        {!pureTransfer && flags.wantDepartureTransfer ? (
          <Text style={styles.vLineMuted as object}>
            {t('newBooking.form.voucherTransferOutRoute', {
              datetime: transferOutDateTime ? formatDisplayDateTime(transferOutDateTime) : '—',
              from: formatLocationDisplay(transferOutHotelLoc.name, transferOutHotelLoc.type),
              to: formatLocationDisplay(transferOutAirportLoc.name, transferOutAirportLoc.type),
            })}
          </Text>
        ) : null}

        {pureTransfer && passengerName.trim() ? (
          <Text style={styles.vLineMuted as object}>
            {t('newBooking.form.voucherPassenger')}: {passengerName.trim()}
          </Text>
        ) : null}
        {pureTransfer && meetGreet && signText.trim() ? (
          <Text style={styles.vLineMuted as object}>
            {t('bookings.voucherPickupSignName')}: {signText.trim()}
          </Text>
        ) : null}
        {pickupSignLogo && !pureTransfer ? (
          <View style={styles.voucherLogoPreview as object}>
            <Text style={styles.vLineMuted as object}>{t('bookings.voucherPickupSignMark')}</Text>
            {isPickupSignLogoPdf(pickupSignLogo) ? (
              <Text style={styles.vLineMuted as object}>{t('newBooking.pickupSignLogo.pdfReady')}</Text>
            ) : (
              <Image
                source={{ uri: pickupSignLogo.uri }}
                style={styles.voucherLogoImage as object}
                resizeMode="contain"
              />
            )}
          </View>
        ) : null}
        {pickupSignLogo && pureTransfer ? (
          <View style={styles.voucherLogoPreview as object}>
            <Text style={styles.vLineMuted as object}>{t('bookings.voucherPickupSignMark')}</Text>
            {isPickupSignLogoPdf(pickupSignLogo) ? (
              <Text style={styles.vLineMuted as object}>{t('newBooking.pickupSignLogo.pdfReady')}</Text>
            ) : (
              <Image
                source={{ uri: pickupSignLogo.uri }}
                style={styles.voucherLogoImage as object}
                resizeMode="contain"
              />
            )}
          </View>
        ) : null}
        <Text style={styles.vLine as object}>
          {t('newBooking.form.voucherPassengers')}: {pax}
        </Text>
        <Text style={styles.vLine as object}>
          {t('newBooking.form.voucherPayment')}: {paymentLabel(paymentWhen)}
        </Text>
        <Text style={styles.vPrice as object}>
          {t('newBooking.form.voucherOfferedPrice')}: {formatGel(driverOfferGel)}
        </Text>
      </View>
    </View>
  );
}
