import { storagePublicUrlBase } from './mediaUpload';
import { supabase } from './supabase';
import { type VerificationDocSlot, VERIFICATION_DOC_COLUMNS } from './verificationDocs';

export type VerificationStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

const STATUS_SELECT = `is_verified, verification_status, is_hired_driver, ${VERIFICATION_DOC_COLUMNS}, rejection_reason`;

export async function fetchVerificationStatus(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select(STATUS_SELECT)
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
}

export type SubmitVerificationPayload = Partial<Record<VerificationDocSlot, string | null>>;

export async function submitVerification(userId: string, photos: SubmitVerificationPayload) {
  const payload: Record<string, string | null> = {
    verification_status: 'submitted',
    rejection_reason: null,
  };

  const slots: VerificationDocSlot[] = [
    'license_front',
    'license_back',
    'tech_passport_front',
    'tech_passport_back',
    'id_front',
    'id_back',
  ];

  for (const slot of slots) {
    const raw = photos[slot];
    payload[slot] = raw ? storagePublicUrlBase(raw) : null;
  }

  // Legacy single-photo columns (admin fallback)
  payload.license_photo = payload.license_front;
  payload.id_photo = payload.id_front;
  payload.vehicle_registration_photo = payload.tech_passport_front;

  const { error } = await supabase.from('users').update(payload).eq('id', userId);
  return { error };
}
