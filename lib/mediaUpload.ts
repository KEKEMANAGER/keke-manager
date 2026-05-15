import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Read local image URI (Expo native / web) into an ArrayBuffer for Supabase Storage.
 * Used on native; web file inputs should pass a `File` / `Blob` instead when possible.
 */
export async function readImageAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(`ფოტოს წაკითხვა ვერ მოხერხდა (${res.status})`);
  }
  return res.arrayBuffer();
}

function guessContentType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes('png')) return 'image/png';
  if (lower.includes('webp')) return 'image/webp';
  return 'image/jpeg';
}

function contentTypeForBlob(source: Blob, override?: string): string {
  if (override && override.startsWith('image/')) return override;
  if (typeof (source as File).type === 'string' && (source as File).type.startsWith('image/')) {
    return (source as File).type;
  }
  return 'image/jpeg';
}

/**
 * Upload to bucket `media` at `objectPath`.
 * - **Web + `Blob` (e.g. `File`)**: passes the body through to Storage as-is (no ArrayBuffer conversion).
 * - **Native + string URI**: `fetch` → `ArrayBuffer` (existing behavior).
 */
export async function uploadMediaObject(
  objectPath: string,
  source: string | Blob,
  options?: { contentType?: string },
): Promise<string> {
  const bucket = supabase.storage.from('media');

  let body: Blob | ArrayBuffer;
  let contentType: string;

  if (Platform.OS === 'web' && typeof Blob !== 'undefined' && source instanceof Blob) {
    body = source;
    contentType = contentTypeForBlob(source, options?.contentType);
  } else if (typeof source === 'string') {
    contentType = options?.contentType ?? guessContentType(source);
    body = await readImageAsArrayBuffer(source);
  } else {
    throw new Error('ატვირთვის წყარო არასწორია');
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

/** Strip cache-busting query string before persisting URLs in the database. */
export function storagePublicUrlBase(url: string): string {
  return url.split('?')[0];
}

/** Append a cache-busting query param so replaced Storage objects refresh in `<Image>`. */
export function withCacheBust(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('http')) return null;
  return `${storagePublicUrlBase(url)}?t=${Date.now()}`;
}

/** `verification/[user_id]/[slot].jpg` — slot: license | id | registration */
export function verificationPhotoObjectPath(userId: string, slot: 'license' | 'id' | 'registration'): string {
  return `verification/${userId}/${slot}.jpg`;
}

/** `avatars/[user_id].jpg` inside bucket `media`. */
export function avatarObjectPath(userId: string): string {
  return `avatars/${userId}.jpg`;
}

/** `vehicles/[user_id]/[angle].jpg` — angle: front | left | right | interior | rear */
export function vehiclePhotoObjectPath(userId: string, angle: string): string {
  return `vehicles/${userId}/${angle}.jpg`;
}
