import { storagePublicUrlBase } from './mediaUpload';
import { supabase } from './supabase';
import {
  type VerificationDocSlot,
  VERIFICATION_DOC_COLUMNS,
} from './verificationDocs';

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

  const { data, error } = await supabase.from('users').update(payload).eq('id', userId).select('id');
  if (error) return { error };
  if (!data?.length) {
    return {
      error: {
        message: 'პროფილის განახლება ვერ მოხერხდა — გამოდით და ხელახლა შედით ანგარიშში',
        details: '',
        hint: '',
        code: 'PGRST116',
      },
    };
  }
  return { error: null };
}

/** Upload one document side (front or back) and sync legacy single-photo columns when applicable. */
export async function saveSingleVerificationDocument(
  userId: string,
  slot: VerificationDocSlot,
  publicUrl: string,
) {
  const url = storagePublicUrlBase(publicUrl);
  const payload: Record<string, string | null> = {
    [slot]: url,
  };
  if (slot === 'id_front') payload.id_photo = url;
  if (slot === 'license_front') payload.license_photo = url;
  if (slot === 'tech_passport_front') payload.vehicle_registration_photo = url;

  const { data: current, error: readErr } = await supabase
    .from('users')
    .select('verification_status')
    .eq('id', userId)
    .maybeSingle();
  if (readErr) {
    return { error: readErr };
  }

  const status = (current?.verification_status ?? 'pending') as VerificationStatus;
  if (status === 'rejected') {
    payload.verification_status = 'pending';
    payload.rejection_reason = null;
  } else if (status === 'submitted' || status === 'approved') {
    payload.verification_status = 'submitted';
    payload.rejection_reason = null;
  }

  const { data, error } = await supabase.from('users').update(payload).eq('id', userId).select('id');
  if (error) return { error };
  if (!data?.length) {
    return {
      error: {
        message: 'პროფილის განახლება ვერ მოხერხდა — გამოდით და ხელახლა შედით ანგარიშში',
        details: '',
        hint: '',
        code: 'PGRST116',
      },
    };
  }
  return { error: null };
}
