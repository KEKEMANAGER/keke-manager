import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { sendMessage } from './messages';
import { supabase } from './supabase';

/**
 * "Passengers picked up" / "passengers dropped off".
 *
 * The driver marks both on the GPS screen, for every leg and every day: the
 * start of a tour day, a transfer, the end of the day, the drive to the
 * airport. Each mark carries the time and where the car was, the company is
 * told in the booking's chat, and the booking card lists them all.
 *
 * Marks made without internet are kept on the phone and sent when the
 * connection is back, with the time they were made — `client_event_id` makes
 * sending one twice harmless.
 */

export type TripEventKind = 'pickup' | 'dropoff';

export type TripEventRow = {
  id: string;
  booking_id: string;
  driver_id: string;
  kind: TripEventKind;
  happened_at: string;
  latitude: number | null;
  longitude: number | null;
  place_label: string | null;
  client_event_id: string;
  created_at: string;
};

/** A mark the phone has not delivered yet, and the chat message that goes with it. */
export type PendingTripEvent = {
  client_event_id: string;
  booking_id: string;
  driver_id: string;
  kind: TripEventKind;
  happened_at: string;
  latitude: number | null;
  longitude: number | null;
  place_label: string | null;
  /** In the database already. */
  eventSent?: boolean;
  /** The company was told in the chat already. */
  messageSent?: boolean;
  message: {
    receiverId: string;
    /** Without the time: it is added when the message goes out late. */
    text: string;
    senderName?: string;
  } | null;
};

const QUEUE_KEY = 'trip-events:queue:v1';
/** A mark the server keeps refusing is given up after this long. */
const QUEUE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** A message that arrives this much later than the mark says when it happened. */
const LATE_MESSAGE_MS = 2 * 60 * 1000;

const SELECT =
  'id, booking_id, driver_id, kind, happened_at, latitude, longitude, place_label, client_event_id, created_at';

export function newClientEventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** What the button offers next: after a pickup the drop-off, otherwise a pickup. */
export function nextTripEventKind(last: TripEventKind | null | undefined): TripEventKind {
  return last === 'pickup' ? 'dropoff' : 'pickup';
}

/** HH:MM in the phone's time zone. */
export function formatEventTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The chat line that tells the company: "<text> · <place>", plus the time when it is late. */
export function tripEventMessageText(
  ev: Pick<PendingTripEvent, 'happened_at' | 'place_label'> & { text: string },
  now: number = Date.now(),
): string {
  const parts = [ev.text.trim()];
  const place = ev.place_label?.trim();
  if (place) parts.push(place);
  if (now - new Date(ev.happened_at).getTime() > LATE_MESSAGE_MS) parts.push(formatEventTime(ev.happened_at));
  return parts.join(' · ');
}

async function readQueue(): Promise<PendingTripEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as PendingTripEvent[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: PendingTripEvent[]): Promise<void> {
  try {
    if (items.length === 0) await AsyncStorage.removeItem(QUEUE_KEY);
    else await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-200)));
  } catch {
    // best effort: worst case a mark made offline is lost, as it was before
  }
}

/** Marks for this booking that are still on the phone. */
export async function pendingTripEvents(bookingId?: string): Promise<PendingTripEvent[]> {
  const all = await readQueue();
  return bookingId ? all.filter((e) => e.booking_id === bookingId) : all;
}

async function insertEvent(ev: PendingTripEvent): Promise<Error | null> {
  const { error } = await supabase.from('trip_events').upsert(
    {
      client_event_id: ev.client_event_id,
      booking_id: ev.booking_id,
      driver_id: ev.driver_id,
      kind: ev.kind,
      happened_at: ev.happened_at,
      latitude: ev.latitude,
      longitude: ev.longitude,
      place_label: ev.place_label,
    },
    { onConflict: 'driver_id,client_event_id', ignoreDuplicates: true },
  );
  return error ? new Error(error.message) : null;
}

async function sendEventMessage(ev: PendingTripEvent): Promise<Error | null> {
  if (!ev.message?.receiverId || !ev.message.text.trim()) return null;
  const { error } = await sendMessage({
    senderId: ev.driver_id,
    receiverId: ev.message.receiverId,
    text: tripEventMessageText({ ...ev, text: ev.message.text }),
    bookingId: ev.booking_id,
    threadType: 'company_driver',
    senderRole: 'driver',
    receiverRole: 'company',
    senderName: ev.message.senderName,
  });
  return error;
}

/**
 * Deliver one mark: into the database and into the chat, each on its own —
 * the company hears about it even if one of the two cannot be written yet.
 * Returns what is still left to do, or null when both went through.
 */
async function deliver(ev: PendingTripEvent): Promise<PendingTripEvent | null> {
  let current = ev;
  if (!current.eventSent) {
    const err = await insertEvent(current);
    if (!err) current = { ...current, eventSent: true };
  }
  if (current.message && !current.messageSent) {
    const err = await sendEventMessage(current);
    if (!err) current = { ...current, messageSent: true };
  }
  const done = current.eventSent && (!current.message || current.messageSent);
  return done ? null : current;
}

function expired(ev: PendingTripEvent, now: number = Date.now()): boolean {
  const at = new Date(ev.happened_at).getTime();
  return Number.isFinite(at) && now - at > QUEUE_MAX_AGE_MS;
}

/**
 * Record a mark the driver just made. Returns whether the company has it now —
 * in the chat or on the booking card; whatever is missing is kept and goes out
 * with flushTripEventQueue().
 */
export async function recordTripEvent(ev: PendingTripEvent): Promise<{ sent: boolean }> {
  // Older marks first, so the company reads them in the order they happened.
  await flushTripEventQueue();
  const left = await deliver(ev);
  if (!left) return { sent: true };
  const queue = await readQueue();
  await writeQueue([...queue.filter((q) => q.client_event_id !== left.client_event_id), left]);
  return { sent: Boolean(left.eventSent || left.messageSent) };
}

let flushing: Promise<number> | null = null;

/** Send what the phone kept while it had no internet. Returns how many went out. */
export function flushTripEventQueue(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    const queue = await readQueue();
    if (queue.length === 0) return 0;
    const ordered = [...queue]
      .filter((e) => !expired(e))
      .sort((a, b) => a.happened_at.localeCompare(b.happened_at));
    const left: PendingTripEvent[] = [];
    let sent = 0;
    // Each one on its own, oldest first: one the server refuses must not hold
    // back the others. Without internet they all fail fast and stay.
    for (const ev of ordered) {
      const rest = await deliver(ev);
      if (rest) left.push(rest);
      else sent += 1;
    }
    // Something may have been added meanwhile (another context): keep it too.
    const latest = await readQueue();
    const handled = new Set(queue.map((e) => e.client_event_id));
    await writeQueue([...left, ...latest.filter((e) => !handled.has(e.client_event_id))]);
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Every mark of a booking, oldest first. */
export async function fetchTripEvents(bookingId: string): Promise<TripEventRow[]> {
  const id = bookingId?.trim();
  if (!id) return [];
  const { data, error } = await supabase
    .from('trip_events')
    .select(SELECT)
    .eq('booking_id', id)
    .order('happened_at', { ascending: true })
    .limit(200);
  if (error || !Array.isArray(data)) return [];
  return data as TripEventRow[];
}

/** The latest mark of each booking, for lists of cards. */
export async function fetchLastTripEvents(bookingIds: string[]): Promise<Map<string, TripEventRow>> {
  const ids = [...new Set(bookingIds.map((b) => String(b ?? '').trim()).filter(Boolean))];
  const out = new Map<string, TripEventRow>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('trip_events')
    .select(SELECT)
    .in('booking_id', ids)
    .order('happened_at', { ascending: false })
    .limit(500);
  if (error || !Array.isArray(data)) return out;
  for (const row of data as TripEventRow[]) {
    if (!out.has(row.booking_id)) out.set(row.booking_id, row);
  }
  return out;
}

/** The latest mark, including one still waiting on the phone. */
export async function latestTripEvent(
  bookingId: string,
): Promise<{ kind: TripEventKind; happened_at: string } | null> {
  const [rows, pending] = await Promise.all([fetchTripEvents(bookingId), pendingTripEvents(bookingId)]);
  const all = [
    ...rows.map((r) => ({ kind: r.kind, happened_at: r.happened_at })),
    ...pending.map((p) => ({ kind: p.kind, happened_at: p.happened_at })),
  ].sort((a, b) => a.happened_at.localeCompare(b.happened_at));
  return all.length ? all[all.length - 1]! : null;
}

export function subscribeToTripEvents(bookingId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`trip-events-${bookingId}-${Math.random().toString(36).slice(2, 10)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'trip_events', filter: `booking_id=eq.${bookingId}` },
      () => onChange(),
    )
    .subscribe();
}

/** A link that opens the spot in the phone's or the computer's map. */
export function tripEventMapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
