import { BOOKINGS_CHANNEL_ID } from './notifications';

export type ExpoPushSendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

/**
 * Sends a push via Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Used for dev self-test; production should use a secure backend with the same payload shape.
 */
export async function sendExpoPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<ExpoPushSendResult> {
  const token = expoPushToken.trim();
  if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
    return { ok: false, error: 'Invalid Expo push token format' };
  }

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        priority: 'high',
        channelId: BOOKINGS_CHANNEL_ID,
        data: data ?? { type: 'new_booking' },
      }),
    });

    const json = (await res.json()) as {
      data?: { status?: string; id?: string; message?: string } | { status?: string; message?: string }[];
      errors?: { message?: string }[];
    };

    if (!res.ok) {
      const msg =
        json.errors?.[0]?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    const item = Array.isArray(json.data) ? json.data[0] : json.data;
    if (item?.status === 'error') {
      return { ok: false, error: item.message ?? 'Expo push error' };
    }

    const id = item && typeof item === 'object' && 'id' in item ? String(item.id) : undefined;
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

export type ExpoPushBatchResult = {
  sentCount: number;
  failedCount: number;
  errors: string[];
};

/** Sends the same payload to multiple Expo push tokens (batch API). */
export async function sendExpoPushToMany(
  expoPushTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<ExpoPushBatchResult> {
  const tokens = [...new Set(expoPushTokens.map((t) => t.trim()).filter(Boolean))].filter(
    (t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['),
  );

  if (tokens.length === 0) {
    return { sentCount: 0, failedCount: 0, errors: [] };
  }

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    sound: 'default' as const,
    priority: 'high' as const,
    channelId: BOOKINGS_CHANNEL_ID,
    data: data ?? { type: 'new_booking' },
  }));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const json = (await res.json()) as {
      data?: { status?: string; message?: string }[];
      errors?: { message?: string }[];
    };

    if (!res.ok) {
      const msg = json.errors?.[0]?.message ?? `HTTP ${res.status}`;
      return { sentCount: 0, failedCount: tokens.length, errors: [msg] };
    }

    const items = Array.isArray(json.data) ? json.data : [];
    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const item = items[i];
      if (item?.status === 'ok') {
        sentCount += 1;
      } else {
        failedCount += 1;
        if (item?.message) errors.push(item.message);
      }
    }

    return { sentCount, failedCount, errors };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { sentCount: 0, failedCount: tokens.length, errors: [msg] };
  }
}
