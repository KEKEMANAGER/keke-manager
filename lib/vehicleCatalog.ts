/** Canonical DB values (lowercase) for `bookings` and `profiles`. */

export const VEHICLE_TYPES = ['sedan', 'minivan', 'suv', 'bus'] as const;
export type VehicleTypeCode = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_CLASSES = ['eco', 'comfort', 'lux'] as const;
export type VehicleClassCode = (typeof VEHICLE_CLASSES)[number];

const TYPE_LABELS_KA: Record<VehicleTypeCode, string> = {
  sedan: 'სედანი',
  minivan: 'მინივენი',
  suv: 'SUV',
  bus: 'ავტობუსი',
};

const CLASS_LABELS_KA: Record<VehicleClassCode, string> = {
  eco: 'ეკო',
  comfort: 'კომფორტი',
  lux: 'ლუქს',
};

/** Maps booking wizard labels (Georgian / mixed) → canonical type. */
const TYPE_ALIASES: Record<string, VehicleTypeCode> = {
  sedan: 'sedan',
  minivan: 'minivan',
  suv: 'suv',
  bus: 'bus',
  სედანი: 'sedan',
  მინივენი: 'minivan',
  მიკროავტობუსი: 'minivan',
  ავტობუსი: 'bus',
  'სპეც. ტრანსპორტი': 'suv',
};

/** Maps booking wizard labels → canonical class. */
const CLASS_ALIASES: Record<string, VehicleClassCode> = {
  eco: 'eco',
  comfort: 'comfort',
  lux: 'lux',
  economy: 'eco',
  ეკონომი: 'eco',
  ეკო: 'eco',
  კომფორტი: 'comfort',
  ბიზნეს: 'lux',
  business: 'lux',
};

export function vehicleTypeLabel(code: VehicleTypeCode | string | null | undefined): string {
  const c = normalizeVehicleType(code);
  return c ? TYPE_LABELS_KA[c] : '—';
}

export function vehicleClassLabel(code: VehicleClassCode | string | null | undefined): string {
  const c = normalizeVehicleClass(code);
  return c ? CLASS_LABELS_KA[c] : '—';
}

export function normalizeVehicleType(raw: string | null | undefined): VehicleTypeCode | null {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  if ((VEHICLE_TYPES as readonly string[]).includes(key)) {
    return key as VehicleTypeCode;
  }
  const fromAlias = TYPE_ALIASES[key] ?? TYPE_ALIASES[String(raw ?? '').trim()];
  return fromAlias ?? null;
}

export function normalizeVehicleClass(raw: string | null | undefined): VehicleClassCode | null {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  if ((VEHICLE_CLASSES as readonly string[]).includes(key)) {
    return key as VehicleClassCode;
  }
  const fromAlias = CLASS_ALIASES[key] ?? CLASS_ALIASES[String(raw ?? '').trim()];
  return fromAlias ?? null;
}

export function isVehicleTypeCode(value: string): value is VehicleTypeCode {
  return (VEHICLE_TYPES as readonly string[]).includes(value);
}

export function isVehicleClassCode(value: string): value is VehicleClassCode {
  return (VEHICLE_CLASSES as readonly string[]).includes(value);
}
