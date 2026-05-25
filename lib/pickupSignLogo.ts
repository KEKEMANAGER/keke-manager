import { Platform } from 'react-native';
import { readImageAsArrayBuffer, storagePublicUrlBase } from './mediaUpload';
import { supabase } from './supabase';

export const PICKUP_SIGN_LOGO_BUCKET = 'booking-pickup-signs';
export const PICKUP_SIGN_LOGO_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/pdf',
]);

export type PickupSignLogoFile = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  blob?: Blob;
};

export function isPickupSignLogoPdf(file: PickupSignLogoFile | null | undefined): boolean {
  if (!file) return false;
  return file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function validatePickupSignLogoFile(file: PickupSignLogoFile): string | null {
  const mime = file.mimeType?.toLowerCase() ?? '';
  if (!ALLOWED_MIME.has(mime)) {
    return 'pickupSignLogo.invalidType';
  }
  if (file.size > PICKUP_SIGN_LOGO_MAX_BYTES) {
    return 'pickupSignLogo.tooLarge';
  }
  return null;
}

export function pickupSignLogoObjectPath(bookingId: string, mimeType: string): string {
  const lower = mimeType.toLowerCase();
  const ext = lower === 'application/pdf' ? 'pdf' : lower.includes('png') ? 'png' : 'jpg';
  return `${bookingId.trim()}/${Date.now()}.${ext}`;
}

async function uploadToPickupSignBucket(
  objectPath: string,
  source: PickupSignLogoFile,
): Promise<string> {
  const bucket = supabase.storage.from(PICKUP_SIGN_LOGO_BUCKET);
  let body: Blob | ArrayBuffer;
  const contentType = source.mimeType;

  if (Platform.OS === 'web' && source.blob) {
    body = source.blob;
  } else if (typeof source.uri === 'string') {
    body = await readImageAsArrayBuffer(source.uri);
  } else {
    throw new Error('pickupSignLogo.invalidSource');
  }

  const { error } = await bucket.upload(objectPath, body, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(error.message);
  }
  const { data } = bucket.getPublicUrl(objectPath);
  return storagePublicUrlBase(data.publicUrl);
}

export async function uploadPickupSignLogo(
  bookingId: string,
  file: PickupSignLogoFile,
): Promise<{ url: string | null; error: Error | null }> {
  const id = bookingId.trim();
  if (!id) {
    return { url: null, error: new Error('pickupSignLogo.missingBookingId') };
  }
  const validationKey = validatePickupSignLogoFile(file);
  if (validationKey) {
    return { url: null, error: new Error(validationKey) };
  }
  try {
    const path = pickupSignLogoObjectPath(id, file.mimeType);
    const url = await uploadToPickupSignBucket(path, file);
    return { url, error: null };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'pickupSignLogo.uploadFailed';
    return { url: null, error: new Error(message) };
  }
}

export async function setBookingPickupSignLogoUrl(
  bookingId: string,
  url: string | null,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('bookings')
    .update({ pickup_sign_logo_url: url })
    .eq('id', bookingId.trim());
  if (error) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}
