/** Company booking filter / stored on `bookings.requested_driver_category`. */
export type RequestedDriverCategory = 'all' | 'guide' | 'own_vehicle';

export const REQUESTED_DRIVER_CATEGORIES: readonly RequestedDriverCategory[] = [
  'all',
  'guide',
  'own_vehicle',
] as const;

export function normalizeRequestedDriverCategory(
  value: string | null | undefined,
): RequestedDriverCategory {
  const v = String(value ?? '').trim();
  if (v === 'guide' || v === 'own_vehicle') return v;
  return 'all';
}

export function driverMatchesRequestedCategory(
  driver: { is_guide_driver?: boolean | null; is_hired_driver?: boolean | null },
  category: RequestedDriverCategory | null | undefined,
): boolean {
  const cat = normalizeRequestedDriverCategory(category ?? 'all');
  if (cat === 'all') return true;
  const guide = driver.is_guide_driver === true;
  const hired = driver.is_hired_driver === true;
  if (hired) return false;
  if (cat === 'guide') return guide;
  if (cat === 'own_vehicle') return !guide;
  return true;
}

/** Open-job pool: hired drivers never receive broadcast requests. */
export function driverEligibleForOpenJobBroadcast(driver: {
  is_hired_driver?: boolean | null;
}): boolean {
  return driver.is_hired_driver !== true;
}
