import {
  DISPATCH_RATING_WAVE1_SIZE,
  DISPATCH_RATING_WAVE2_DELAY_MS,
} from './dispatchConfig';
import {
  buildRatingWaves,
  markDriversDispatched,
  type PushRecipientLike,
} from './driverRatingSort';
import { sendExpoPushToMany } from './expoPush';
import { supabase } from './supabase';

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

/** Broadcast push: top-rated wave first, remaining drivers after a short delay. */
export async function sendBroadcastPushInRatingWaves(
  recipients: PushRecipientLike[],
  title: string,
  body: string,
  data: Record<string, string>,
  bookingId?: string | null,
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
