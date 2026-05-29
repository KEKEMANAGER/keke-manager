import type { TFunction } from 'i18next';
import { persistLocationFields, locationValueIsComplete, type LocationValue } from './bookingLocations';
import type { InsertBookingInput, TourTransferLeg } from './bookings';
import { normalizeBookingKind } from './bookings';
import { toIsoString } from './dateTime';
import type { VehicleClassCode } from './vehicleCatalog';
import {
  buildTourRouteText,
  itineraryFromTourDays,
  persistTourDaysForDb,
  tourBookingPrimaryDateIso,
  tourEndpointsFromDays,
  type TourDayForm,
} from './tourDays';

export type ServiceFlags = {
  wantArrivalTransfer: boolean;
  wantTour: boolean;
  wantDepartureTransfer: boolean;
};

export type CommissionMode = 'gel' | 'percent';

export type SmartBookingLegState = {
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
  meetGreet: boolean;
  signText: string;
  passengerName: string;
  passengerPhone: string;
  passengers: string;
  comment: string;
  clientPriceStr: string;
  commissionStr: string;
  commissionMode: CommissionMode;
  paymentWhen: string;
};

export function emptyServiceFlags(): ServiceFlags {
  return {
    wantArrivalTransfer: false,
    wantTour: false,
    wantDepartureTransfer: false,
  };
}

export function serviceFlagsFromPreset(preset?: string): ServiceFlags | null {
  if (preset === 'transfer') {
    return { wantArrivalTransfer: true, wantTour: false, wantDepartureTransfer: false };
  }
  if (preset === 'tour') {
    return { wantArrivalTransfer: false, wantTour: true, wantDepartureTransfer: false };
  }
  if (preset === 'dayTour') {
    return { wantArrivalTransfer: false, wantTour: true, wantDepartureTransfer: false };
  }
  return null;
}

export function hasAnyService(flags: ServiceFlags): boolean {
  return flags.wantArrivalTransfer || flags.wantTour || flags.wantDepartureTransfer;
}

export function isPureTransfer(flags: ServiceFlags): boolean {
  return hasAnyService(flags) && !flags.wantTour;
}

export function isPureArrivalTransfer(flags: ServiceFlags): boolean {
  return flags.wantArrivalTransfer && !flags.wantTour && !flags.wantDepartureTransfer;
}

export function isPureDepartureTransfer(flags: ServiceFlags): boolean {
  return flags.wantDepartureTransfer && !flags.wantTour && !flags.wantArrivalTransfer;
}

export function derivedDbKind(flags: ServiceFlags): 'transfer' | 'tour' {
  if (isPureTransfer(flags)) return 'transfer';
  return 'tour';
}

export function parseAmountGeorgian(raw: string): number {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

export function commissionGelAmount(
  clientGel: number,
  commissionRaw: string,
  mode: CommissionMode,
): number {
  const v = parseAmountGeorgian(commissionRaw);
  if (v <= 0) return 0;
  if (mode === 'gel') return Math.round(v * 100) / 100;
  const pct = Math.min(100, Math.max(0, v));
  if (clientGel <= 0) return 0;
  return Math.round(clientGel * (pct / 100) * 100) / 100;
}

export function calcSmartEstimate(
  flags: ServiceFlags,
  passengers: number,
  vehicleClass: VehicleClassCode,
): number {
  let base = 120;
  if (flags.wantTour) base = 450;
  else if (flags.wantArrivalTransfer && flags.wantDepartureTransfer) base = 220;
  base += Math.max(0, passengers - 1) * 25;
  const mult =
    vehicleClass === 'premium' ? 1.45 : vehicleClass === 'comfort' ? 1.2 : 1;
  return Math.round(base * mult);
}

export function serviceSummaryLabel(flags: ServiceFlags, t: TFunction): string {
  const parts: string[] = [];
  if (flags.wantArrivalTransfer) parts.push(t('newBooking.smartForm.arrivalTransfer'));
  if (flags.wantTour) parts.push(t('newBooking.smartForm.tour'));
  if (flags.wantDepartureTransfer) parts.push(t('newBooking.smartForm.departureTransfer'));
  if (parts.length === 3) return t('newBooking.smartForm.summaryFullPackage');
  return parts.join(' + ');
}

export function validateSmartBookingStep1(flags: ServiceFlags, t: TFunction): string | null {
  if (!hasAnyService(flags)) return t('newBooking.smartForm.selectAtLeastOne');
  return null;
}

export function validateSmartBookingStep2(
  flags: ServiceFlags,
  state: SmartBookingLegState,
  t: TFunction,
): string | null {
  if (flags.wantArrivalTransfer) {
    if (!state.transferInDateTime) return t('newBooking.validation.dateTime');
    if (!locationValueIsComplete(state.transferInAirportLoc)) {
      return t('newBooking.validation.locationFrom');
    }
    if (!locationValueIsComplete(state.transferInHotelLoc)) {
      return t('newBooking.validation.locationTo');
    }
  }

  if (flags.wantTour) {
    if (!state.tourStartDate || !state.tourEndDate) {
      return t('newBooking.validation.tourDates');
    }
    if (state.tourEndDate.getTime() < state.tourStartDate.getTime()) {
      return t('newBooking.validation.tourEndBeforeStart');
    }
    if (!state.tourDays.length || !state.tourDays.some((d) => d.from.trim())) {
      return t('newBooking.validation.tourDays');
    }
  }

  if (flags.wantDepartureTransfer) {
    if (!state.transferOutDateTime) return t('newBooking.validation.departureDate');
    if (!locationValueIsComplete(state.transferOutHotelLoc)) {
      return t('newBooking.validation.locationFrom');
    }
    if (!locationValueIsComplete(state.transferOutAirportLoc)) {
      return t('newBooking.validation.locationTo');
    }
  }

  return null;
}

function buildTransferInDb(
  flags: ServiceFlags,
  state: SmartBookingLegState,
): TourTransferLeg | null {
  if (!flags.wantArrivalTransfer || !state.transferInDateTime) return null;
  const airport = persistLocationFields(state.transferInAirportLoc);
  const hotel = persistLocationFields(state.transferInHotelLoc);
  const flight = state.arrivalFlightNo.trim();
  return {
    date: toIsoString(state.transferInDateTime),
    airport: airport.name ?? undefined,
    airport_type: airport.type,
    hotel: hotel.name ?? undefined,
    hotel_type: hotel.type,
    ...(flight ? { flight } : {}),
  };
}

function buildTransferOutDb(
  flags: ServiceFlags,
  state: SmartBookingLegState,
): TourTransferLeg | null {
  if (!flags.wantDepartureTransfer || !state.transferOutDateTime) return null;
  const hotel = persistLocationFields(state.transferOutHotelLoc);
  const airport = persistLocationFields(state.transferOutAirportLoc);
  const flight = state.departureFlightNo.trim();
  return {
    date: toIsoString(state.transferOutDateTime),
    hotel: hotel.name ?? undefined,
    hotel_type: hotel.type,
    airport: airport.name ?? undefined,
    airport_type: airport.type,
    ...(flight ? { flight } : {}),
  };
}

export function composeInsertBookingInput(params: {
  flags: ServiceFlags;
  state: SmartBookingLegState;
  t: TFunction;
  companyId: string;
  companyName: string;
  operatorName: string | null;
  vehicleType: string;
  vehicleClass: string;
  offeredGel: number;
  driverId: string | null;
  vehicleId: string | null;
  requiredLanguages: string[];
  requestedDriverCategory: InsertBookingInput['requested_driver_category'];
}): InsertBookingInput {
  const { flags, state, t } = params;
  const dbKind = normalizeBookingKind(derivedDbKind(flags));
  const isTourKind = dbKind === 'tour';
  const pureArrival = isPureArrivalTransfer(flags);
  const pureDeparture = isPureDepartureTransfer(flags);

  const transferInDb = buildTransferInDb(flags, state);
  const transferOutDb = buildTransferOutDb(flags, state);
  const tourDaysDb = flags.wantTour ? persistTourDaysForDb(state.tourDays) : null;
  const itineraryDb =
    flags.wantTour && tourDaysDb?.length ? itineraryFromTourDays(tourDaysDb) : null;

  const tourEnds =
    flags.wantTour && tourDaysDb?.length
      ? tourEndpointsFromDays(tourDaysDb)
      : { from: null, to: null };

  const transferInAirportP = persistLocationFields(state.transferInAirportLoc);
  const transferInHotelP = persistLocationFields(state.transferInHotelLoc);
  const transferOutHotelP = persistLocationFields(state.transferOutHotelLoc);
  const transferOutAirportP = persistLocationFields(state.transferOutAirportLoc);

  const structuredRoute =
    flags.wantTour && tourDaysDb?.length
      ? buildTourRouteText(tourDaysDb, (day, from, to) =>
          t('newBooking.dayLine', { day, from, to }),
        )
      : null;

  const routeForDb = isTourKind ? structuredRoute : null;

  let fromLocation: string | null = null;
  let fromLocationType: string | null = null;
  let toLocation: string | null = null;
  let toLocationType: string | null = null;
  let dateDisplay: string | null = null;
  let flightNumber: string | null = null;
  let flightDirection: InsertBookingInput['flight_direction'] = null;

  if (pureArrival) {
    fromLocation = transferInAirportP.name;
    fromLocationType = transferInAirportP.type;
    toLocation = transferInHotelP.name;
    toLocationType = transferInHotelP.type;
    dateDisplay = state.transferInDateTime ? toIsoString(state.transferInDateTime) : null;
    flightNumber = state.arrivalFlightNo.trim() || null;
    flightDirection = 'arrival';
  } else if (pureDeparture) {
    fromLocation = transferOutHotelP.name;
    fromLocationType = transferOutHotelP.type;
    toLocation = transferOutAirportP.name;
    toLocationType = transferOutAirportP.type;
    dateDisplay = state.transferOutDateTime ? toIsoString(state.transferOutDateTime) : null;
    flightNumber = state.departureFlightNo.trim() || null;
    flightDirection = 'departure';
  } else if (isTourKind) {
    fromLocation = tourEnds.from;
    toLocation = tourEnds.to;
    if (!fromLocation && transferInDb?.airport) fromLocation = transferInDb.airport;
    if (!toLocation && transferOutDb?.airport) toLocation = transferOutDb.airport;
    dateDisplay = tourBookingPrimaryDateIso(
      flags.wantTour ? state.tourStartDate : null,
      flags.wantArrivalTransfer ? state.transferInDateTime : null,
      flags.wantDepartureTransfer ? state.transferOutDateTime : null,
    );
    flightNumber = null;
    flightDirection = null;
  }

  const commissionGelDb =
    isPureTransfer(flags) && state.commissionStr.trim()
      ? commissionGelAmount(params.offeredGel, state.commissionStr, state.commissionMode)
      : null;

  const showTransferExtras = isPureTransfer(flags);
  const pax = Math.max(1, parseInt(state.passengers, 10) || 1);

  return {
    company_id: params.companyId,
    company_name: params.companyName,
    kind: dbKind,
    from_location: fromLocation,
    from_location_type: fromLocationType,
    to_location: toLocation,
    to_location_type: toLocationType,
    route: routeForDb,
    date_display: dateDisplay,
    passengers: pax,
    vehicle_type: params.vehicleType,
    vehicle_class: params.vehicleClass,
    flight_number: flightNumber,
    meet_greet: showTransferExtras ? state.meetGreet : false,
    sign_text:
      showTransferExtras && state.meetGreet && state.signText.trim()
        ? state.signText.trim()
        : null,
    passenger_name: showTransferExtras ? state.passengerName.trim() || null : null,
    passenger_phone: showTransferExtras ? state.passengerPhone.trim() || null : null,
    flight_direction: flightDirection,
    pickup_time: null,
    client_price: params.offeredGel,
    commission:
      commissionGelDb !== null && commissionGelDb > 0 ? commissionGelDb : null,
    tour_days: tourDaysDb,
    itinerary: itineraryDb,
    transfer_in: isTourKind ? transferInDb : null,
    transfer_out: isTourKind ? transferOutDb : null,
    comment: state.comment.trim() || null,
    payment_method: state.paymentWhen,
    price_gel: params.offeredGel,
    created_by_name: params.operatorName,
    driver_id: params.driverId,
    vehicle_id: params.vehicleId,
    required_languages: params.requiredLanguages.length > 0 ? params.requiredLanguages : null,
    requested_driver_category: params.requestedDriverCategory,
  };
}
