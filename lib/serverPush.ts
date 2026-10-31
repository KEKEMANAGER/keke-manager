import { supabase } from './supabase';

/**
 * Push notifications are sent by the server (P0-4).
 *
 * The app used to read the other side's push token from `profiles` and call
 * Expo itself, which meant every signed-in account could read every token
 * and send anything to anyone. Now the app only tells the server what just
 * happened — "I accepted this booking", "I sent this message" — and the
 * server checks that the caller may make that happen, takes the recipients
 * from the booking, writes the text and sends it, once.
 *
 * Every helper here answers:
 *   'sent'    the server handled it (which may mean "nothing to send")
 *   'refused' the server said no, or the call failed: do NOT send it any
 *             other way
 *   'missing' the server function is not deployed yet (an app update that
 *             reaches phones before the database change): the caller falls
 *             back to the old way, so nobody loses a notification
 */
export type ServerPushOutcome = 'sent' | 'refused' | 'missing';

export type BookingPushEvent =
  | 'accepted'
  | 'driver_cancelled'
  | 'odometer'
  | 'voucher'
  | 'emergency'
  | 'updated'
  | 'host_assigned'
  | 'host_completed';

function isMissingServerFunction(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

async function callServer(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ outcome: ServerPushOutcome; data: unknown }> {
  const { data, error } = await supabase.rpc(fn, args);
  if (!error) return { outcome: 'sent', data };
  if (isMissingServerFunction(error)) return { outcome: 'missing', data: null };
  if (__DEV__) console.warn(`[serverPush] ${fn}:`, error.message);
  return { outcome: 'refused', data: null };
}

/** Something happened on a booking; the server tells whoever should know. */
export async function notifyBookingEventOnServer(
  bookingId: string,
  event: BookingPushEvent,
  phase?: 'start' | 'end',
): Promise<ServerPushOutcome> {
  const id = String(bookingId ?? '').trim();
  if (!id) return 'sent';
  const { outcome } = await callServer('notify_booking_event', {
    p_booking_id: id,
    p_event: event,
    p_phase: phase ?? null,
  });
  return outcome;
}

/**
 * The caller just sent a chat message. With its id the server announces that
 * message; without (a convoy inserts one row per driver), the newest one to
 * that receiver it has not announced yet.
 */
export async function notifyChatMessageOnServer(
  receiverId: string,
  messageId?: string | null,
): Promise<ServerPushOutcome> {
  const receiver = String(receiverId ?? '').trim();
  if (!receiver) return 'sent';
  const { outcome } = await callServer('notify_chat_message', {
    p_receiver_id: receiver,
    p_message_id: messageId?.trim() || null,
  });
  return outcome;
}

/** A fleet owner invited a driver (the invitation row is `driver_fleet.id`). */
export async function notifyFleetInviteOnServer(fleetId: string): Promise<ServerPushOutcome> {
  const id = String(fleetId ?? '').trim();
  if (!id) return 'sent';
  const { outcome } = await callServer('notify_fleet_invite', { p_fleet_id: id });
  return outcome;
}

/** Someone looked at a hired driver's job-board profile. */
export async function notifyProfileViewedOnServer(driverId: string): Promise<ServerPushOutcome> {
  const id = String(driverId ?? '').trim();
  if (!id) return 'sent';
  const { outcome } = await callServer('notify_profile_viewed', { p_driver_id: id });
  return outcome;
}

/** The dashboard's test push, to this phone only. `delivered` is false when the server has no token for it. */
export async function sendTestPushOnServer(): Promise<{ outcome: ServerPushOutcome; delivered: boolean }> {
  const { outcome, data } = await callServer('send_test_push', {});
  return { outcome, delivered: outcome === 'sent' && data === true };
}

/**
 * A new booking: tell the drivers. `first` are told now, `later` three
 * minutes on (the app's rating waves); the server keeps only the drivers it
 * may tell and writes the text. Both null: the server's own waves.
 */
export async function dispatchNewBookingOnServer(
  bookingId: string,
  first: string[] | null,
  later: string[] | null,
): Promise<{ outcome: ServerPushOutcome; notified: number; queued: number }> {
  const id = String(bookingId ?? '').trim();
  if (!id) return { outcome: 'sent', notified: 0, queued: 0 };
  const { outcome, data } = await callServer('dispatch_new_booking', {
    p_booking_id: id,
    p_first: first,
    p_later: later,
  });
  const row = (data ?? {}) as { notified?: unknown; queued?: unknown };
  return {
    outcome,
    notified: Number(row.notified) || 0,
    queued: Number(row.queued) || 0,
  };
}
