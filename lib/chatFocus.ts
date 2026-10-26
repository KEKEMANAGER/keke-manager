import { AppState } from 'react-native';

/**
 * Which conversation is on screen, so a message that lands in it is not also
 * announced on top of it.
 *
 * A message reaches a phone with the app open several ways at once: the push
 * its sender's app sends (shown as a banner and as a dialog), and the realtime
 * insert this app hears (another banner, another dialog). Someone reading the
 * conversation got all of it for every line the other person typed, and the
 * same pair of banners and dialogs came in elsewhere in the app too.
 *
 * Plain module state — the chat screens set it on focus and clear it on blur;
 * the notification code only reads it.
 */

type OpenChat = {
  peerId: string;
  /** 'support', or the booking thread's type; null when the screen shows every thread with that person. */
  threadType: string | null;
  bookingId: string | null;
};

let openChat: OpenChat | null = null;

/** What an incoming message or its notification says about where it belongs. */
export type ChatMessageRef = {
  sender_id?: unknown;
  thread_type?: unknown;
  booking_id?: unknown;
};

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** The chat screen calls this when it comes into view, with the thread it shows. */
export function setOpenChat(
  peerId: string | null | undefined,
  thread?: { threadType?: string | null; bookingId?: string | null } | null,
): void {
  const id = clean(peerId);
  openChat = id
    ? { peerId: id, threadType: clean(thread?.threadType), bookingId: clean(thread?.bookingId) }
    : null;
}

/** …and this when it leaves the screen. Only clears its own conversation. */
export function clearOpenChat(peerId?: string | null): void {
  const id = clean(peerId);
  if (!id || openChat?.peerId === id) openChat = null;
}

export function getOpenChatPeerId(): string | null {
  return openChat?.peerId ?? null;
}

/**
 * Would this message appear in the conversation on screen? The same test the
 * screen's own realtime subscription applies (lib/messages subscribeToMessages):
 * a support chat shows support messages only, a booking chat that booking's
 * thread only, and a chat opened without a thread everything from that person.
 */
export function isInOpenChat(msg: ChatMessageRef | null | undefined): boolean {
  if (!openChat || !msg) return false;
  const sender = clean(msg.sender_id);
  if (!sender || sender !== openChat.peerId) return false;
  const thread = clean(msg.thread_type);
  const booking = clean(msg.booking_id);
  if (openChat.threadType === 'support') return thread === 'support' && !booking;
  if (openChat.bookingId && openChat.threadType) {
    return booking === openChat.bookingId && thread === openChat.threadType;
  }
  return true;
}

/**
 * The person is reading that conversation right now: the app is in front and
 * the message belongs to the chat on screen. With the phone locked or the app
 * in the background they are not, and the notification still goes out.
 */
export function isReadingChat(msg: ChatMessageRef | null | undefined): boolean {
  return AppState.currentState === 'active' && isInOpenChat(msg);
}

/** Copies of one message arrive within a few seconds of each other. */
const DUPLICATE_WINDOW_MS = 6_000;
const lastAnnounced = new Map<string, number>();

/**
 * True for the first banner (or dialog) about a person's message, false for a
 * copy of it that arrives a moment later by the other route.
 */
export function firstChatAnnouncement(
  kind: 'banner' | 'alert',
  msg: ChatMessageRef | null | undefined,
  now: number = Date.now(),
): boolean {
  const sender = clean(msg?.sender_id);
  if (!sender) return true;
  const key = `${kind}:${sender}`;
  const last = lastAnnounced.get(key);
  if (last !== undefined && now - last < DUPLICATE_WINDOW_MS) return false;
  lastAnnounced.set(key, now);
  return true;
}
