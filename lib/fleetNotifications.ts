import i18n from '../src/lib/i18n';
import { sendExpoPushNotification } from './expoPush';
import { insertInAppNotifications } from './notifications';
import { supabase } from './supabase';

async function pushToUser(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  const id = userId.trim();
  if (!id) return;

  await insertInAppNotifications([
    {
      user_id: id,
      type: String(data.type ?? 'general'),
      title,
      body,
      data,
    },
  ]);

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', id)
    .maybeSingle();

  const token = (profile as { push_token?: string | null } | null)?.push_token?.trim() ?? '';
  if (!token) return;

  const pushData: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v != null) pushData[k] = String(v);
  }
  await sendExpoPushNotification(token, title, body, pushData);
}

/** Push + in-app: host invited sub to fleet vehicle. */
export async function notifyFleetInviteToSub(params: {
  subDriverId: string;
  hostDriverId: string;
  fleetId: string;
}): Promise<void> {
  const subId = params.subDriverId.trim();
  const hostId = params.hostDriverId.trim();
  if (!subId || !hostId) return;

  const { data: host } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', hostId)
    .maybeSingle();

  const hostName =
    (host as { full_name?: string | null } | null)?.full_name?.trim() ||
    i18n.t('common.driver');

  const title = i18n.t('fleet.invitePushTitle');
  const body = i18n.t('fleet.invitePushBody', { host: hostName });

  await pushToUser(subId, title, body, {
    type: 'fleet_invite',
    fleet_id: params.fleetId.trim(),
    host_driver_id: hostId,
  });
}

/** Push + in-app: host assigned a company booking to sub. */
export async function notifyBookingAssignedByHost(params: {
  subDriverId: string;
  hostDriverId: string;
  bookingId: string;
  routeSummary: string;
  voucherCode?: string;
  driverPayoutGel?: number;
}): Promise<void> {
  const subId = params.subDriverId.trim();
  if (!subId) return;

  const route = params.routeSummary.trim();
  const voucher = params.voucherCode?.trim();
  const payout = params.driverPayoutGel;
  const payoutLine =
    payout != null && Number.isFinite(payout) && payout > 0
      ? i18n.t('fleet.bookingAssignedPayout', {
          amount: payout.toLocaleString('ka-GE'),
        })
      : '';
  const title = i18n.t('fleet.bookingAssignedTitle');
  const body = voucher
    ? [i18n.t('fleet.bookingAssignedBodyVoucher', { code: voucher, route }), payoutLine]
        .filter(Boolean)
        .join('\n')
    : [i18n.t('fleet.bookingAssignedBody', { route: route || '—' }), payoutLine]
        .filter(Boolean)
        .join('\n');

  await pushToUser(subId, title, body, {
    type: 'booking_assigned',
    booking_id: params.bookingId.trim(),
    host_driver_id: params.hostDriverId.trim(),
  });
}

/** Push + in-app: fleet sub completed a trip — notify host. */
export async function notifyHostTourCompleted(params: {
  hostDriverId: string;
  bookingId: string;
  driverName?: string;
  routeSummary?: string;
}): Promise<void> {
  const hostId = params.hostDriverId.trim();
  const bookingId = params.bookingId.trim();
  if (!hostId || !bookingId) return;

  const title = i18n.t('fleet.tourCompletedHostTitle');
  const driverLine = params.driverName?.trim()
    ? i18n.t('fleet.tourCompletedHostBy', { name: params.driverName.trim() })
    : i18n.t('fleet.tourCompletedHostBody');
  const body = [driverLine, params.routeSummary?.trim()].filter(Boolean).join('\n');

  await pushToUser(hostId, title, body, {
    type: 'booking_completed_host',
    booking_id: bookingId,
  });
}
