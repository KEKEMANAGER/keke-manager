/**
 * Canonical keys for `bookings`, `profiles`, and pickers (lowercase English).
 * Labels use locale JSON (`vehicle.type` / `vehicle.class`) + current `i18n.language`
 * so UI matches the chosen app language reliably (avoid i18next `exists` edge cases).
 */
import en from '../src/locales/en.json';
import ka from '../src/locales/ka.json';
import ru from '../src/locales/ru.json';
import i18n from '../src/lib/i18n';

export const VEHICLE_TYPES = ['sedan', 'minivan', 'suv', 'minibus', 'bus'] as const;
export type VehicleTypeCode = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_CLASSES = ['economy', 'comfort', 'premium'] as const;
export type VehicleClassCode = (typeof VEHICLE_CLASSES)[number];

type VehicleLocales = typeof ka;

function vehicleBundle(lang: string): VehicleLocales['vehicle'] {
  const code = lang.split('-')[0]?.toLowerCase() ?? 'ka';
  if (code === 'ru') return ru.vehicle;
  if (code === 'en') return en.vehicle;
  return ka.vehicle;
}

function currentLangCode(): string {
  return String(i18n.resolvedLanguage || i18n.language || 'ka');
}

const TYPE_LABELS_EN: Record<VehicleTypeCode, string> = {
  sedan: 'Sedan',
  minivan: 'Minivan',
  suv: 'SUV',
  minibus: 'Minibus',
  bus: 'Bus',
};

const CLASS_LABELS_EN: Record<VehicleClassCode, string> = {
  economy: 'Economy',
  comfort: 'Comfort',
  premium: 'Premium',
};

/** Maps any known label (Geo/EN/legacy DB) → canonical type. */
const TYPE_ALIASES: Record<string, VehicleTypeCode> = {
  sedan: 'sedan',
  minivan: 'minivan',
  suv: 'suv',
  minibus: 'minibus',
  bus: 'bus',
  microbus: 'minibus',
  'micro-bus': 'minibus',
  სედანი: 'sedan',
  მინივენი: 'minivan',
  მიკროავტობუსი: 'minibus',
  ავტობუსი: 'bus',
  'სპეც. ტრანსპორტი': 'suv',
  'special transport': 'suv',
};

/** Maps any known label (Geo/EN/legacy DB) → canonical class. */
const CLASS_ALIASES: Record<string, VehicleClassCode> = {
  economy: 'economy',
  comfort: 'comfort',
  premium: 'premium',
  eco: 'economy',
  lux: 'premium',
  business: 'premium',
  ეკონომი: 'economy',
  ეკო: 'economy',
  კომფორტი: 'comfort',
  ბიზნესი: 'premium',
  ბიზნეს: 'premium',
  პრემიუმი: 'premium',
  პრემიუმ: 'premium',
  ლუქსი: 'premium',
  ლუქს: 'premium',
  vip: 'premium',
};

export function vehicleTypeLabel(code: VehicleTypeCode | string | null | undefined): string {
  const c = normalizeVehicleType(code);
  if (!c) return '—';
  const row = vehicleBundle(currentLangCode()).type as Record<string, string>;
  const fromLocale = row[c]?.trim();
  if (fromLocale) return fromLocale;
  return TYPE_LABELS_EN[c] ?? c;
}

export function vehicleClassLabel(code: VehicleClassCode | string | null | undefined): string {
  const c = normalizeVehicleClass(code);
  if (!c) return '—';
  const row = vehicleBundle(currentLangCode()).class as Record<string, string>;
  const fromLocale = row[c]?.trim();
  if (fromLocale) return fromLocale;
  return CLASS_LABELS_EN[c] ?? c;
}

export function normalizeVehicleType(raw: string | null | undefined): VehicleTypeCode | null {
  const rawStr = String(raw ?? '').trim();
  const key = rawStr.toLowerCase();
  if (!key) return null;
  if ((VEHICLE_TYPES as readonly string[]).includes(key)) {
    return key as VehicleTypeCode;
  }
  const fromAlias = TYPE_ALIASES[key] ?? TYPE_ALIASES[rawStr];
  return fromAlias ?? null;
}

export function normalizeVehicleClass(raw: string | null | undefined): VehicleClassCode | null {
  const rawStr = String(raw ?? '').trim();
  const key = rawStr.toLowerCase();
  if (!key) return null;
  if ((VEHICLE_CLASSES as readonly string[]).includes(key)) {
    return key as VehicleClassCode;
  }
  const fromAlias = CLASS_ALIASES[key] ?? CLASS_ALIASES[rawStr];
  return fromAlias ?? null;
}

export function isVehicleTypeCode(value: string): value is VehicleTypeCode {
  return (VEHICLE_TYPES as readonly string[]).includes(value);
}

export function isVehicleClassCode(value: string): value is VehicleClassCode {
  return (VEHICLE_CLASSES as readonly string[]).includes(value);
}

/** Picker options: same canonical `value` for company booking + driver profile. */
export function vehicleTypeUiOptions(): { value: VehicleTypeCode; label: string }[] {
  return VEHICLE_TYPES.map((value) => ({ value, label: vehicleTypeLabel(value) }));
}

export function vehicleClassUiOptions(): { value: VehicleClassCode; label: string }[] {
  return VEHICLE_CLASSES.map((value) => ({ value, label: vehicleClassLabel(value) }));
}
