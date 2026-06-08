import { fetchActiveVehiclesByDriver } from './vehicles';
import { normalizeVehicleClass, normalizeVehicleType } from './vehicleCatalog';

export type ResolveVehicleIdParams = {
  driverId: string;
  vehicleType: string | null;
  vehicleClass?: string | null;
  /** When already known (fleet assign, explicit pick). */
  preferredVehicleId?: string | null;
};

/**
 * Pick the vehicle row that matches booking type/class.
 * Falls back to most recently updated active vehicle for the driver.
 */
export async function resolveVehicleIdForBooking(
  params: ResolveVehicleIdParams,
): Promise<string | null> {
  const driverId = params.driverId.trim();
  if (!driverId) return null;

  const preferred = params.preferredVehicleId?.trim();
  if (preferred) return preferred;

  const bookingType = normalizeVehicleType(params.vehicleType ?? '');
  if (!bookingType) return null;

  const bookingClass = normalizeVehicleClass(params.vehicleClass ?? '');

  const { data: vehicles, error } = await fetchActiveVehiclesByDriver(driverId);
  if (error || !vehicles.length) return null;

  const matching = vehicles.filter((v) => {
    const vt = normalizeVehicleType(v.type ?? '');
    if (vt !== bookingType) return false;
    const vc = normalizeVehicleClass(v.class ?? '');
    if (bookingClass && vc && vc !== bookingClass) return false;
    return true;
  });

  if (matching.length > 0) return matching[0].id;
  if (bookingClass) return null;
  return vehicles[0]?.id ?? null;
}
