import {
  avatarObjectPath,
  vehiclePhotoObjectPath,
  verificationPhotoObjectPath,
} from './mediaUpload';
import { PICKUP_SIGN_LOGO_BUCKET } from './pickupSignLogo';
import { VERIFICATION_DOC_COLUMNS, type VerificationDocSlot } from './verificationDocs';
import { clearProfilePushToken } from './profiles';
import { supabase } from './supabase';

const MEDIA_BUCKET = 'media';
const VEHICLE_ANGLES = ['front', 'left', 'right', 'interior', 'rear'] as const;
const VERIFICATION_SLOTS: VerificationDocSlot[] = [
  'license_front',
  'license_back',
  'tech_passport_front',
  'tech_passport_back',
  'id_front',
  'id_back',
];

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: Error };

function storagePathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url?.trim()) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split('?')[0] ?? null;
}

function collectUrlPaths(urls: (string | null | undefined)[], bucket: string): string[] {
  const paths = new Set<string>();
  for (const url of urls) {
    const path = storagePathFromPublicUrl(url, bucket);
    if (path) paths.add(path);
  }
  return [...paths];
}

async function listPrefixPaths(bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix);
  if (error || !data?.length) return [];
  return data
    .filter((item) => item.name && !item.name.endsWith('/'))
    .map((item) => `${prefix}/${item.name}`);
}

async function listOdometerObjectPaths(userId: string): Promise<string[]> {
  const base = `odometer/${userId}`;
  const bookingFolders = await listPrefixPaths(MEDIA_BUCKET, base);
  const filePaths: string[] = [];
  for (const folder of bookingFolders) {
    const files = await listPrefixPaths(MEDIA_BUCKET, folder);
    for (const file of files) filePaths.push(file);
  }
  return filePaths;
}

async function removeStoragePaths(bucket: string, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const chunkSize = 50;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error && __DEV__) {
      console.warn(`[accountDeletion] storage remove (${bucket}):`, error.message);
    }
  }
}

async function deleteUserStorageFiles(userId: string): Promise<void> {
  const paths = new Set<string>();

  paths.add(avatarObjectPath(userId));
  for (const slot of VERIFICATION_SLOTS) {
    paths.add(verificationPhotoObjectPath(userId, slot));
  }
  for (const angle of VEHICLE_ANGLES) {
    paths.add(vehiclePhotoObjectPath(userId, angle));
  }

  const [userRes, vehiclesRes, bookingsRes, verificationList, legacyVerificationList] =
    await Promise.all([
      supabase
        .from('users')
        .select(`${VERIFICATION_DOC_COLUMNS}, avatar_url`)
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('vehicles')
        .select('photo_front, photo_left, photo_right, photo_interior, photo_rear')
        .eq('driver_id', userId),
      supabase
        .from('bookings')
        .select('pickup_sign_logo_url')
        .eq('company_id', userId),
      listPrefixPaths(MEDIA_BUCKET, `verifications/${userId}`),
      listPrefixPaths(MEDIA_BUCKET, `verification/${userId}`),
    ]);

  const userRow = userRes.data as Record<string, string | null> | null;
  if (userRow) {
    for (const url of Object.values(userRow)) {
      const path = storagePathFromPublicUrl(url, MEDIA_BUCKET);
      if (path) paths.add(path);
    }
  }

  for (const row of vehiclesRes.data ?? []) {
    for (const url of Object.values(row as Record<string, string | null>)) {
      const path = storagePathFromPublicUrl(url, MEDIA_BUCKET);
      if (path) paths.add(path);
    }
  }

  const pickupPaths = collectUrlPaths(
    (bookingsRes.data ?? []).map(
      (b) => (b as { pickup_sign_logo_url: string | null }).pickup_sign_logo_url,
    ),
    PICKUP_SIGN_LOGO_BUCKET,
  );

  for (const p of verificationList) paths.add(p);
  for (const p of legacyVerificationList) paths.add(p);

  const odometerPaths = await listOdometerObjectPaths(userId);
  for (const p of odometerPaths) paths.add(p);

  await removeStoragePaths(MEDIA_BUCKET, [...paths]);
  await removeStoragePaths(PICKUP_SIGN_LOGO_BUCKET, pickupPaths);
}

/**
 * Permanently deletes the signed-in account (DB via RPC + storage cleanup), then signs out.
 */
export async function deleteUserAccount(): Promise<DeleteAccountResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { ok: false, error: userError };
  }
  if (!user?.id) {
    return { ok: false, error: new Error('not_authenticated') };
  }

  try {
    await deleteUserStorageFiles(user.id);
  } catch (storageErr) {
    if (__DEV__) {
      console.warn('[accountDeletion] storage cleanup failed:', storageErr);
    }
  }

  await clearProfilePushToken(user.id);

  const { error: rpcError } = await supabase.rpc('delete_user_account');
  if (rpcError) {
    return { ok: false, error: new Error(rpcError.message) };
  }

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    return { ok: false, error: new Error(signOutError.message) };
  }

  return { ok: true };
}
