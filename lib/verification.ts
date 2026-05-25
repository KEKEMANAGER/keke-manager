import { storagePublicUrlBase } from './mediaUpload';
import { supabase } from './supabase';
import {
  type VerificationDocSlot,
  type VerificationSimpleDoc,
  VERIFICATION_DOC_COLUMNS,
} from './verificationDocs';

const SIMPLE_DOC_SLOTS: Record<VerificationSimpleDoc, VerificationDocSlot[]> = {
  id: ['id_front', 'id_back'],
  license: ['license_front', 'license_back'],
  registration: ['tech_passport_front', 'tech_passport_back'],
};

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

/** Upload one document group and mirror URL to front/back + legacy columns. */
export async function saveSingleVerificationDocument(
  userId: string,
  doc: VerificationSimpleDoc,
  publicUrl: string,
) {
  const url = storagePublicUrlBase(publicUrl);
  const payload: Record<string, string | null> = {};
  for (const slot of SIMPLE_DOC_SLOTS[doc]) {
    payload[slot] = url;
  }
  if (doc === 'id') payload.id_photo = url;
  if (doc === 'license') payload.license_photo = url;
  if (doc === 'registration') payload.vehicle_registration_photo = url;

  const { error } = await supabase.from('users').update(payload).eq('id', userId);
  return { error };
}
