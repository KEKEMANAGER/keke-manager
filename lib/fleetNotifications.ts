import i18n from '../src/lib/i18n';
import { sendExpoPushNotification } from './expoPush';
import { supabase } from './supabase';

async function pushToUser(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  const id = userId.trim();
  if (!id) return;

  await supabase.from('notifications').insert({
    user_id: id,
    type: String(data.type ?? 'general'),
    title,
    body,
    data,
  });

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
}): Promise<void> {
  const subId = params.subDriverId.trim();
  if (!subId) return;

  const route = params.routeSummary.trim();
  const voucher = params.voucherCode?.trim();
  const title = i18n.t('fleet.bookingAssignedTitle');
  const body = voucher
    ? i18n.t('fleet.bookingAssignedBodyVoucher', { code: voucher, route })
    : i18n.t('fleet.bookingAssignedBody', { route: route || '—' });

  await pushToUser(subId, title, body, {
    type: 'booking_assigned',
    booking_id: params.bookingId.trim(),
    host_driver_id: params.hostDriverId.trim(),
  });
}
