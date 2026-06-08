import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { uploadMediaObject } from './mediaUpload';
import { supabase } from './supabase';
import { trimUserId } from './userId';

export type OdometerPhase = 'start' | 'end';

export function odometerObjectPath(
  driverUserId: string,
  bookingId: string,
  phase: OdometerPhase,
): string {
  const uid = trimUserId(driverUserId);
  const bid = String(bookingId).trim();
  return `odometer/${uid}/${bid}/${phase}.jpg`;
}

export type CaptureOdometerResult =
  | { ok: true; uri: string }
  | { ok: false; cancelled: true }
  | { ok: false; error: Error };

/** Open camera and return local image URI (gallery fallback on web if camera unavailable). */
export async function captureOdometerPhoto(): Promise<CaptureOdometerResult> {
  const cameraPerm = await ImagePicker.requestCameraPermissionsAsync();
  if (cameraPerm.granted) {
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]?.uri) {
      return { ok: false, cancelled: true };
    }
    return { ok: true, uri: res.assets[0].uri };
  }

  if (Platform.OS === 'web') {
    const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libPerm.granted) {
      return { ok: false, error: new Error('camera_permission_denied') };
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]?.uri) {
      return { ok: false, cancelled: true };
    }
    return { ok: true, uri: res.assets[0].uri };
  }

  return { ok: false, error: new Error('camera_permission_denied') };
}

export async function uploadBookingOdometerPhoto(
  bookingId: string,
  driverUserId: string,
  phase: OdometerPhase,
  localUri: string,
): Promise<{ ok: true; url: string } | { ok: false; error: Error }> {
  const uid = trimUserId(driverUserId);
  if (!uid) {
    return { ok: false, error: new Error('invalid driver id') };
  }
  try {
    const path = odometerObjectPath(uid, bookingId, phase);
    const url = await uploadMediaObject(path, localUri, { contentType: 'image/jpeg' });
    return { ok: true, url };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e : new Error('upload_failed') };
  }
}

export async function saveBookingOdometerPhoto(
  bookingId: string,
  driverUserId: string,
  phase: OdometerPhase,
  photoUrl: string,
): Promise<{ ok: boolean; error: Error | null }> {
  const uid = trimUserId(driverUserId);
  const id = String(bookingId).trim();
  if (!uid || !id) {
    return { ok: false, error: new Error('invalid ids') };
  }

  const patch =
    phase === 'start'
      ? {
          odometer_start_photo_url: photoUrl,
          odometer_start_at: new Date().toISOString(),
        }
      : {
          odometer_end_photo_url: photoUrl,
          odometer_end_at: new Date().toISOString(),
        };

  const { data, error } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', id)
    .eq('driver_id', uid)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: new Error(error.message) };
  if (!data) return { ok: false, error: new Error('odometer_save_failed') };
  return { ok: true, error: null };
}

/** Capture, upload, and persist odometer photo for assigned driver. */
export async function submitBookingOdometerPhoto(
  bookingId: string,
  driverUserId: string,
  phase: OdometerPhase,
  localUri: string,
): Promise<{ ok: boolean; error: Error | null }> {
  const uploaded = await uploadBookingOdometerPhoto(bookingId, driverUserId, phase, localUri);
  if (!uploaded.ok) {
    return { ok: false, error: uploaded.error };
  }
  return saveBookingOdometerPhoto(bookingId, driverUserId, phase, uploaded.url);
}

export function odometerErrorMessageKey(error: Error | null | undefined): string {
  const msg = error?.message ?? '';
  if (msg === 'camera_permission_denied') return 'bookingOdometer.cameraDenied';
  if (msg === 'odometer_save_failed') return 'bookingOdometer.saveFailed';
  if (msg.includes('upload') || msg === 'upload_failed') return 'bookingOdometer.uploadFailed';
  return 'common.error';
}
