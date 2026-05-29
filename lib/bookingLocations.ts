/** Structured booking location types (matches `bookings.from_location_type` / `to_location_type`). */

export type LocationType = 'airport' | 'train_station' | 'hotel' | 'address';

export type LocationValue = {
  type: LocationType | null;
  name: string;
};

export const LOCATION_TYPES: LocationType[] = ['airport', 'train_station', 'hotel', 'address'];

export const LOCATION_TYPE_ICONS: Record<LocationType, string> = {
  airport: '✈️',
  train_station: '🚂',
  hotel: '🏨',
  address: '📍',
};

export const AIRPORT_OPTIONS = [
  'თბილისის აეროპორტი',
  'ბათუმის აეროპორტი',
  'ქუთაისის აეროპორტი',
] as const;

export const TRAIN_STATION_OPTIONS = [
  'თბილისის სადგური',
  'ბათუმის სადგური',
  'ქუთაისის სადგური',
] as const;

export function isLocationType(value: string | null | undefined): value is LocationType {
  return value === 'airport' || value === 'train_station' || value === 'hotel' || value === 'address';
}

export function emptyLocationValue(): LocationValue {
  return { type: null, name: '' };
}

/** Infer type from known preset labels when loading legacy rows. */
export function locationValueFromStored(
  name: string | null | undefined,
  type: string | null | undefined,
): LocationValue {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return emptyLocationValue();
  if (isLocationType(type)) {
    return { type, name: trimmed };
  }
  if ((AIRPORT_OPTIONS as readonly string[]).includes(trimmed)) {
    return { type: 'airport', name: trimmed };
  }
  if ((TRAIN_STATION_OPTIONS as readonly string[]).includes(trimmed)) {
    return { type: 'train_station', name: trimmed };
  }
  return { type: null, name: trimmed };
}

export function presetOptionsForType(type: LocationType): readonly string[] {
  if (type === 'airport') return AIRPORT_OPTIONS;
  if (type === 'train_station') return TRAIN_STATION_OPTIONS;
  return [];
}

export function locationUsesPresetDropdown(type: LocationType | null): boolean {
  return type === 'airport' || type === 'train_station';
}

/** Persist to DB: name always in `*_location`; type only when set. */
export function persistLocationFields(value: LocationValue): {
  name: string | null;
  type: LocationType | null;
} {
  const name = value.name.trim() || null;
  if (!name) return { name: null, type: null };
  const type = value.type && isLocationType(value.type) ? value.type : null;
  return { name, type };
}

/** Display with icon when type is known; plain text for legacy (type null). */
export function formatLocationDisplay(
  name: string | null | undefined,
  type: string | null | undefined,
): string {
  const n = name?.trim();
  if (!n) return '—';
  if (isLocationType(type)) {
    return `${LOCATION_TYPE_ICONS[type]} ${n}`;
  }
  return n;
}

export function formatLocationRoute(
  fromName: string | null | undefined,
  fromType: string | null | undefined,
  toName: string | null | undefined,
  toType: string | null | undefined,
): string {
  const from = formatLocationDisplay(fromName, fromType);
  const to = formatLocationDisplay(toName, toType);
  if (from === '—' && to === '—') return '—';
  if (from === '—') return to;
  if (to === '—') return from;
  return `${from} → ${to}`;
}

export function locationValueIsComplete(value: LocationValue): boolean {
  return Boolean(value.type && value.name.trim());
}

export function locationFromTransferLeg(
  name: string | null | undefined,
  type: string | null | undefined,
): LocationValue {
  return locationValueFromStored(name, type);
}

export function transferLegLocationFields(value: LocationValue): {
  name: string;
  type?: LocationType;
} {
  const name = value.name.trim();
  if (!name) return { name: '' };
  if (value.type && isLocationType(value.type)) {
    return { name, type: value.type };
  }
  return { name };
}
