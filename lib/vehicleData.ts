import type { VehicleTypeCode } from './vehicleCatalog';
import { supabase } from './supabase';

export type VehicleMakeRow = {
  id: number;
  name: string;
  category: string;
};

export type VehicleModelRow = {
  id: number;
  make_id: number;
  name: string;
  body_type: string | null;
};

/** Maps booking/vehicle type picker → makes.category filter. */
export const TYPE_TO_MAKE_CATEGORY: Record<VehicleTypeCode, string> = {
  sedan: 'car',
  suv: 'car',
  minivan: 'minivan',
  microbus: 'minibus',
  bus: 'bus',
  special: 'special',
};

export async function fetchVehicleMakes(category?: string): Promise<{
  data: VehicleMakeRow[];
  error: Error | null;
}> {
  let query = supabase.from('vehicle_makes').select('id, name, category').order('name');
  if (category) {
    query = query.eq('category', category);
  }
  const { data, error } = await query;
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as VehicleMakeRow[], error: null };
}

export async function fetchVehicleModels(makeId: number): Promise<{
  data: VehicleModelRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('vehicle_models')
    .select('id, make_id, name, body_type')
    .eq('make_id', makeId)
    .order('name');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as VehicleModelRow[], error: null };
}

export async function fetchVehicleMakeById(makeId: number): Promise<VehicleMakeRow | null> {
  const { data } = await supabase
    .from('vehicle_makes')
    .select('id, name, category')
    .eq('id', makeId)
    .maybeSingle();
  return (data as VehicleMakeRow | null) ?? null;
}

export async function fetchVehicleModelById(modelId: number): Promise<VehicleModelRow | null> {
  const { data } = await supabase
    .from('vehicle_models')
    .select('id, make_id, name, body_type')
    .eq('id', modelId)
    .maybeSingle();
  return (data as VehicleModelRow | null) ?? null;
}

export function vehicleYearsDescending(from = 2026, to = 1990): number[] {
  const years: number[] = [];
  for (let y = from; y >= to; y--) years.push(y);
  return years;
}
