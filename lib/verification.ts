import { supabase } from './supabase';

export type VerificationStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export async function fetchVerificationStatus(clerkId: string) {
  const { data, error } = await supabase
    .from('users')
    .select(
      'is_verified, verification_status, license_photo, id_photo, vehicle_registration_photo, rejection_reason',
    )
    .eq('clerk_id', clerkId)
    .maybeSingle();
  return { data, error };
}

export async function submitVerification(
  clerkId: string,
  photos: {
    license_photo: string;
    id_photo: string;
    vehicle_registration_photo: string;
  },
) {
  const { error } = await supabase
    .from('users')
    .update({
      license_photo: photos.license_photo,
      id_photo: photos.id_photo,
      vehicle_registration_photo: photos.vehicle_registration_photo,
      verification_status: 'submitted',
      rejection_reason: null,
    })
    .eq('clerk_id', clerkId);
  return { error };
}
