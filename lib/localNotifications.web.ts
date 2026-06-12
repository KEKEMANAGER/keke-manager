import { getChatMessageNotificationContent } from './notifications';
import { supabase } from './supabase';
import {
  ensureWebNotificationPermission,
  showWebBrowserChatNotification,
} from './webChatAlerts';
import i18n from '../src/lib/i18n';
import { isSupportThreadType } from './supportChat';

let lastChatWebNotifyAt = 0;

/** Web: browser Notification API for incoming chat (tab title handled by useChatUnreadCount). */
export async function notifyIncomingChatMessageLocally(params: {
  senderUserId: string;
  senderName?: string | null;
  text: string;
  threadType?: string | null;
}): Promise<void> {
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
  showWebBrowserChatNotification(title, body, params.senderUserId);
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
): Promise<void> {
  return;
}
