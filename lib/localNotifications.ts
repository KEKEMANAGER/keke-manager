import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { driverProfileMatchesBooking } from './profiles';
import {
  BOOKINGS_CHANNEL_ID,
  getBookingConfirmedNotificationContent,
  getNewBookingNotificationContent,
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

export async function notifyNewOpenBooking(): Promise<void> {
  if (isWeb) return;
  const now = Date.now();
  if (now - lastNewOpenBookingNotifyAt < 4000) return;
  lastNewOpenBookingNotifyAt = now;
  const { title, body } = getNewBookingNotificationContent();
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { type: 'new_booking' },
      ...androidChannel(),
    },
    trigger: null,
  });
}

/** Local banner only when the driver's profile vehicle matches the new booking. */
export async function notifyNewOpenBookingIfMatchesDriver(
  driverUserId: string,
  bookingVehicleType: string,
  bookingVehicleClass: string,
): Promise<void> {
  if (isWeb || !driverUserId.trim()) return;

  const matches = await driverProfileMatchesBooking(
    driverUserId,
    bookingVehicleType,
    bookingVehicleClass,
  );
  if (!matches) {
    return;
  }

  await notifyNewOpenBooking();
}
