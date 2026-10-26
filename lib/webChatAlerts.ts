/** Web-only: browser tab title + desktop notifications for chat. */

import { isInOpenChat, type ChatMessageRef } from './chatFocus';

let baseTitle = 'KEKE Manager';
let cachedUnread = 0;

export function setWebDocumentBaseTitle(title: string): void {
  baseTitle = title.trim() || 'KEKE Manager';
  applyWebDocumentTitle(cachedUnread);
}

export function updateWebDocumentTitle(unread: number): void {
  cachedUnread = Math.max(0, unread);
  applyWebDocumentTitle(cachedUnread);
}

function applyWebDocumentTitle(unread: number): void {
  if (typeof document === 'undefined') return;
  document.title = unread > 0 ? `(${unread}) ${baseTitle}` : baseTitle;
}

export async function ensureWebNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function showWebBrowserChatNotification(
  title: string,
  body: string,
  msg: ChatMessageRef,
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // Reading that conversation in a visible tab: the message is already on screen.
  if (isInOpenChat(msg) && !document.hidden) return;
  const senderId = typeof msg.sender_id === 'string' ? msg.sender_id.trim() : '';

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: `keke-chat-${senderId || 'msg'}`,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    /* ignore — Safari private mode, etc. */
  }
}
