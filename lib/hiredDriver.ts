import { supabase } from './supabase';
import { trimUserId } from './userId';

/** `is_hired_driver` or active fleet sub (employed driver). */
export async function isHiredOrFleetSubDriver(driverUserId: string): Promise<boolean> {
  const id = trimUserId(driverUserId);
  if (!id) return false;

  const { data: user } = await supabase
    .from('users')
    .select('is_hired_driver')
    .eq('id', id)
    .maybeSingle();

  if ((user as { is_hired_driver?: boolean } | null)?.is_hired_driver) return true;

  const { data: fleet } = await supabase
    .from('driver_fleet')
    .select('id')
    .eq('sub_driver_id', id)
    .eq('status', 'accepted')
    .maybeSingle();

  return !!fleet;
}

/** Employment label for UI (`employment_type` concept). */
export function employmentTypeLabel(isHired: boolean): 'hired' | 'freelance' {
  return isHired ? 'hired' : 'freelance';
}
