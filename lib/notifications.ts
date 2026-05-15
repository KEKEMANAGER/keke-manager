import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import i18n from '../src/lib/i18n';
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

/** Android channel for booking alerts — must match `channelId` in Expo push payloads. */
export const BOOKINGS_CHANNEL_ID = 'bookings';

let handlerConfigured = false;

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

export function getNewBookingNotificationContent() {
  return {
    title: i18n.t('notifications.newBookingTitle'),
    body: i18n.t('notifications.newBookingBody'),
  };
}

export function getBookingConfirmedNotificationContent() {
  return {
    title: i18n.t('notifications.newBookingTitle'),
    body: i18n.t('notifications.bookingConfirmedBody'),
  };
}

export function getTestNotificationContent() {
  return {
    title: i18n.t('notifications.testTitle'),
    body: i18n.t('notifications.testBody'),
  };
}

export function notificationContentFromRequest(
  notification: Notifications.Notification,
): { title: string; body: string } {
  const content = notification.request.content;
  const fallback = getNewBookingNotificationContent();
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
 * Fetch Expo push tokens from `profiles` where vehicle fields match exactly (lowercase).
 */
export async function fetchMatchingDriverPushTokens(
  bookingVehicleType: string,
  bookingVehicleClass: string,
): Promise<{ tokens: string[]; error: Error | null; vehicleType: VehicleTypeCode | null; vehicleClass: VehicleClassCode | null }> {
  const { vehicleType, vehicleClass } = normalizeBookingVehicleFilters(
    bookingVehicleType,
    bookingVehicleClass,
  );

  if (!vehicleType || !vehicleClass) {
    return {
      tokens: [],
      error: new Error('ჯავშნის vehicle_type / vehicle_class არასწორია'),
      vehicleType,
      vehicleClass,
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('push_token, vehicle_type, vehicle_class, id')
    .eq('vehicle_type', vehicleType)
    .eq('vehicle_class', vehicleClass)
    .not('push_token', 'is', null);

  if (error) {
    if (__DEV__) console.warn('[notify] profiles filter query failed:', error.message);
    return { tokens: [], error: new Error(error.message), vehicleType, vehicleClass };
  }

  const matchedRows = (data ?? []).map((row) => row as ProfilePushRow);

  const tokens = matchedRows
    .filter((row) => {
      const rowType = normalizeVehicleType(row.vehicle_type);
      const rowClass = normalizeVehicleClass(row.vehicle_class);
      return rowType === vehicleType && rowClass === vehicleClass;
    })
    .map((row) => row.push_token?.trim() ?? '')
    .filter((token) => token.length > 0);

  const uniqueTokens = [...new Set(tokens)];

  return { tokens: uniqueTokens, error: null, vehicleType, vehicleClass };
}

/**
 * Push to drivers whose `profiles.vehicle_type` / `vehicle_class` match the booking exactly.
 */
export async function notifyMatchingDriversOfNewBooking(params: {
  vehicleType: string;
  vehicleClass: string;
  bookingId?: string;
  showAlertIfEmpty?: boolean;
}): Promise<NotifyMatchingDriversResult> {
  const { vehicleType, vehicleClass } = normalizeBookingVehicleFilters(
    params.vehicleType,
    params.vehicleClass,
  );

  const emptyResult = (message: string): NotifyMatchingDriversResult => ({
    tokenCount: 0,
    sentCount: 0,
    failedCount: 0,
    vehicleType,
    vehicleClass,
    message,
  });

  if (!vehicleType || !vehicleClass) {
    const message = i18n.t('notifications.matchingVehicleInvalid');
    if (__DEV__) console.warn('[notifyMatchingDrivers]', message);
    if (params.showAlertIfEmpty) {
      Alert.alert(i18n.t('system.noticeTitle'), message);
    }
    return emptyResult(message);
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
    const message = i18n.t('notifications.matchingNoDrivers', {
      type: vehicleTypeLabel(vehicleType),
      class: vehicleClassLabel(vehicleClass),
    });
    if (__DEV__) console.warn('[notifyMatchingDrivers]', message);
    if (params.showAlertIfEmpty) {
      Alert.alert(i18n.t('system.noticeTitle'), message);
    }
    return emptyResult(message);
  }

  const { title, body } = getNewBookingNotificationContent();
  const data: Record<string, string> = {
    type: 'new_booking',
    vehicle_type: vehicleType,
    vehicle_class: vehicleClass,
  };
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
