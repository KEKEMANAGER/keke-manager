/** OpenStreetMap Nominatim geocoding + OSRM driving distance (Georgia tourism routes). */

export type GeoPoint = { lat: number; lon: number };

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const OSRM_ROUTE = 'https://router.project-osrm.org/route/v1/driving';

const USER_AGENT = 'KEKE-Manager/1.0 (pricing-calculator; contact@kekemanager.com)';

/**
 * The places Georgian tour transport actually runs between, with the spellings
 * companies actually type — Georgian, English, and the common short forms.
 *
 * This is not an optimisation. Nominatim rate-limits to about one request a
 * second and its answers for a bare „ყაზბეგი" or "Kazbegi" are not reliable, so
 * every route that resolves from this table is one that cannot silently come
 * back wrong. City-level precision is enough: OSRM snaps to the nearest road,
 * and a few hundred metres do not move a price.
 */
type Preset = { point: GeoPoint; names: string[] };

const PRESETS: Preset[] = [
  // Airports and stations
  { point: { lat: 41.6692, lon: 44.9547 }, names: ['თბილისის აეროპორტი', 'tbilisi airport', 'tbilisi international airport', 'tbs'] },
  { point: { lat: 41.6102, lon: 41.5996 }, names: ['ბათუმის აეროპორტი', 'batumi airport', 'bus'] },
  { point: { lat: 42.1767, lon: 42.4826 }, names: ['ქუთაისის აეროპორტი', 'kutaisi airport', 'kutaisi international airport', 'kut'] },
  { point: { lat: 41.7176, lon: 44.7938 }, names: ['თბილისის სადგური', 'tbilisi railway station', 'tbilisi central station'] },
  { point: { lat: 41.6164, lon: 41.6366 }, names: ['ბათუმის სადგური', 'batumi railway station'] },
  { point: { lat: 42.2644, lon: 42.7182 }, names: ['ქუთაისის სადგური', 'kutaisi railway station'] },

  // Cities
  { point: { lat: 41.7151, lon: 44.8271 }, names: ['თბილისი', 'tbilisi', 'tiflis'] },
  { point: { lat: 41.6168, lon: 41.6367 }, names: ['ბათუმი', 'batumi'] },
  { point: { lat: 42.2679, lon: 42.694 }, names: ['ქუთაისი', 'kutaisi'] },
  { point: { lat: 41.5497, lon: 45.0 }, names: ['რუსთავი', 'rustavi'] },
  { point: { lat: 41.9842, lon: 44.1108 }, names: ['გორი', 'gori'] },
  { point: { lat: 41.9197, lon: 45.4731 }, names: ['თელავი', 'telavi'] },
  { point: { lat: 42.5088, lon: 41.8709 }, names: ['ზუგდიდი', 'zugdidi'] },
  { point: { lat: 42.1462, lon: 41.6716 }, names: ['ფოთი', 'poti'] },
  { point: { lat: 41.6392, lon: 42.9826 }, names: ['ახალციხე', 'akhaltsikhe'] },

  // Mountain / ski
  { point: { lat: 42.4762, lon: 44.4778 }, names: ['გუდაური', 'gudauri'] },
  { point: { lat: 42.6572, lon: 44.6436 }, names: ['ყაზბეგი', 'kazbegi', 'სტეფანწმინდა', 'stepantsminda'] },
  { point: { lat: 43.045, lon: 42.73 }, names: ['მესტია', 'mestia'] },
  { point: { lat: 42.9167, lon: 43.0167 }, names: ['უშგული', 'ushguli'] },
  { point: { lat: 41.75, lon: 43.53 }, names: ['ბაკურიანი', 'bakuriani'] },
  { point: { lat: 41.8303, lon: 43.3849 }, names: ['ბორჯომი', 'borjomi'] },
  { point: { lat: 42.1631, lon: 44.7031 }, names: ['ანანური', 'ananuri'] },

  // Kakheti
  { point: { lat: 41.6168, lon: 45.9215 }, names: ['სიღნაღი', 'sighnaghi', 'signagi'] },
  { point: { lat: 41.9531, lon: 45.8122 }, names: ['ყვარელი', 'kvareli'] },

  // Sights
  { point: { lat: 41.8458, lon: 44.7208 }, names: ['მცხეთა', 'mtskheta'] },
  { point: { lat: 41.9667, lon: 44.2083 }, names: ['უფლისციხე', 'uplistsikhe'] },
  { point: { lat: 41.3806, lon: 43.2847 }, names: ['ვარძია', 'vardzia'] },
  { point: { lat: 42.3392, lon: 42.6 }, names: ['წყალტუბო', 'tskaltubo', 'პრომეთეს მღვიმე', 'prometheus cave'] },
  { point: { lat: 42.4142, lon: 42.3806 }, names: ['მარტვილი', 'martvili', 'მარტვილის კანიონი', 'martvili canyon'] },
  { point: { lat: 41.8214, lon: 41.7783 }, names: ['ქობულეთი', 'kobuleti'] },
  { point: { lat: 42.0167, lon: 41.7833 }, names: ['ურეკი', 'ureki'] },

  // Borders — tour operators book to and from these constantly
  { point: { lat: 41.5211, lon: 41.5464 }, names: ['სარფი', 'sarpi', 'სარფის საზღვარი', 'sarpi border'] },
  { point: { lat: 41.2333, lon: 44.75 }, names: ['სადახლო', 'sadakhlo', 'სადახლოს საზღვარი', 'sadakhlo border'] },
  { point: { lat: 41.8667, lon: 46.3167 }, names: ['ლაგოდეხი', 'lagodekhi', 'ლაგოდეხოს საზღვარი', 'lagodekhi border'] },
  { point: { lat: 42.7167, lon: 44.6333 }, names: ['ზემო ლარსი', 'larsi', 'zemo larsi', 'kazbegi border'] },
];

function normalizePlaceKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const PRESET_BY_NAME = new Map<string, GeoPoint>();
for (const preset of PRESETS) {
  for (const name of preset.names) {
    PRESET_BY_NAME.set(normalizePlaceKey(name), preset.point);
  }
}

/**
 * Exact match first, then "does the typed text contain a known place" — because
 * what companies actually type is „Ushguli panorama" or "Hotel Moxy, Tbilisi",
 * not a clean place name.
 */
function lookupPreset(name: string): GeoPoint | null {
  const key = normalizePlaceKey(name);
  if (!key) return null;

  const exact = PRESET_BY_NAME.get(key);
  if (exact) return exact;

  let best: { point: GeoPoint; length: number } | null = null;
  for (const [label, point] of PRESET_BY_NAME) {
    if (label.length < 5) continue; // "gori" inside "Gorimeli" is not a match worth making
    if (!key.includes(label)) continue;
    if (!best || label.length > best.length) best = { point, length: label.length };
  }
  return best?.point ?? null;
}

async function nominatimSearch(query: string): Promise<GeoPoint | null> {
  const q = query.trim();
  if (!q) return null;

  const url = new URL(NOMINATIM_SEARCH);
  url.searchParams.set('q', q.includes('Georgia') || q.includes('საქართველო') ? q : `${q}, Georgia`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'ge');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return null;

  const rows = (await res.json()) as { lat?: string; lon?: string }[];
  const hit = rows[0];
  if (!hit?.lat || !hit?.lon) return null;

  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/** Resolve a location label to coordinates (preset table, then Nominatim). */
export async function geocodeLocationName(name: string): Promise<GeoPoint | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const preset = lookupPreset(trimmed);
  if (preset) return preset;
  return nominatimSearch(trimmed);
}

/** Driving distance in km between two coordinates (OSRM). */
export async function fetchDrivingDistanceKm(from: GeoPoint, to: GeoPoint): Promise<number | null> {
  const path = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM_ROUTE}/${path}?overview=false`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    code?: string;
    routes?: { distance?: number }[];
  };
  if (data.code !== 'Ok' || !data.routes?.[0]) return null;

  const meters = data.routes[0].distance;
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) return null;
  return meters / 1000;
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Names whose roads climb and switchback rather than going where the crow flies. */
const MOUNTAIN_DETOUR_HINTS = [
  'მესტია', 'mestia', 'უშგული', 'ushguli', 'ყაზბეგი', 'kazbegi', 'სტეფანწმინდა',
  'stepantsminda', 'გუდაური', 'gudauri', 'ომალო', 'omalo', 'თუშეთი', 'tusheti',
  'შატილი', 'shatili', 'ლენტეხი', 'lentekhi', 'რაჭა', 'racha', 'შოვი', 'shovi',
];

/**
 * Road distance guessed from coordinates, for when OSRM cannot be reached.
 *
 * Straight-line distance times a detour factor, calibrated against real Georgian
 * roads: Tbilisi–Kutaisi is 1.30× the crow's flight, Tbilisi–Batumi 1.42×,
 * Tbilisi–Kazbegi 1.50× — but Kutaisi–Mestia is 2.7×, because the road has to
 * find its way over the Caucasus. Hence the two factors. It is a guess and its
 * callers must say so; it exists so a mountain tour is never priced as if the
 * van flew there.
 */
export function estimateRoadDistanceKm(from: GeoPoint, to: GeoPoint, routeText?: string): number {
  const straight = haversineKm(from, to);
  const text = String(routeText ?? '').toLowerCase();
  const mountainous = MOUNTAIN_DETOUR_HINTS.some((hint) => text.includes(hint));
  const factor = mountainous ? 1.9 : 1.4;
  return Math.round(straight * factor * 10) / 10;
}

export type RouteSegment = { from: string; to: string };

export type RouteDistanceResult =
  | { ok: true; distanceKm: number }
  | { ok: false; error: 'missing_locations' | 'geocode_failed' | 'route_failed' };

/** Sum OSRM driving distances for one or more legs. */
export async function fetchRouteDistanceKm(segments: RouteSegment[]): Promise<RouteDistanceResult> {
  const legs = segments
    .map((s) => ({ from: s.from.trim(), to: s.to.trim() }))
    .filter((s) => s.from && s.to);

  if (!legs.length) {
    return { ok: false, error: 'missing_locations' };
  }

  let totalKm = 0;
  for (const leg of legs) {
    const [fromPt, toPt] = await Promise.all([
      geocodeLocationName(leg.from),
      geocodeLocationName(leg.to),
    ]);
    if (!fromPt || !toPt) {
      return { ok: false, error: 'geocode_failed' };
    }
    const km = await fetchDrivingDistanceKm(fromPt, toPt);
    if (km == null) {
      return { ok: false, error: 'route_failed' };
    }
    totalKm += km;
  }

  return { ok: true, distanceKm: Math.round(totalKm * 10) / 10 };
}
