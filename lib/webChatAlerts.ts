/** Web-only: browser tab title + desktop notifications for chat. */

let baseTitle = 'KEKE Manager';
let cachedUnread = 0;
let activeChatPeerId: string | null = null;

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

/** When viewing a chat thread, suppress browser popups for that peer. */
export function setActiveChatPeerId(userId: string | null): void {
  activeChatPeerId = userId?.trim() || null;
}

export function getActiveChatPeerId(): string | null {
  return activeChatPeerId;
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
  senderUserId: string,
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const senderId = senderUserId.trim();
  if (senderId && activeChatPeerId === senderId && !document.hidden) return;

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
