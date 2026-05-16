import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import i18n from '../src/lib/i18n';
import { BOOKINGS_CHANNEL_ID } from './pushChannels';
import { sendExpoPushToMany } from './expoPush';
import { supabase } from './supabase';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  vehicleClassLabel,
  vehicleTypeLabel,
  type VehicleClassCode,
  type VehicleTypeCode,
} from './vehicleCatalog';

export { BOOKINGS_CHANNEL_ID };
let handlerConfigured = false;

/** Safe copy for push titles/bodies when i18n is cold or a key is missing. */
function notifyT(key: string, fallback: string): string {
  try {
    const exists = typeof i18n.exists === 'function' ? i18n.exists(key) : true;
    if (!exists) return fallback;
    const v = String(i18n.t(key)).trim();
    if (!v || v === key) return fallback;
    return v;
  } catch {
    return fallback;
  }
}

export function configureNotificationHandler(): void {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
}

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(BOOKINGS_CHANNEL_ID, {
    name: 'Bookings',
    description: 'New orders and booking updates',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 150, 300],
    lightColor: '#D4AF37',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
    bypassDnd: false,
  });
}

/** Normalized `bookings.kind` for push copy (transfer | tour | day_tour). */
export function normalizePushBookingKind(
  raw: string | null | undefined,
): 'transfer' | 'tour' | 'day_tour' {
  const k = String(raw ?? 'transfer').trim().toLowerCase();
  if (k === 'tour') return 'tour';
  if (k === 'day_tour' || k === 'daytour' || k === 'day tour') return 'day_tour';
  return 'transfer';
}

export function getNewBookingNotificationContent(kind?: string | null) {
  const k = normalizePushBookingKind(kind);
  if (k === 'tour') {
    return {
      title: notifyT('notifications.newBookingTitleTour', 'KEKE · New tour!'),
      body: notifyT('notifications.newBookingBodyTour', 'New tour request — open the app.'),
    };
  }
  if (k === 'day_tour') {
    return {
      title: notifyT('notifications.newBookingTitleDayTour', 'KEKE · New day tour!'),
      body: notifyT('notifications.newBookingBodyDayTour', 'New day tour — open the app.'),
    };
  }
  return {
    title: notifyT('notifications.newBookingTitleTransfer', 'KEKE · New transfer!'),
    body: notifyT('notifications.newBookingBodyTransfer', 'New transfer — open the app.'),
  };
}

export function getBookingConfirmedNotificationContent() {
  return {
    title: notifyT('notifications.newBookingTitle', 'KEKE'),
    body: notifyT('notifications.bookingConfirmedBody', 'Booking confirmed ✅'),
  };
}

export function getTestNotificationContent() {
  return {
    title: notifyT('notifications.testTitle', 'KEKE Test'),
    body: notifyT('notifications.testBody', 'Push notifications are working.'),
  };
}

export function notificationContentFromRequest(
  notification: Notifications.Notification,
): { title: string; body: string } {
  const content = notification.request.content;
  const data = content.data as Record<string, unknown> | undefined;
  const kindRaw =
    (typeof data?.booking_kind === 'string' && data.booking_kind) ||
    (typeof data?.kind === 'string' && data.kind) ||
    null;
  const fallback = getNewBookingNotificationContent(kindRaw);
  return {
    title: content.title?.trim() || fallback.title,
    body: content.body?.trim() || fallback.body,
  };
}

export type NotifyMatchingDriversResult = {
  tokenCount: number;
  sentCount: number;
  failedCount: number;
  vehicleType: string | null;
  vehicleClass: string | null;
  message: string | null;
};

type ProfilePushRow = {
  id: string;
  push_token: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
};

/** Canonical lowercase codes; used for `.eq()` on `profiles`. */
export function normalizeBookingVehicleFilters(
  rawType: string,
  rawClass: string,
): { vehicleType: VehicleTypeCode | null; vehicleClass: VehicleClassCode | null } {
  return {
    vehicleType: normalizeVehicleType(rawType),
    vehicleClass: normalizeVehicleClass(rawClass),
  };
}

/**
 * Fetch Expo push tokens from `profiles`.
 * Filters by `vehicle_type` always; adds `vehicle_class` only when the booking specifies a class.
 * Booking `kind` is never used for recipient selection.
 */
export async function fetchMatchingDriverPushTokens(
  bookingVehicleType: string,
  bookingVehicleClass: string | null | undefined,
): Promise<{ tokens: string[]; error: Error | null; vehicleType: VehicleTypeCode | null; vehicleClass: VehicleClassCode | null }> {
  const { vehicleType, vehicleClass } = normalizeBookingVehicleFilters(
    bookingVehicleType,
    bookingVehicleClass ?? '',
  );

  if (!vehicleType) {
    return {
      tokens: [],
      error: new Error('ჯავშნის vehicle_type არასწორია'),
      vehicleType: null,
      vehicleClass,
    };
  }

  let query = supabase
    .from('profiles')
    .select('push_token, vehicle_type, vehicle_class, id')
    .eq('vehicle_type', vehicleType)
    .not('push_token', 'is', null);

  if (vehicleClass) {
    query = query.eq('vehicle_class', vehicleClass);
  }

  const { data, error } = await query;

  if (error) {
    if (__DEV__) console.warn('[notify] profiles filter query failed:', error.message);
    return { tokens: [], error: new Error(error.message), vehicleType, vehicleClass };
  }

  const matchedRows = (data ?? []).map((row) => row as ProfilePushRow);

  const tokens = matchedRows
    .filter((row) => {
      const rowType = normalizeVehicleType(row.vehicle_type);
      if (rowType !== vehicleType) return false;
      if (!vehicleClass) return true;
      const rowClass = normalizeVehicleClass(row.vehicle_class);
      return rowClass === vehicleClass;
    })
    .map((row) => row.push_token?.trim() ?? '')
    .filter((token) => token.length > 0);

  const uniqueTokens = [...new Set(tokens)];

  return { tokens: uniqueTokens, error: null, vehicleType, vehicleClass };
}

/**
 * Push to drivers whose `profiles.vehicle_type` (and `vehicle_class` when set on the booking) match.
 * Booking service `kind` does not affect which drivers are notified.
 */
export async function notifyMatchingDriversOfNewBooking(params: {
  kind: string;
  vehicleType: string;
  vehicleClass?: string | null;
  bookingId?: string;
  showAlertIfEmpty?: boolean;
}): Promise<NotifyMatchingDriversResult> {
  const { vehicleType, vehicleClass } = normalizeBookingVehicleFilters(
    params.vehicleType,
    params.vehicleClass ?? '',
  );

  const emptyResult = (message: string): NotifyMatchingDriversResult => ({
    tokenCount: 0,
    sentCount: 0,
    failedCount: 0,
    vehicleType,
    vehicleClass,
    message,
  });

  if (!vehicleType) {
    const message = i18n.t('notifications.matchingVehicleInvalid');
    if (__DEV__) console.warn('[notifyMatchingDrivers]', message);
    if (params.showAlertIfEmpty) {
      Alert.alert(i18n.t('system.noticeTitle'), message);
    }
    return emptyResult(message);
  }

  const kindLog = String(params.kind ?? '').trim() || 'booking';
  const classLog = vehicleClass ? String(vehicleClass) : 'any';
  if (__DEV__) {
    console.log(
      `Sending ${kindLog} request to drivers with ${String(vehicleType)} ${classLog}`,
    );
  }

  const { tokens, error } = await fetchMatchingDriverPushTokens(vehicleType, vehicleClass);

  if (error) {
    if (__DEV__) console.warn('[notifyMatchingDrivers] fetch error:', error.message);
    if (params.showAlertIfEmpty) {
      Alert.alert(i18n.t('system.errorTitle'), error.message);
    }
    return emptyResult(error.message);
  }

  if (tokens.length === 0) {
    const classLabel = vehicleClass
      ? vehicleClassLabel(vehicleClass)
      : i18n.t('notifications.anyVehicleClass');
    const message = i18n.t('notifications.matchingNoDrivers', {
      type: vehicleTypeLabel(vehicleType),
      class: classLabel,
    });
    if (__DEV__) console.warn('[notifyMatchingDrivers]', message);
    if (params.showAlertIfEmpty) {
      Alert.alert(i18n.t('system.noticeTitle'), message);
    }
    return emptyResult(message);
  }

  const kindNorm = normalizePushBookingKind(params.kind);
  const { title, body } = getNewBookingNotificationContent(kindNorm);
  const data: Record<string, string> = {
    type: 'new_booking',
    booking_kind: kindNorm,
    vehicle_type: vehicleType,
  };
  if (vehicleClass) {
    data.vehicle_class = vehicleClass;
  }
  if (params.bookingId) {
    data.booking_id = params.bookingId;
  }

  const batch = await sendExpoPushToMany(tokens, title, body, data);

  return {
    tokenCount: tokens.length,
    sentCount: batch.sentCount,
    failedCount: batch.failedCount,
    vehicleType,
    vehicleClass,
    message: null,
  };
}
