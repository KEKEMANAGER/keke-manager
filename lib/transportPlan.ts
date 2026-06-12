import type { VehicleClassCode, VehicleTypeCode } from './vehicleCatalog';

export type TransportLegDraft = {
  id: string;
  vehicle_type: VehicleTypeCode;
  vehicle_class: VehicleClassCode;
  passengers: string;
  driver_id: string | null;
  driver_name: string | null;
};

export function newTransportLegId(): string {
  return `leg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newTransportLeg(overrides?: Partial<TransportLegDraft>): TransportLegDraft {
  return {
    id: newTransportLegId(),
    vehicle_type: 'bus',
    vehicle_class: 'comfort',
    passengers: '1',
    driver_id: null,
    driver_name: null,
    ...overrides,
  };
}

export function sumLegPassengers(legs: TransportLegDraft[]): number {
  return legs.reduce((sum, leg) => sum + Math.max(0, parseInt(leg.passengers, 10) || 0), 0);
}

export function legPassengers(leg: TransportLegDraft): number {
  return Math.max(1, parseInt(leg.passengers, 10) || 1);
}
