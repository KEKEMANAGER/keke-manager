/** OpenStreetMap Nominatim geocoding + OSRM driving distance (Georgia tourism routes). */

export type GeoPoint = { lat: number; lon: number };

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const OSRM_ROUTE = 'https://router.project-osrm.org/route/v1/driving';

const USER_AGENT = 'KEKE-Manager/1.0 (pricing-calculator; contact@kekemanager.com)';

/** Known presets / cities to avoid flaky geocoder results. */
const PRESET_COORDS: Record<string, GeoPoint> = {
  'თბილისის აეროპორტი': { lat: 41.6692, lon: 44.9547 },
  'ბათუმის აეროპორტი': { lat: 41.6102, lon: 41.5996 },
  'ქუთაისის აეროპორტი': { lat: 42.1767, lon: 42.4826 },
  'თბილისის სადგური': { lat: 41.6428, lon: 41.6406 },
  'ბათუმის სადგური': { lat: 41.6164, lon: 41.6366 },
  'ქუთაისის სადგური': { lat: 42.2644, lon: 42.7182 },
  თბილისი: { lat: 41.7151, lon: 44.8271 },
  ბათუმი: { lat: 41.6168, lon: 41.6367 },
  ქუთაისი: { lat: 42.2679, lon: 42.694 },
  ბაკურიანი: { lat: 41.75, lon: 43.53 },
  გუდაური: { lat: 42.4762, lon: 44.4778 },
  ყაზბეგი: { lat: 42.6617, lon: 44.6217 },
  სტეფანწმინდა: { lat: 42.6572, lon: 44.6436 },
  მესტია: { lat: 43.045, lon: 42.73 },
  ბორჯომი: { lat: 41.8303, lon: 43.3849 },
  სიღნაღი: { lat: 41.6168, lon: 45.9215 },
};

function normalizePlaceKey(name: string): string {
  return name.trim().toLowerCase();
}

function lookupPreset(name: string): GeoPoint | null {
  const key = normalizePlaceKey(name);
  if (!key) return null;
  for (const [label, point] of Object.entries(PRESET_COORDS)) {
    if (normalizePlaceKey(label) === key) return point;
  }
  return null;
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

  const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
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
    routes?: Array<{ distance?: number }>;
  };
  if (data.code !== 'Ok' || !data.routes?.[0]) return null;

  const meters = data.routes[0].distance;
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) return null;
  return meters / 1000;
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
