/**
 * What a job actually costs a driver, and what it is therefore worth.
 *
 * KEKE takes no commission, so the number a company types in is the number the
 * driver gets. That makes a wrong number expensive in both directions: too low
 * and the booking sits unanswered until the tour is at risk, too high and the
 * company quietly overpays on every job and eventually leaves.
 *
 * The model is deliberately not a black box. Every figure below is a cost a
 * driver can recognise — litres, tyres, a day of his life, a night in a hotel —
 * so the breakdown can be shown on screen and argued with. A price nobody can
 * explain is a price nobody trusts.
 *
 * Calibration (Sept 2026), against real KEKE bookings:
 *   - Tbilisi airport → city hotel, sedan comfort, ~18 km → model 47 ₾ floor /
 *     55 ₾ recommended. Four completed bookings sit at 55–60 ₾.
 *   - Tbilisi → Kazbegi → Tbilisi day tour, sedan comfort, ~320 km, fuel
 *     included → model 288 ₾ floor / 331 ₾ recommended. Market is 280–350 ₾.
 *   - 6-day tour, sedan, fuel paid by the company, accommodation covered →
 *     model ~1160 ₾. The real booking went out at 1200 ₾.
 *
 * FUEL_PRICE_GEL_PER_LITRE is the one number that moves on its own. Everything
 * else is a business decision. Keep them here, not scattered through screens.
 */

import type { VehicleClassCode, VehicleTypeCode } from './vehicleCatalog';

// ─── Tunable rates ──────────────────────────────────────────────────────────

/** Petrol, ₾ per litre. Update when the pump price moves more than ~10 tetri. */
export const FUEL_PRICE_GEL_PER_LITRE = 3.3;

/** A driver's day, sedan / comfort. Everything else scales off this. */
export const DRIVER_DAY_RATE_GEL = 165;

/** Hotel + food for the driver, per night, when the company does not cover it. */
export const DRIVER_OVERNIGHT_GEL = 90;

/** Typical consumption, litres per 100 km, loaded, Georgian roads. */
const FUEL_LITRES_PER_100KM: Record<VehicleTypeCode, number> = {
  sedan: 8,
  minivan: 11,
  suv: 12,
  microbus: 14,
  bus: 25,
  special: 14,
};

/** Tyres, servicing, depreciation — ₾ per km driven. */
const WEAR_GEL_PER_KM: Record<VehicleTypeCode, number> = {
  sedan: 0.12,
  minivan: 0.15,
  suv: 0.18,
  microbus: 0.2,
  bus: 0.3,
  special: 0.2,
};

/** Day rate relative to a sedan. */
const DAY_RATE_BY_TYPE: Record<VehicleTypeCode, number> = {
  sedan: 1,
  minivan: 1.3,
  suv: 1.25,
  microbus: 1.65,
  bus: 2.3,
  special: 1.65,
};

const DAY_RATE_BY_CLASS: Record<VehicleClassCode, number> = {
  economy: 0.85,
  comfort: 1,
  vip: 1.45,
};

/**
 * A transfer is not a short tour. The driver blocks out the hours around it,
 * waits for a flight that is late, and drives one leg with nobody in the car.
 * This is what that costs before a single kilometre is charged.
 */
const TRANSFER_BASE_GEL: Record<VehicleTypeCode, number> = {
  sedan: 35,
  minivan: 45,
  suv: 45,
  microbus: 60,
  bus: 90,
  special: 60,
};

/**
 * A transfer's return leg is usually empty. Not a full 2.0 — a driver working
 * the airport often picks up a fare on the way back.
 */
const TRANSFER_DEADHEAD_FACTOR = 1.8;

/** Surcharges. These apply to the driver's time, never to fuel — petrol does not cost more at 3am. */
const NIGHT_MULTIPLIER = 1.2;
const HIGH_SEASON_MULTIPLIER = 1.1;
const WINTER_MOUNTAIN_MULTIPLIER = 1.15;

/** Above the floor: enough to be worth taking / enough to be taken within minutes. */
const RECOMMENDED_MARKUP = 1.15;
const FAST_MARKUP = 1.35;

/** Routes where winter means chains, passes and a real chance of being stuck. */
const MOUNTAIN_ROUTE_HINTS = [
  'გუდაური',
  'ყაზბეგი',
  'სტეფანწმინდა',
  'მესტია',
  'უშგული',
  'ბაკურიანი',
  'ომალო',
  'თუშეთი',
  'შატილი',
  'gudauri',
  'kazbegi',
  'stepantsminda',
  'mestia',
  'ushguli',
  'bakuriani',
  'omalo',
  'tusheti',
  'shatili',
];

// ─── Input / output ─────────────────────────────────────────────────────────

export type PricingKind = 'transfer' | 'day_tour' | 'tour';

export type PricingInput = {
  kind: PricingKind;
  vehicleType: VehicleTypeCode;
  vehicleClass: VehicleClassCode;
  /** Driving distance for the whole job. Null when it could not be resolved. */
  distanceKm: number | null;
  /** Working days. 1 for a transfer or a day tour. */
  days?: number;
  /** Nights the driver sleeps away from home. */
  nights?: number;
  /** Multi-day tours in Georgia usually put the driver in the group's hotel. */
  companyCoversAccommodation?: boolean;
  /** False when the company refuels separately — then fuel is not in the price. */
  priceIncludesFuel?: boolean;
  /** Trip start, for the night and season surcharges. */
  startAt?: Date | null;
  /** Free text of the route, for the winter-mountain surcharge. */
  routeText?: string | null;
};

export type PriceLine = {
  key: 'fuel' | 'wear' | 'days' | 'nights' | 'base' | 'surcharge';
  /** Georgian, ready to render. */
  label: string;
  gel: number;
};

export type PriceEstimate = {
  /** Below this the driver is working at a loss. */
  floorGel: number;
  /** What the job is worth. */
  recommendedGel: number;
  /** Taken within minutes. */
  fastGel: number;
  /** Every figure that went into the floor. */
  breakdown: PriceLine[];
  distanceKm: number | null;
  /** True when no distance was available and the estimate is a rough fallback. */
  approximate: boolean;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function round5(value: number): number {
  return Math.max(0, Math.round(value / 5) * 5);
}

function isNightDeparture(startAt: Date | null | undefined): boolean {
  if (!startAt || Number.isNaN(startAt.getTime())) return false;
  const h = startAt.getHours();
  return h >= 22 || h < 6;
}

function isHighSeason(startAt: Date | null | undefined): boolean {
  if (!startAt || Number.isNaN(startAt.getTime())) return false;
  const m = startAt.getMonth() + 1;
  return m >= 7 && m <= 9;
}

function isWinterMountain(startAt: Date | null | undefined, routeText: string | null | undefined): boolean {
  if (!startAt || Number.isNaN(startAt.getTime())) return false;
  const m = startAt.getMonth() + 1;
  const winter = m === 12 || m <= 3;
  if (!winter) return false;
  const text = String(routeText ?? '').toLowerCase();
  if (!text) return false;
  return MOUNTAIN_ROUTE_HINTS.some((hint) => text.includes(hint));
}

/**
 * Distance we assume when geocoding failed, so the company still sees a sane
 * number instead of nothing. Flagged as `approximate` so the UI can say so.
 */
function fallbackDistanceKm(kind: PricingKind, days: number): number {
  if (kind === 'transfer') return 25;
  if (kind === 'day_tour') return 220;
  return 220 * Math.max(1, days);
}

export function driverDayRateGel(
  vehicleType: VehicleTypeCode,
  vehicleClass: VehicleClassCode,
): number {
  return (
    DRIVER_DAY_RATE_GEL * (DAY_RATE_BY_TYPE[vehicleType] ?? 1) * (DAY_RATE_BY_CLASS[vehicleClass] ?? 1)
  );
}

/** Fuel cost for a given distance, ₾. Exported so the driver screen can show net earnings. */
export function fuelCostGel(vehicleType: VehicleTypeCode, distanceKm: number): number {
  const litres = ((FUEL_LITRES_PER_100KM[vehicleType] ?? 10) * Math.max(0, distanceKm)) / 100;
  return litres * FUEL_PRICE_GEL_PER_LITRE;
}

// ─── The model ──────────────────────────────────────────────────────────────

export function estimateBookingPrice(input: PricingInput): PriceEstimate {
  const days = Math.max(1, Math.round(input.days ?? 1));
  const approximate = input.distanceKm == null || !Number.isFinite(input.distanceKm);
  const distanceKm = approximate
    ? fallbackDistanceKm(input.kind, days)
    : Math.max(0, Number(input.distanceKm));

  const isTransfer = input.kind === 'transfer';
  // Only a transfer drives an empty leg. On a tour the driver stays with the
  // group, so the itinerary distance is already the whole job.
  const billedKm = isTransfer ? distanceKm * TRANSFER_DEADHEAD_FACTOR : distanceKm;

  const includesFuel = input.priceIncludesFuel !== false;
  const fuel = includesFuel ? fuelCostGel(input.vehicleType, billedKm) : 0;
  const wear = (WEAR_GEL_PER_KM[input.vehicleType] ?? 0.15) * billedKm;

  // A transfer buys the driver's blocked-out hours, not a whole day.
  const dayRate = driverDayRateGel(input.vehicleType, input.vehicleClass);
  const labourBase = isTransfer
    ? (TRANSFER_BASE_GEL[input.vehicleType] ?? 40)
    : dayRate * days;

  let surchargeMultiplier = 1;
  if (isNightDeparture(input.startAt)) surchargeMultiplier *= NIGHT_MULTIPLIER;
  if (isHighSeason(input.startAt)) surchargeMultiplier *= HIGH_SEASON_MULTIPLIER;
  if (isWinterMountain(input.startAt, input.routeText)) {
    surchargeMultiplier *= WINTER_MOUNTAIN_MULTIPLIER;
  }
  const labour = labourBase * surchargeMultiplier;
  const surcharge = labour - labourBase;

  const nights = input.companyCoversAccommodation ? 0 : Math.max(0, Math.round(input.nights ?? 0));
  const accommodation = nights * DRIVER_OVERNIGHT_GEL;

  // The lines are rounded first and the floor is their sum, so what is shown on
  // screen adds up. A breakdown whose numbers do not total the price is worse
  // than no breakdown at all.
  const breakdown: PriceLine[] = [];
  if (isTransfer) {
    breakdown.push({
      key: 'base',
      label: `გასვლა და ლოდინი (${input.vehicleType === 'sedan' ? 'სედანი' : 'ტრანსპორტი'})`,
      gel: round5(labourBase),
    });
  } else {
    breakdown.push({
      key: 'days',
      label: `მძღოლის ${days} დღე × ${Math.round(dayRate)} ₾`,
      gel: round5(labourBase),
    });
  }
  if (fuel > 0) {
    breakdown.push({
      key: 'fuel',
      label: `საწვავი ${Math.round(billedKm)} კმ`,
      gel: round5(fuel),
    });
  }
  if (wear > 0) {
    breakdown.push({ key: 'wear', label: `მანქანის ცვეთა`, gel: round5(wear) });
  }
  if (accommodation > 0) {
    breakdown.push({
      key: 'nights',
      label: `მძღოლის განთავსება ${nights} ღამე`,
      gel: round5(accommodation),
    });
  }
  if (surcharge >= 2.5) {
    breakdown.push({ key: 'surcharge', label: 'ღამე / სეზონი / ზამთრის მთა', gel: round5(surcharge) });
  }

  const floor = breakdown.reduce((sum, line) => sum + line.gel, 0);

  return {
    floorGel: floor,
    recommendedGel: round5(floor * RECOMMENDED_MARKUP),
    fastGel: round5(floor * FAST_MARKUP),
    breakdown,
    distanceKm: approximate ? null : Math.round(distanceKm * 10) / 10,
    approximate,
  };
}

export type OfferVerdict = 'below_floor' | 'lean' | 'fair' | 'fast' | 'above_market';

/**
 * Where an offer sits against the model. Used for the warning line — the app
 * never blocks a price, it just refuses to let the company send one blind.
 */
export function judgeOffer(offerGel: number, estimate: PriceEstimate): OfferVerdict {
  const offer = Number(offerGel);
  if (!Number.isFinite(offer) || offer <= 0) return 'below_floor';
  if (offer < estimate.floorGel) return 'below_floor';
  if (offer < estimate.recommendedGel) return 'lean';
  if (offer < estimate.fastGel) return 'fair';
  if (offer <= estimate.fastGel * 1.25) return 'fast';
  return 'above_market';
}
