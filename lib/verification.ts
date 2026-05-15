import { storagePublicUrlBase } from './mediaUpload';
import { supabase } from './supabase';

export type VerificationStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export async function fetchVerificationStatus(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select(
      'is_verified, verification_status, license_photo, id_photo, vehicle_registration_photo, rejection_reason',
    )
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
}

export async function submitVerification(
  userId: string,
  photos: {
    license_photo: string;
    id_photo: string;
    vehicle_registration_photo: string;
  },
) {
  const { error } = await supabase
    .from('users')
    .update({
      license_photo: storagePublicUrlBase(photos.license_photo),
      id_photo: storagePublicUrlBase(photos.id_photo),
      vehicle_registration_photo: storagePublicUrlBase(photos.vehicle_registration_photo),
      verification_status: 'submitted',
      rejection_reason: null,
    })
    .eq('id', userId);
  return { error };
}
