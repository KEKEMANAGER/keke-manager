import { getChatMessageNotificationContent } from './notifications';
import { supabase } from './supabase';
import {
  ensureWebNotificationPermission,
  showWebBrowserChatNotification,
} from './webChatAlerts';
import i18n from '../src/lib/i18n';
import { isInOpenChat } from './chatFocus';
import { isSupportThreadType } from './supportChat';

let lastChatWebNotifyAt = 0;

/** Web: browser Notification API for incoming chat (tab title handled by useChatUnreadCount). */
export async function notifyIncomingChatMessageLocally(params: {
  senderUserId: string;
  senderName?: string | null;
  text: string;
  threadType?: string | null;
  bookingId?: string | null;
}): Promise<void> {
  const msg = {
    sender_id: params.senderUserId,
    thread_type: params.threadType ?? null,
    booking_id: params.bookingId ?? null,
  };
  // Already on screen in a visible tab — nothing to announce.
  if (isInOpenChat(msg) && typeof document !== 'undefined' && !document.hidden) return;

  const now = Date.now();
  if (now - lastChatWebNotifyAt < 1500) return;
  lastChatWebNotifyAt = now;

  const isSupport = isSupportThreadType(params.threadType);
  let name = String(params.senderName ?? '').trim();
  if (!name && !isSupport) {
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
  if (isSupport) {
    name = i18n.t('supportChat.title');
  }

  const { title, body } = getChatMessageNotificationContent(name, params.text);
  await ensureWebNotificationPermission();
  showWebBrowserChatNotification(title, body, msg);
}

export async function notifyBookingConfirmed(): Promise<void> {
  return;
}

export async function notifyNewOpenBooking(): Promise<void> {
  return;
}

export async function notifyNewOpenBookingIfMatchesDriver(
  _driverUserId: string,
  _bookingVehicleType: string,
  _bookingVehicleClass: string | null | undefined,
  _bookingKind?: string | null,
  _bookingDriverId?: string | null,
  _bookingCapacityTier?: string | null,
  _bookingModelGroup?: string | null,
): Promise<void> {
  return;
}
