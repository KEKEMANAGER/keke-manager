import { storagePublicUrlBase, withCacheBust } from './mediaUpload';
import type { VehiclePhotoKey } from './vehicles';

const VEHICLE_PHOTO_ORDER: VehiclePhotoKey[] = [
  'photo_front',
  'photo_left',
  'photo_right',
  'photo_interior',
  'photo_rear',
];

function resolvePhotoUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.trim().startsWith('http')) return null;
  const base = storagePublicUrlBase(raw.trim());
  return withCacheBust(base) ?? base;
}

/** First available vehicle image URL from `vehicles` row (media bucket). */
export function firstVehiclePhotoUrl(
  vehicle: Partial<Record<VehiclePhotoKey, string | null>> | null | undefined,
): string | null {
  if (!vehicle) return null;
  for (const key of VEHICLE_PHOTO_ORDER) {
    const url = resolvePhotoUrl(vehicle[key]);
    if (url) return url;
  }
  return null;
}

/** All available vehicle photo URLs in display order (deduped). */
export function allVehiclePhotoUrls(
  vehicle: Partial<Record<VehiclePhotoKey, string | null>> | null | undefined,
): string[] {
  if (!vehicle) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of VEHICLE_PHOTO_ORDER) {
    const url = resolvePhotoUrl(vehicle[key]);
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}
