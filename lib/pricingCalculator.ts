import type { VehicleTypeCode } from './vehicleCatalog';

export type PricingVehicleTier = 'sedan' | 'suv' | 'minivan' | 'bus';

const FUEL_PER_KM: Record<PricingVehicleTier, number> = {
  sedan: 0.35,
  suv: 0.45,
  minivan: 0.55,
  bus: 0.65,
};

const DAILY_RATE: Record<PricingVehicleTier, number> = {
  sedan: 80,
  suv: 100,
  minivan: 120,
  bus: 150,
};

const MOUNTAIN_KEYWORDS = [
  'kazbegi',
  'ყაზბეგ',
  'stepantsminda',
  'სტეფანწმინდ',
  'gudauri',
  'გუდაური',
  'svaneti',
  'სვანეთ',
  'mestia',
  'მესტი',
  'ushguli',
  'უშგული',
];

export function mapVehicleTypeToPricingTier(type: VehicleTypeCode): PricingVehicleTier {
  if (type === 'suv') return 'suv';
  if (type === 'minivan' || type === 'microbus') return 'minivan';
  if (type === 'bus' || type === 'special') return 'bus';
  return 'sedan';
}

export function routeIncludesMountainArea(locationTexts: string[]): boolean {
  const blob = locationTexts
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  if (!blob) return false;
  return MOUNTAIN_KEYWORDS.some((kw) => blob.includes(kw.toLowerCase()));
}

export type RecommendedPriceInput = {
  distanceKm: number;
  vehicleType: VehicleTypeCode;
  dayCount: number;
  mountainRoute?: boolean;
};

export type RecommendedPriceBreakdown = {
  distanceKm: number;
  fuelCostPerKm: number;
  fuelComponent: number;
  dailyRate: number;
  dayCount: number;
  dailyComponent: number;
  subtotal: number;
  mountainMultiplier: number;
  recommendedGel: number;
};

/** Company pricing formula for recommended driver offer (GEL). */
export function calculateRecommendedPrice(input: RecommendedPriceInput): RecommendedPriceBreakdown {
  const tier = mapVehicleTypeToPricingTier(input.vehicleType);
  const fuelCostPerKm = FUEL_PER_KM[tier];
  const dailyRate = DAILY_RATE[tier];
  const dayCount = Math.max(1, Math.floor(input.dayCount) || 1);
  const distanceKm = Math.max(0, input.distanceKm);

  const fuelComponent = distanceKm * fuelCostPerKm;
  const dailyComponent = dailyRate * dayCount;
  const subtotal = fuelComponent + dailyComponent;
  const mountainMultiplier = input.mountainRoute ? 1.3 : 1;
  const recommendedGel = Math.max(50, Math.round(subtotal * mountainMultiplier));

  return {
    distanceKm,
    fuelCostPerKm,
    fuelComponent: Math.round(fuelComponent * 100) / 100,
    dailyComponent,
    dayCount,
    dailyRate,
    subtotal: Math.round(subtotal * 100) / 100,
    mountainMultiplier,
    recommendedGel,
  };
}
