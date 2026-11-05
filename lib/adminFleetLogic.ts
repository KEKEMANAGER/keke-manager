/**
 * The admin "Fleet" tab (ავტოპარკი): every driver's car, sorted into the
 * categories the business sells — sedan, minivan, microbus, bus, SUV — with
 * what each driver or car still lacks before KEKE can give him work.
 *
 * Pure functions only (no Supabase, no React Native), so they can be checked
 * on their own. The loader is lib/adminFleet.ts.
 */

export type FleetCategoryId = 'sedan' | 'minivan' | 'microbus' | 'bus' | 'suv' | 'other';

/** Tab order on the screen. `other` shows only when a car of another type exists. */
export const FLEET_CATEGORIES: readonly FleetCategoryId[] = ['sedan', 'minivan', 'microbus', 'bus', 'suv', 'other'];

export type FleetClass = 'economy' | 'comfort' | 'vip';
export const FLEET_CLASSES: readonly FleetClass[] = ['economy', 'comfort', 'vip'];

/** Seat sub-categories exist only for these two types (lib/vehicleCatalog.ts). */
export const FLEET_TIERED_CATEGORIES: readonly FleetCategoryId[] = ['minivan', 'microbus'];

export type FleetProblemCode =
  | 'no_languages'
  | 'no_seat_tier'
  | 'id_missing'
  | 'license_missing'
  | 'tech_passport_missing'
  | 'photos_missing'
  | 'vehicle_not_approved'
  | 'vehicle_off'
  | 'driver_not_verified'
  | 'driver_blocked';

export type FleetProblemTone = 'danger' | 'warn' | 'info' | 'muted';

export const FLEET_PROBLEM_TONE: Record<FleetProblemCode, FleetProblemTone> = {
  no_languages: 'danger',
  id_missing: 'danger',
  license_missing: 'danger',
  tech_passport_missing: 'danger',
  driver_blocked: 'danger',
  no_seat_tier: 'warn',
  photos_missing: 'warn',
  vehicle_not_approved: 'info',
  driver_not_verified: 'info',
  vehicle_off: 'muted',
};

/** Order in which problems are listed: what blocks work first. */
export const FLEET_PROBLEM_ORDER: readonly FleetProblemCode[] = [
  'no_languages',
  'driver_blocked',
  'id_missing',
  'license_missing',
  'tech_passport_missing',
  'no_seat_tier',
  'photos_missing',
  'driver_not_verified',
  'vehicle_not_approved',
  'vehicle_off',
];

export type FleetDriverInput = {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  languages: string[] | null;
  verification_status: string | null;
  is_verified: boolean | null;
  is_blocked: boolean | null;
  is_hired_driver: boolean | null;
  id_front: string | null;
  id_back: string | null;
  license_front: string | null;
  license_back: string | null;
  /** Older sign-ups kept one photo per document. */
  id_photo: string | null;
  license_photo: string | null;
};

export type FleetVehicleInput = {
  id: string;
  driver_id: string | null;
  type: string | null;
  class: string | null;
  capacity_tier: string | null;
  model: string | null;
  plate: string | null;
  year: number | null;
  color: string | null;
  is_active: boolean | null;
  verification_status: string | null;
  passenger_capacity: number | null;
  tech_passport_front: string | null;
  tech_passport_back: string | null;
  photo_front: string | null;
  photo_rear: string | null;
  photo_left: string | null;
  photo_right: string | null;
  photo_interior: string | null;
};

export type FleetEntry = {
  /** One row per car: the vehicle's id. */
  key: string;
  category: FleetCategoryId;
  cls: FleetClass | null;
  tier: string | null;
  driver: FleetDriverInput;
  vehicle: FleetVehicleInput;
  languages: string[];
  photosCount: number;
  idOk: boolean;
  licenseOk: boolean;
  techOk: boolean;
  problems: FleetProblemCode[];
};

const has = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim().length > 0;

export function fleetCategoryOf(type: string | null | undefined): FleetCategoryId {
  switch ((type ?? '').trim().toLowerCase()) {
    case 'sedan':
      return 'sedan';
    case 'minivan':
      return 'minivan';
    case 'microbus':
      return 'microbus';
    case 'bus':
      return 'bus';
    case 'suv':
    case 'offroad':
      return 'suv';
    default:
      return 'other';
  }
}

export function fleetClassOf(cls: string | null | undefined): FleetClass | null {
  const c = (cls ?? '').trim().toLowerCase();
  return c === 'economy' || c === 'comfort' || c === 'vip' ? c : null;
}

/** Lower-case, trimmed, de-duplicated codes; the loader passes them through sanitizeLanguageCodes first. */
export function normalizeFleetLanguages(raw: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const x of raw ?? []) {
    if (typeof x !== 'string') continue;
    const c = x.trim().toLowerCase();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export function countVehiclePhotos(v: FleetVehicleInput): number {
  return [v.photo_front, v.photo_rear, v.photo_left, v.photo_right, v.photo_interior].filter(has).length;
}

export function fleetProblemsOf(entry: Omit<FleetEntry, 'problems'>): FleetProblemCode[] {
  const p: FleetProblemCode[] = [];
  const d = entry.driver;
  const v = entry.vehicle;
  if (entry.languages.length === 0) p.push('no_languages');
  if (d.is_blocked) p.push('driver_blocked');
  if (!entry.idOk) p.push('id_missing');
  if (!entry.licenseOk) p.push('license_missing');
  if (!entry.techOk) p.push('tech_passport_missing');
  if (FLEET_TIERED_CATEGORIES.includes(entry.category) && !has(entry.tier)) p.push('no_seat_tier');
  if (entry.photosCount < 5) p.push('photos_missing');
  if (d.verification_status !== 'approved' || d.is_verified !== true) p.push('driver_not_verified');
  if (v.verification_status !== 'approved') p.push('vehicle_not_approved');
  if (v.is_active !== true) p.push('vehicle_off');
  return FLEET_PROBLEM_ORDER.filter((code) => p.includes(code));
}

/**
 * One entry per car that has a plate and an owner who is a driver (a row with
 * no plate is an abandoned draft, as the dispatch treats it). A driver with
 * two cars appears once in each car's category.
 */
export function buildFleetEntries(drivers: FleetDriverInput[], vehicles: FleetVehicleInput[]): FleetEntry[] {
  const byId = new Map(drivers.map((d) => [d.id, d] as const));
  const out: FleetEntry[] = [];
  for (const v of vehicles) {
    if (!v.driver_id || !has(v.plate)) continue;
    const d = byId.get(v.driver_id);
    if (!d) continue;
    const category = fleetCategoryOf(v.type);
    const base = {
      key: v.id,
      category,
      cls: fleetClassOf(v.class),
      tier: has(v.capacity_tier) ? (v.capacity_tier as string).trim() : null,
      driver: d,
      vehicle: v,
      languages: normalizeFleetLanguages(d.languages),
      photosCount: countVehiclePhotos(v),
      idOk: (has(d.id_front) && has(d.id_back)) || has(d.id_photo),
      licenseOk: (has(d.license_front) && has(d.license_back)) || has(d.license_photo),
      techOk: has(v.tech_passport_front) && has(v.tech_passport_back),
    };
    out.push({ ...base, problems: fleetProblemsOf(base) });
  }
  return sortFleetEntries(out);
}

/** What blocks work first, then by name. */
export function sortFleetEntries(entries: FleetEntry[]): FleetEntry[] {
  const weight = (e: FleetEntry) =>
    e.problems.reduce((sum, p) => sum + (FLEET_PROBLEM_TONE[p] === 'danger' ? 10 : FLEET_PROBLEM_TONE[p] === 'warn' ? 3 : 1), 0);
  return [...entries].sort((a, b) => {
    const w = weight(b) - weight(a);
    if (w !== 0) return w;
    return (a.driver.full_name ?? '').localeCompare(b.driver.full_name ?? '', 'ka');
  });
}

export type FleetFilter = {
  category: FleetCategoryId;
  cls: FleetClass | 'all';
  /** A capacity tier code, 'none' (no tier set) or 'all'. */
  tier: string;
  /** A language code, 'none' (no language at all) or 'all'. */
  lang: string;
  onlyProblems: boolean;
  query: string;
};

export function filterFleetEntries(entries: FleetEntry[], f: FleetFilter): FleetEntry[] {
  const q = f.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (e.category !== f.category) return false;
    if (f.cls !== 'all' && e.cls !== f.cls) return false;
    if (f.tier === 'none' && e.tier) return false;
    if (f.tier !== 'all' && f.tier !== 'none' && e.tier !== f.tier) return false;
    if (f.lang === 'none' && e.languages.length > 0) return false;
    if (f.lang !== 'all' && f.lang !== 'none' && !e.languages.includes(f.lang)) return false;
    if (f.onlyProblems && e.problems.length === 0) return false;
    if (q) {
      const hay = [e.driver.full_name, e.driver.phone, e.vehicle.model, e.vehicle.plate, e.driver.city]
        .filter(has)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type FleetCategorySummary = {
  id: FleetCategoryId;
  total: number;
  active: number;
  byClass: Record<FleetClass, number>;
  /** Capacity tiers present in this category with their car counts; 'none' = cars without one. */
  byTier: { tier: string; count: number }[];
  /** Distinct drivers in this category with no language at all. */
  driversWithoutLanguages: number;
  problems: { code: FleetProblemCode; count: number }[];
};

export function summarizeFleetCategory(entries: FleetEntry[], id: FleetCategoryId): FleetCategorySummary {
  const list = entries.filter((e) => e.category === id);
  const byClass: Record<FleetClass, number> = { economy: 0, comfort: 0, vip: 0 };
  const tiers = new Map<string, number>();
  const noLangDrivers = new Set<string>();
  const problemCounts = new Map<FleetProblemCode, number>();
  for (const e of list) {
    if (e.cls) byClass[e.cls] += 1;
    if (FLEET_TIERED_CATEGORIES.includes(id)) {
      const t = e.tier ?? 'none';
      tiers.set(t, (tiers.get(t) ?? 0) + 1);
    }
    if (e.languages.length === 0) noLangDrivers.add(e.driver.id);
    for (const p of e.problems) problemCounts.set(p, (problemCounts.get(p) ?? 0) + 1);
  }
  const byTier = [...tiers.entries()]
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => (a.tier === 'none' ? 1 : b.tier === 'none' ? -1 : tierSeats(a.tier) - tierSeats(b.tier)));
  return {
    id,
    total: list.length,
    active: list.filter((e) => e.vehicle.is_active === true).length,
    byClass,
    byTier,
    driversWithoutLanguages: noLangDrivers.size,
    problems: FLEET_PROBLEM_ORDER.filter((c) => problemCounts.has(c)).map((code) => ({
      code,
      count: problemCounts.get(code) ?? 0,
    })),
  };
}

/** Smallest seat count of a tier code like 'minivan_3_5' or 'microbus_16', for ordering. */
export function tierSeats(tier: string): number {
  const m = /(\d+)/.exec(tier);
  return m ? Number(m[1]) : 0;
}

/** '3–5', '6–8', '16' — the seat part of a tier code, for labels. */
export function tierSeatsLabel(tier: string): string {
  const nums = tier.match(/\d+/g) ?? [];
  if (nums.length >= 2) return `${nums[0]}–${nums[1]}`;
  return nums[0] ?? tier;
}

/** The categories that have at least one car, in tab order (`other` only when used). */
export function fleetCategoriesInUse(entries: FleetEntry[]): FleetCategoryId[] {
  return FLEET_CATEGORIES.filter((c) => c !== 'other' || entries.some((e) => e.category === 'other'));
}

export type FleetEntryStatus = 'blocked' | 'review' | 'off' | 'active';

/** One word for the row: blocked, waiting for verification, car switched off, or working. */
export function fleetEntryStatus(e: FleetEntry): FleetEntryStatus {
  if (e.driver.is_blocked) return 'blocked';
  if (e.driver.verification_status !== 'approved' || e.driver.is_verified !== true) return 'review';
  if (e.vehicle.is_active !== true) return 'off';
  return 'active';
}

/** "ლკ" for "ლევან კაპანაძე". */
export function fleetInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  // No toUpperCase: it turns Georgian letters into Mtavruli capitals.
  return Array.from(words.map((w) => Array.from(w)[0] ?? '').join('')).slice(0, 2).join('') || '—';
}

/** Distinct drivers across the whole fleet with no language at all — the call list. */
export function driversWithoutLanguages(entries: FleetEntry[]): FleetDriverInput[] {
  const seen = new Map<string, FleetDriverInput>();
  for (const e of entries) if (e.languages.length === 0 && !seen.has(e.driver.id)) seen.set(e.driver.id, e.driver);
  return [...seen.values()];
}
