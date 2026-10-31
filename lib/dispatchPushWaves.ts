import {
  DISPATCH_RATING_WAVE1_SIZE,
  DISPATCH_RATING_WAVE2_DELAY_MS,
} from './dispatchConfig';
import {
  buildRatingWaves,
  markDriversDispatched,
  type PushRecipientLike,
} from './driverRatingSort';
import { markRecipientsFinishingNearPickup, type EmptyLegPickup } from './emptyLegChaining';
import { sendExpoPushToMany } from './expoPush';
import { dispatchNewBookingOnServer, type ServerPushOutcome } from './serverPush';
import { supabase } from './supabase';

/**
 * P0-4: a new booking goes out through the server. The app still decides the
 * order — drivers finishing a job next door, then coverage, KEKE Certified and
 * rating fill the first wave, everyone else waits three minutes — and sends
 * only driver ids. The server drops anyone it may not tell (not approved,
 * blocked, declined, busy, wrong car), writes the text and sends it; the
 * dispatch log is written there too.
 *
 * A job offered to one driver goes to that driver whatever this app thinks of
 * him (the server decides). An open job with nobody matched here goes to the
 * server's own waves. `outcome` 'missing' means the server is older than this
 * app: the caller sends the old way.
 */
export async function dispatchBookingViaServer(params: {
  bookingId: string;
  recipients: PushRecipientLike[];
  targetedDriverId?: string | null;
  pickup: EmptyLegPickup;
}): Promise<{ outcome: ServerPushOutcome; notified: number; queued: number }> {
  const targeted = String(params.targetedDriverId ?? '').trim();
  if (targeted) {
    return dispatchNewBookingOnServer(params.bookingId, [targeted], []);
  }
  if (params.recipients.length === 0) {
    return dispatchNewBookingOnServer(params.bookingId, null, null);
  }

  const ordered = await markRecipientsFinishingNearPickup(params.recipients, params.pickup);
  const { wave1, wave2 } = await buildRatingWaves(ordered, DISPATCH_RATING_WAVE1_SIZE);
  const first = [...new Set(wave1.map((r) => r.userId))];
  const firstSet = new Set(first);
  const later = [...new Set(wave2.map((r) => r.userId))].filter((id) => !firstSet.has(id));

  const result = await dispatchNewBookingOnServer(params.bookingId, first, later);
  if (result.outcome === 'sent') {
    // Round-robin fairness, exactly as before: the first wave takes a turn.
    void markDriversDispatched(first);
  }
  return result;
}

export type RatingWavePushResult = {
  tokenCount: number;
  sentCount: number;
  failedCount: number;
  wave2Scheduled: boolean;
};

function uniqueTokens(recipients: PushRecipientLike[]): string[] {
  return [...new Set(recipients.map((r) => r.token.trim()).filter(Boolean))];
}

async function isBookingStillOpenForDispatch(bookingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookings')
    .select('status, driver_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !data) return false;

  const row = data as { status?: string | null; driver_id?: string | null };
  if (row.driver_id != null && String(row.driver_id).trim()) return false;
  return row.status === 'pending';
}

/**
 * Wave 2 used to be a `setTimeout` in this app. That meant the second half of
 * the drivers only ever heard about a booking if the company kept the app open
 * and unlocked for three more minutes — which is exactly what nobody does after
 * tapping "create". The server-side queue (`enqueue_booking_push` →
 * `flush_push_outbox`, run once a minute by cron) sends it whether or not this
 * app is still alive. The in-app timer stays only for the case the queue cannot
 * serve: a push with no booking row to attach it to.
 */
async function enqueueRatingWave2Push(params: {
  bookingId: string;
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<boolean> {
  const { error } = await supabase.rpc('enqueue_booking_push', {
    p_booking_id: params.bookingId,
    p_tokens: params.tokens,
    p_title: params.title,
    p_body: params.body,
    p_data: params.data,
    p_delay_seconds: Math.round(DISPATCH_RATING_WAVE2_DELAY_MS / 1000),
  });

  if (error) {
    if (__DEV__) console.warn('[dispatchPushWaves] wave2 enqueue failed:', error.message);
    return false;
  }
  return true;
}

function scheduleRatingWave2Push(params: {
  bookingId?: string;
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}): void {
  if (params.tokens.length === 0) return;

  setTimeout(() => {
    void (async () => {
      const bookingId = params.bookingId?.trim();
      if (bookingId) {
        const stillOpen = await isBookingStillOpenForDispatch(bookingId);
        if (!stillOpen) {
          if (__DEV__) {
            console.log('[dispatchPushWaves] wave2 skipped — booking no longer open', bookingId);
          }
          return;
        }
      }

      const batch = await sendExpoPushToMany(params.tokens, params.title, params.body, params.data);
      if (__DEV__) {
        console.log('[dispatchPushWaves] wave2 sent', {
          tokens: params.tokens.length,
          sent: batch.sentCount,
          failed: batch.failedCount,
        });
      }
    })();
  }, DISPATCH_RATING_WAVE2_DELAY_MS);
}

/**
 * What the admin panel needs to answer "who got this booking, and why not him?"
 *
 * Nothing about dispatch was recorded before, so the only way to reconstruct a
 * wave was to re-run the ranking in your head against data that had since
 * changed. One row per dispatch, written here where the waves are actually
 * decided, makes it a question you can look up.
 */
async function recordDispatch(params: {
  bookingId: string;
  regions: string[];
  fromLocation?: string | null;
  toLocation?: string | null;
  wave1Ids: string[];
  wave2Ids: string[];
  wave1Tokens: number;
  wave2Tokens: number;
  sent: number;
  failed: number;
}): Promise<void> {
  const { error } = await supabase.rpc('log_dispatch', {
    p_booking_id: params.bookingId,
    p_regions: params.regions,
    p_from_location: params.fromLocation ?? null,
    p_to_location: params.toLocation ?? null,
    p_wave1_driver_ids: params.wave1Ids,
    p_wave2_driver_ids: params.wave2Ids,
    p_wave1_token_count: params.wave1Tokens,
    p_wave2_token_count: params.wave2Tokens,
    p_wave1_sent: params.sent,
    p_wave1_failed: params.failed,
  });
  // A missing log must never cost anyone a booking, so this is fire-and-forget.
  if (error && __DEV__) {
    console.warn('[dispatchPushWaves] dispatch log failed:', error.message);
  }
}

/** Where the job runs, for the dispatch log. Absent is fine — it logs anyway. */
export type DispatchLogContext = {
  regions?: string[];
  fromLocation?: string | null;
  toLocation?: string | null;
};

/** Broadcast push: top-rated wave first, remaining drivers after a short delay. */
export async function sendBroadcastPushInRatingWaves(
  recipients: PushRecipientLike[],
  title: string,
  body: string,
  data: Record<string, string>,
  bookingId?: string | null,
  logContext?: DispatchLogContext,
): Promise<RatingWavePushResult> {
  const { wave1: wave1Recipients, wave2: wave2Recipients } = await buildRatingWaves(
    recipients,
    DISPATCH_RATING_WAVE1_SIZE,
  );

  const wave1Tokens = uniqueTokens(wave1Recipients);
  const wave2Tokens = uniqueTokens(wave2Recipients);

  const batch1 = await sendExpoPushToMany(wave1Tokens, title, body, data);

  // Round-robin fairness: equally-scored drivers take turns at the front.
  void markDriversDispatched(wave1Recipients.map((r) => r.userId));

  if (wave2Tokens.length > 0) {
    const id = bookingId?.trim() || '';
    const queued = id
      ? await enqueueRatingWave2Push({ bookingId: id, tokens: wave2Tokens, title, body, data })
      : false;

    if (!queued) {
      scheduleRatingWave2Push({
        bookingId: id || undefined,
        tokens: wave2Tokens,
        title,
        body,
        data,
      });
    }
  }

  const logBookingId = bookingId?.trim();
  if (logBookingId) {
    void recordDispatch({
      bookingId: logBookingId,
      regions: logContext?.regions ?? [],
      fromLocation: logContext?.fromLocation,
      toLocation: logContext?.toLocation,
      wave1Ids: [...new Set(wave1Recipients.map((r) => r.userId))],
      wave2Ids: [...new Set(wave2Recipients.map((r) => r.userId))],
      wave1Tokens: wave1Tokens.length,
      wave2Tokens: wave2Tokens.length,
      sent: batch1.sentCount,
      failed: batch1.failedCount,
    });
  }

  if (__DEV__) {
    console.log('[dispatchPushWaves] wave1 sent', {
      wave1: wave1Tokens.length,
      wave2Scheduled: wave2Tokens.length,
      topDrivers: wave1Recipients.slice(0, 3).map((r) => r.userId),
    });
  }

  return {
    tokenCount: wave1Tokens.length + wave2Tokens.length,
    sentCount: batch1.sentCount,
    failedCount: batch1.failedCount,
    wave2Scheduled: wave2Tokens.length > 0,
  };
}
