import {
  DISPATCH_RATING_WAVE1_SIZE,
  DISPATCH_RATING_WAVE2_DELAY_MS,
} from './dispatchConfig';
import { sortPushRecipientsByRating, type PushRecipientLike } from './driverRatingSort';
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
  const sorted = await sortPushRecipientsByRating(recipients);
  const wave1Recipients = sorted.slice(0, DISPATCH_RATING_WAVE1_SIZE);
  const wave2Recipients = sorted.slice(DISPATCH_RATING_WAVE1_SIZE);

  const wave1Tokens = uniqueTokens(wave1Recipients);
  const wave2Tokens = uniqueTokens(wave2Recipients);

  const batch1 = await sendExpoPushToMany(wave1Tokens, title, body, data);

  if (wave2Tokens.length > 0) {
    scheduleRatingWave2Push({
      bookingId: bookingId?.trim() || undefined,
      tokens: wave2Tokens,
      title,
      body,
      data,
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
