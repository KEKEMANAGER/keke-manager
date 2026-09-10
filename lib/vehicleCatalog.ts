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

export const VEHICLE_CLASSES = ['economy', 'comfort', 'vip'] as const;
export type VehicleClassCode = (typeof VEHICLE_CLASSES)[number];

/** 'other' always sorts last — it opens a free-text field for anything not in this list. */
export const VEHICLE_COLORS = [
  'white', 'black', 'silver', 'gray', 'blue', 'red',
  'green', 'yellow', 'brown', 'beige', 'orange', 'other',
] as const;
export type VehicleColorCode = (typeof VEHICLE_COLORS)[number];

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
  vip: 'VIP',
};

const COLOR_LABELS_EN: Record<VehicleColorCode, string> = {
  white: 'White',
  black: 'Black',
  silver: 'Silver',
  gray: 'Gray',
  blue: 'Blue',
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  brown: 'Brown',
  beige: 'Beige',
  orange: 'Orange',
  other: 'Other',
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
/** 'business' and 'premium' were merged into 'vip' (Sept 2026) — kept here as aliases so
 *  legacy DB rows and old client builds still normalize correctly to the merged class. */
const CLASS_ALIASES: Record<string, VehicleClassCode> = {
  economy: 'economy',
  comfort: 'comfort',
  vip: 'vip',
  business: 'vip',
  premium: 'vip',
  eco: 'economy',
  lux: 'vip',
  ეკონომი: 'economy',
  ეკო: 'economy',
  კომფორტი: 'comfort',
  ბიზნესი: 'vip',
  ბიზნეს: 'vip',
  პრემიუმი: 'vip',
  პრემიუმ: 'vip',
  ლუქსი: 'vip',
  ლუქს: 'vip',
};

/** Maps any known label (Geo/EN/RU/legacy free-text DB values) → canonical color.
 *  Unlike TYPE_ALIASES/CLASS_ALIASES, this is consulted by normalizeVehicleColor before
 *  falling back to 'other', so a driver's pre-existing free-text color is never lost —
 *  it just shows as the "Other" chip with the original text still editable underneath. */
const COLOR_ALIASES: Record<string, VehicleColorCode> = {
  white: 'white', black: 'black', silver: 'silver', gray: 'gray', grey: 'gray',
  blue: 'blue', red: 'red', green: 'green', yellow: 'yellow', brown: 'brown',
  beige: 'beige', orange: 'orange',
  თეთრი: 'white', შავი: 'black',
  ვერცხლისფერი: 'silver', ვერცხლის: 'silver', ვერცხლისფრი: 'silver',
  ნაცრისფერი: 'gray', ნაცრისფრი: 'gray',
  ლურჯი: 'blue', ცისფერი: 'blue', ცისფრი: 'blue',
  წითელი: 'red',
  მწვანე: 'green',
  ყვითელი: 'yellow',
  ყავისფერი: 'brown', ყავისფრი: 'brown',
  ბეჟი: 'beige', ბეჟისფერი: 'beige',
  ნარინჯისფერი: 'orange', ნარინჯისფრი: 'orange',
  белый: 'white', чёрный: 'black', черный: 'black',
  серебристый: 'silver', серый: 'gray',
  синий: 'blue', голубой: 'blue',
  красный: 'red', зелёный: 'green', зеленый: 'green',
  жёлтый: 'yellow', желтый: 'yellow',
  коричневый: 'brown', бежевый: 'beige', оранжевый: 'orange',
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

export function vehicleTypeLabel(
  code: VehicleTypeCode | string | null | undefined,
  lang?: string,
): string {
  const c = normalizeVehicleType(code);
  if (!c) return '—';
  const row = vehicleBundle(lang ?? currentLangCode()).type as Record<string, string>;
  const fromLocale = row[c]?.trim();
  if (fromLocale) return fromLocale;
  return TYPE_LABELS_EN[c] ?? c;
}

export function vehicleClassLabel(
  code: VehicleClassCode | string | null | undefined,
  lang?: string,
): string {
  const c = normalizeVehicleClass(code);
  if (!c) return '—';
  const row = vehicleBundle(lang ?? currentLangCode()).class as Record<string, string>;
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

export function vehicleColorLabel(
  code: VehicleColorCode | string | null | undefined,
  lang?: string,
): string {
  const c = isVehicleColorCode(String(code ?? '')) ? (code as VehicleColorCode) : null;
  if (!c) return '—';
  const row = vehicleBundle(lang ?? currentLangCode()).color as Record<string, string> | undefined;
  const fromLocale = row?.[c]?.trim();
  if (fromLocale) return fromLocale;
  return COLOR_LABELS_EN[c] ?? c;
}

/** Unlike type/class, an unmatched non-empty value normalizes to 'other' (never null) —
 *  this is what lets the color picker show every pre-existing free-text value as a
 *  selected "Other" chip with the original text preserved in the field below it. */
export function normalizeVehicleColor(raw: string | null | undefined): VehicleColorCode | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  const canonical = lookupAlias(trimmed, COLOR_ALIASES, VEHICLE_COLORS);
  return canonical ?? 'other';
}

export function isVehicleColorCode(value: string): value is VehicleColorCode {
  return (VEHICLE_COLORS as readonly string[]).includes(value);
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

export function vehicleColorUiOptions(): { value: VehicleColorCode; label: string }[] {
  return VEHICLE_COLORS.map((value) => ({ value, label: vehicleColorLabel(value) }));
}
