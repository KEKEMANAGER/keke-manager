/**
 * Canonical keys for `bookings`, `profiles`, `vehicles`, and pickers (lowercase English).
 * Labels use locale JSON (`vehicle.type` / `vehicle.class`) + current `i18n.language`.
 */
import en from '../src/locales/en.json';
import ka from '../src/locales/ka.json';
import ru from '../src/locales/ru.json';
import i18n from '../src/lib/i18n';

export const VEHICLE_TYPES = ['sedan', 'minivan', 'suv', 'microbus', 'bus', 'special'] as const;
export type VehicleTypeCode = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_CLASSES = ['economy', 'comfort', 'business', 'premium', 'vip'] as const;
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
  microbus: 'Microbus',
  bus: 'Bus',
  special: 'Special transport',
};

const CLASS_LABELS_EN: Record<VehicleClassCode, string> = {
  economy: 'Economy',
  comfort: 'Comfort',
  business: 'Business',
  premium: 'Premium',
  vip: 'VIP',
};

/** Maps any known label (Geo/EN/legacy DB) → canonical type. */
const TYPE_ALIASES: Record<string, VehicleTypeCode> = {
  sedan: 'sedan',
  minivan: 'minivan',
  suv: 'suv',
  microbus: 'microbus',
  minibus: 'microbus',
  'micro-bus': 'microbus',
  bus: 'bus',
  special: 'special',
  სედანი: 'sedan',
  მინივენი: 'minivan',
  მიკროავტობუსი: 'microbus',
  ავტობუსი: 'bus',
  'სპეც. ტრანსპორტი': 'special',
  'სპეციალური': 'special',
  'special transport': 'special',
};

/** Maps any known label (Geo/EN/legacy DB) → canonical class. */
const CLASS_ALIASES: Record<string, VehicleClassCode> = {
  economy: 'economy',
  comfort: 'comfort',
  business: 'business',
  premium: 'premium',
  vip: 'vip',
  eco: 'economy',
  lux: 'premium',
  ეკონომი: 'economy',
  ეკო: 'economy',
  კომფორტი: 'comfort',
  ბიზნესი: 'business',
  ბიზნეს: 'business',
  პრემიუმი: 'premium',
  პრემიუმ: 'premium',
  ლუქსი: 'premium',
  ლუქს: 'premium',
};

function lookupAlias<T extends string>(raw: string, aliases: Record<string, T>, canonical: readonly string[]): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (canonical.includes(lower)) {
    return lower as T;
  }
  return aliases[lower] ?? aliases[trimmed] ?? null;
}

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
  return lookupAlias(String(raw ?? ''), TYPE_ALIASES, VEHICLE_TYPES);
}

export function normalizeVehicleClass(raw: string | null | undefined): VehicleClassCode | null {
  return lookupAlias(String(raw ?? ''), CLASS_ALIASES, VEHICLE_CLASSES);
}

/** All DB / UI raw strings that normalize to the given canonical type (for Supabase `.in()`). */
export function vehicleTypeRawValues(code: VehicleTypeCode): string[] {
  const out = new Set<string>([code]);
  for (const [alias, mapped] of Object.entries(TYPE_ALIASES)) {
    if (mapped === code) out.add(alias);
  }
  return [...out];
}

/** All DB / UI raw strings that normalize to the given canonical class (for Supabase `.in()`). */
export function vehicleClassRawValues(code: VehicleClassCode): string[] {
  const out = new Set<string>([code]);
  for (const [alias, mapped] of Object.entries(CLASS_ALIASES)) {
    if (mapped === code) out.add(alias);
  }
  return [...out];
}

export function isVehicleTypeCode(value: string): value is VehicleTypeCode {
  return (VEHICLE_TYPES as readonly string[]).includes(value);
}

export function isVehicleClassCode(value: string): value is VehicleClassCode {
  return (VEHICLE_CLASSES as readonly string[]).includes(value);
}

/** Picker options: canonical `value` for DB; Georgian/EN `label` for UI. */
export function vehicleTypeUiOptions(): { value: VehicleTypeCode; label: string }[] {
  return VEHICLE_TYPES.map((value) => ({ value, label: vehicleTypeLabel(value) }));
}

export function vehicleClassUiOptions(): { value: VehicleClassCode; label: string }[] {
  return VEHICLE_CLASSES.map((value) => ({ value, label: vehicleClassLabel(value) }));
}
