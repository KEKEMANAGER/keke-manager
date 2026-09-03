import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fleetAssignedVehicleMatchesBooking } from './fleet';
import { driverProfileMatchesBooking } from './profiles';
import {
  BOOKINGS_CHANNEL_ID,
  getBookingConfirmedNotificationContent,
  getChatMessageNotificationContent,
  getNewBookingNotificationContent,
  normalizePushBookingKind,
} from './notifications';
import { supabase } from './supabase';

const isWeb = Platform.OS === 'web';

function androidChannel() {
  return Platform.OS === 'android' ? { channelId: BOOKINGS_CHANNEL_ID } : {};
}

/**
 * All local banners are fired-and-forgotten by callers (`void notify...()`),
 * so a throw here would surface as an unhandled rejection in core flows such
 * as accepting a booking. scheduleNotificationAsync can reject when the user
 * revoked POST_NOTIFICATIONS (Android 13+), when the channel is missing, or
 * under OEM restrictions — none of which should ever break the action itself.
 */
async function scheduleSafely(
  request: Notifications.NotificationRequestInput,
  label: string,
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync(request);
  } catch (err) {
    if (__DEV__) {
      console.warn(`[localNotifications] ${label} failed:`, err);
    }
  }
}

export async function notifyBookingConfirmed(): Promise<void> {
  if (isWeb) return;
  const { title, body } = getBookingConfirmedNotificationContent();
  await scheduleSafely({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      ...androidChannel(),
    },
    trigger: null,
  }, 'bookingConfirmed');
}

let lastNewOpenBookingNotifyAt = 0;

export async function notifyNewOpenBooking(kind?: string | null): Promise<void> {
  if (isWeb) return;
  const now = Date.now();
  if (now - lastNewOpenBookingNotifyAt < 4000) return;
  lastNewOpenBookingNotifyAt = now;
  const { title, body } = getNewBookingNotificationContent(kind);
  const bookingKind = normalizePushBookingKind(kind);
  await scheduleSafely({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { type: 'new_booking', booking_kind: bookingKind },
      ...androidChannel(),
    },
    trigger: null,
  }, 'newOpenBooking');
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

  const [ownVehicle, fleetVehicle] = await Promise.all([
    driverProfileMatchesBooking(driverUserId, bookingVehicleType, bookingVehicleClass),
    fleetAssignedVehicleMatchesBooking(driverUserId, bookingVehicleType, bookingVehicleClass),
  ]);
  if (!ownVehicle && !fleetVehicle) {
    return;
  }

  await notifyNewOpenBooking(bookingKind);
}

let lastChatLocalNotifyAt = 0;

/**
 * Local banner for an incoming chat message (foreground / app open but not on that chat).
 * `senderName` falls back to a lookup on `users` when omitted.
 */
export async function notifyIncomingChatMessageLocally(params: {
  senderUserId: string;
  senderName?: string | null;
  text: string;
  threadType?: string | null;
}): Promise<void> {
  if (isWeb) return;
  const now = Date.now();
  if (now - lastChatLocalNotifyAt < 1500) return;
  lastChatLocalNotifyAt = now;

  let name = String(params.senderName ?? '').trim();
  if (!name) {
    const senderId = String(params.senderUserId ?? '').trim();
    if (senderId) {
      const { data } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', senderId)
        .maybeSingle();
      name = (data as { full_name?: string | null } | null)?.full_name?.trim() ?? '';
    }
  }

  const { title, body } = getChatMessageNotificationContent(name, params.text);
  await scheduleSafely({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { type: 'chat_message', sender_id: String(params.senderUserId ?? '') },
      ...androidChannel(),
    },
    trigger: null,
  }, 'chatMessage');
}
