import type { MatchingDriver } from './drivers';
import { formatSpokenLanguagesList } from './spokenLanguages';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  vehicleClassLabel,
  vehicleTypeLabel,
} from './vehicleCatalog';

export type DriverTargetMode = 'all' | 'specific';

export function formatDriverLanguages(languages: string[]): string {
  return formatSpokenLanguagesList(languages);
}

export function matchingDriverVehicleLine(
  vehicle: MatchingDriver['vehicle'],
  seatsLabel: (count: number) => string,
): string {
  if (!vehicle) return '';
  const typeClass = [
    vehicle.type ? vehicleTypeLabel(normalizeVehicleType(vehicle.type)) : null,
    vehicle.class ? vehicleClassLabel(normalizeVehicleClass(vehicle.class)) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const parts: string[] = [];
  if (typeClass) parts.push(typeClass);
  if (vehicle.passenger_capacity != null && vehicle.passenger_capacity > 0) {
    parts.push(seatsLabel(vehicle.passenger_capacity));
  }
  if (vehicle.model?.trim()) parts.push(vehicle.model.trim());
  if (vehicle.year != null) parts.push(String(vehicle.year));
  if (vehicle.plate?.trim()) parts.push(vehicle.plate.trim());
  const head = parts.join(' — ');
  if (vehicle.color?.trim()) {
    return head ? `${head}, ${vehicle.color.trim()}` : vehicle.color.trim();
  }
  return head;
}
