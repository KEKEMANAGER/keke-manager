import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { driverProfileMatchesBooking } from './profiles';
import {
  BOOKINGS_CHANNEL_ID,
  getBookingConfirmedNotificationContent,
  getNewBookingNotificationContent,
  normalizePushBookingKind,
} from './notifications';

const isWeb = Platform.OS === 'web';

function androidChannel() {
  return Platform.OS === 'android' ? { channelId: BOOKINGS_CHANNEL_ID } : {};
}

export async function notifyBookingConfirmed(): Promise<void> {
  if (isWeb) return;
  const { title, body } = getBookingConfirmedNotificationContent();
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      ...androidChannel(),
    },
    trigger: null,
  });
}

let lastNewOpenBookingNotifyAt = 0;

export async function notifyNewOpenBooking(kind?: string | null): Promise<void> {
  if (isWeb) return;
  const now = Date.now();
  if (now - lastNewOpenBookingNotifyAt < 4000) return;
  lastNewOpenBookingNotifyAt = now;
  const { title, body } = getNewBookingNotificationContent(kind);
  const bookingKind = normalizePushBookingKind(kind);
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { type: 'new_booking', booking_kind: bookingKind },
      ...androidChannel(),
    },
    trigger: null,
  });
}

/** Local banner when the driver's profile matches the new booking vehicle (type + class rules). */
export async function notifyNewOpenBookingIfMatchesDriver(
  driverUserId: string,
  bookingVehicleType: string,
  bookingVehicleClass: string | null | undefined,
  bookingKind?: string | null,
  bookingDriverId?: string | null,
): Promise<void> {
  if (isWeb || !driverUserId.trim()) return;

  const targetedId = bookingDriverId != null ? String(bookingDriverId).trim() : '';
  if (targetedId && targetedId !== driverUserId.trim()) {
    return;
  }

  const matches = await driverProfileMatchesBooking(
    driverUserId,
    bookingVehicleType,
    bookingVehicleClass,
  );
  if (!matches) {
    return;
  }

  await notifyNewOpenBooking(bookingKind);
}
