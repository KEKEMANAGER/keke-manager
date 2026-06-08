import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import i18n from '../src/lib/i18n';
import type { RequestedDriverCategory } from './driverCategory';
import {
  driverEligibleForOpenJobBroadcast,
  driverMatchesRequestedCategory,
  normalizeRequestedDriverCategory,
} from './driverCategory';
import type { BookingScheduleInput } from './driverSchedules';
import {
  estimateBookingBusyWindow,
  filterDriverIdsAvailableForWindow,
  SCHEDULE_OVERLAP_BUFFER_MS,
} from './driverSchedules';
import { BOOKINGS_CHANNEL_ID } from './pushChannels';
import { sendExpoPushNotification, sendExpoPushToMany } from './expoPush';
import { driverMatchesRequiredLanguages } from './spokenLanguages';
import { formatTourBookingNotificationBody } from './tourDays';
import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  vehicleClassLabel,
  vehicleTypeLabel,
  type VehicleClassCode,
  type VehicleTypeCode,
} from './vehicleCatalog';

export { BOOKINGS_CHANNEL_ID };
let handlerConfigured = false;

/** Safe copy for push titles/bodies when i18n is cold or a key is missing. */
function notifyT(key: string, fallback: string): string {
  try {
    const exists = typeof i18n.exists === 'function' ? i18n.exists(key) : true;
    if (!exists) return fallback;
    const v = String(i18n.t(key)).trim();
    if (!v || v === key) return fallback;
    return v;
  } catch {
    return fallback;
  }
}

export function configureNotificationHandler(): void {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
}

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(BOOKINGS_CHANNEL_ID, {
    name: 'Bookings',
    description: 'New orders and booking updates',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 150, 300],
    lightColor: '#D4AF37',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
    bypassDnd: false,
  });
}

/** Normalized `bookings.kind` for push copy (transfer | tour | day_tour). */
export function normalizePushBookingKind(
  raw: string | null | undefined,
): 'transfer' | 'tour' | 'day_tour' {
  const k = String(raw ?? 'transfer').trim().toLowerCase();
  if (k === 'tour') return 'tour';
  if (k === 'day_tour' || k === 'daytour' || k === 'day tour') return 'day_tour';
  return 'transfer';
}

export function getNewBookingNotificationContent(kind?: string | null) {
  const k = normalizePushBookingKind(kind);
  if (k === 'tour') {
    return {
      title: notifyT('notifications.newBookingTitleTour', 'KEKE · New tour!'),
      body: notifyT('notifications.newBookingBodyTour', 'New tour request — open the app.'),
    };
  }
  if (k === 'day_tour') {
    return {
      title: notifyT('notifications.newBookingTitleDayTour', 'KEKE · New day tour!'),
      body: notifyT('notifications.newBookingBodyDayTour', 'New day tour — open the app.'),
    };
  }
  return {
    title: notifyT('notifications.newBookingTitleTransfer', 'KEKE · New transfer!'),
    body: notifyT('notifications.newBookingBodyTransfer', 'New transfer — open the app.'),
  };
}

export function getBookingConfirmedNotificationContent() {
  return {
    title: notifyT('notifications.newBookingTitle', 'KEKE'),
    body: notifyT('notifications.bookingConfirmedBody', 'Booking confirmed ✅'),
  };
}

export function getTestNotificationContent() {
  return {
    title: notifyT('notifications.testTitle', 'KEKE Test'),
    body: notifyT('notifications.testBody', 'Push notifications are working.'),
  };
}

export function notificationContentFromRequest(
  notification: Notifications.Notification,
): { title: string; body: string } {
  const content = notification.request.content;
  const data = content.data as Record<string, unknown> | undefined;
  const kindRaw =
    (typeof data?.booking_kind === 'string' && data.booking_kind) ||
    (typeof data?.kind === 'string' && data.kind) ||
    null;
  const fallback = getNewBookingNotificationContent(kindRaw);
  return {
    title: content.title?.trim() || fallback.title,
    body: content.body?.trim() || fallback.body,
  };
}

export type NotifyMatchingDriversResult = {
  tokenCount: number;
  sentCount: number;
  failedCount: number;
  vehicleType: string | null;
  vehicleClass: string | null;
  message: string | null;
};

type DriverPushRecipient = {
  userId: string;
  token: string;
};

type DriverPushRow = {
  id: string;
  push_token: string | null;
};

/** Persist rows in `public.notifications` for in-app history (parallel to pushes). */
export async function insertInAppNotifications(
  rows: {
    user_id: string;
    type: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
  }[],
): Promise<Error | null> {
  if (rows.length === 0) return null;
  const { error } = await supabase.rpc('create_user_notifications', {
    p_rows: rows.map((r) => ({
      user_id: r.user_id,
      type: r.type,
      title: r.title,
      body: r.body,
      data: r.data,
    })),
  });
  if (error) {
    if (__DEV__) console.warn('[notifications] create_user_notifications:', error.message);
    return new Error(error.message);
  }
  return null;
}

/** Canonical lowercase codes for vehicle matching. */
export function normalizeBookingVehicleFilters(
  rawType: string,
  rawClass: string,
): { vehicleType: VehicleTypeCode | null; vehicleClass: VehicleClassCode | null } {
  return {
    vehicleType: normalizeVehicleType(rawType),
    vehicleClass: normalizeVehicleClass(rawClass),
  };
}

/**
 * Drivers with an active vehicle matching booking type AND class (same rules as open job board).
 * Push tokens are read from `profiles`; verification from `profiles` + `users`.
 */
export async function fetchMatchingDriverPushRecipients(
  bookingVehicleType: string,
  bookingVehicleClass: string | null | undefined,
  availability?: BookingScheduleInput | null,
  requiredLanguages?: string[] | null,
  driverCategory?: RequestedDriverCategory | null,
): Promise<{
  recipients: DriverPushRecipient[];
  error: Error | null;
  vehicleType: VehicleTypeCode | null;
  vehicleClass: VehicleClassCode | null;
}> {
  const { vehicleType, vehicleClass } = normalizeBookingVehicleFilters(
    bookingVehicleType,
    bookingVehicleClass ?? '',
  );
  const category = normalizeRequestedDriverCategory(driverCategory ?? 'all');

  if (!vehicleType) {
    return {
      recipients: [],
      error: new Error('ჯავშნის vehicle_type არასწორია'),
      vehicleType: null,
      vehicleClass,
    };
  }

  if (!vehicleClass) {
    return {
      recipients: [],
      error: new Error('ჯავშნის vehicle_class არასწორია'),
      vehicleType,
      vehicleClass: null,
    };
  }

  const { data: vehicleRows, error: vehiclesError } = await supabase
    .from('vehicles')
    .select('driver_id')
    .eq('is_active', true)
    .eq('type', vehicleType)
    .eq('class', vehicleClass);

  if (vehiclesError) {
    if (__DEV__) console.warn('[notify] vehicles filter query failed:', vehiclesError.message);
    return { recipients: [], error: new Error(vehiclesError.message), vehicleType, vehicleClass };
  }

  let driverIds = [
    ...new Set(
      (vehicleRows ?? [])
        .map((row) => String((row as { driver_id?: string }).driver_id ?? '').trim())
        .filter((id) => id.length > 0),
    ),
  ];

  if (driverIds.length === 0) {
    return { recipients: [], error: null, vehicleType, vehicleClass };
  }

  const [profilesRes, usersRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, push_token, is_verified')
      .in('id', driverIds)
      .not('push_token', 'is', null),
    supabase
      .from(USERS_DIRECTORY)
      .select('id, is_verified, languages, is_hired_driver, is_guide_driver')
      .in('id', driverIds),
  ]);

  if (profilesRes.error) {
    if (__DEV__) console.warn('[notify] profiles push query failed:', profilesRes.error.message);
    return { recipients: [], error: new Error(profilesRes.error.message), vehicleType, vehicleClass };
  }

  const usersVerified = new Map<string, boolean>();
  const userLanguages = new Map<string, string[]>();
  const userById = new Map<
    string,
    { is_hired_driver?: boolean | null; is_guide_driver?: boolean | null }
  >();
  for (const row of usersRes.data ?? []) {
    const u = row as {
      id: string;
      is_verified?: boolean | null;
      languages?: string[] | null;
      is_hired_driver?: boolean | null;
      is_guide_driver?: boolean | null;
    };
    const uid = String(u.id);
    usersVerified.set(uid, u.is_verified === true);
    userLanguages.set(
      uid,
      Array.isArray(u.languages) ? u.languages.filter((x) => typeof x === 'string') : [],
    );
    userById.set(uid, {
      is_hired_driver: u.is_hired_driver,
      is_guide_driver: u.is_guide_driver,
    });
  }

  let matchedRows = (profilesRes.data ?? [])
    .map((row) => row as DriverPushRow & { is_verified?: boolean | null })
    .filter((row) => {
      const verified = row.is_verified === true || usersVerified.get(row.id) === true;
      if (!verified) return false;
      const userRow = userById.get(row.id) ?? {};
      if (!driverEligibleForOpenJobBroadcast(userRow)) return false;
      if (!driverMatchesRequestedCategory(userRow, category)) return false;
      return driverMatchesRequiredLanguages(userLanguages.get(row.id), requiredLanguages);
    });

  const busyWindow = availability ? estimateBookingBusyWindow(availability) : null;
  if (busyWindow && matchedRows.length > 0) {
    const { availableIds, error: availErr } = await filterDriverIdsAvailableForWindow(
      matchedRows.map((r) => r.id),
      busyWindow,
      SCHEDULE_OVERLAP_BUFFER_MS,
    );
    if (availErr) {
      if (__DEV__) console.warn('[notify] schedule filter failed:', availErr.message);
    } else {
      const allowed = new Set(availableIds);
      matchedRows = matchedRows.filter((r) => allowed.has(r.id));
    }
  }

  const byUser = new Map<string, string>();
  for (const row of matchedRows) {
    const t = row.push_token?.trim() ?? '';
    if (t.length > 0 && !byUser.has(row.id)) {
      byUser.set(row.id, t);
    }
  }

  const recipients: DriverPushRecipient[] = [...byUser.entries()].map(([userId, token]) => ({
    userId,
    token,
  }));

  return { recipients, error: null, vehicleType, vehicleClass };
}

/** Push recipients for targeted booking assignment (single driver). */
export async function fetchDriverPushRecipientsById(
  driverId: string,
  availability?: BookingScheduleInput | null,
): Promise<{ recipients: DriverPushRecipient[]; error: Error | null }> {
  const id = String(driverId ?? '').trim();
  if (!id) {
    return { recipients: [], error: new Error('მძღოლის id არ არის') };
  }

  const [profileRes, userRes] = await Promise.all([
    supabase.from('profiles').select('push_token, is_verified').eq('id', id).maybeSingle(),
    supabase.from(USERS_DIRECTORY).select('is_verified').eq('id', id).maybeSingle(),
  ]);

  if (profileRes.error) {
    return { recipients: [], error: new Error(profileRes.error.message) };
  }

  const row = profileRes.data as {
    push_token?: string | null;
    is_verified?: boolean | null;
  } | null;

  const userVerified = (userRes.data as { is_verified?: boolean | null } | null)?.is_verified === true;
  const profileVerified = row?.is_verified === true;
  if (!profileVerified && !userVerified) {
    return { recipients: [], error: null };
  }

  const token = row?.push_token?.trim() ?? '';
  if (!token) {
    return { recipients: [], error: null };
  }

  const busyWindow = availability ? estimateBookingBusyWindow(availability) : null;
  if (busyWindow) {
    const { availableIds } = await filterDriverIdsAvailableForWindow(
      [id],
      busyWindow,
      SCHEDULE_OVERLAP_BUFFER_MS,
    );
    if (!availableIds.includes(id)) {
      return { recipients: [], error: null };
    }
  }

  return { recipients: [{ userId: id, token }], error: null };
}

export async function notifyMatchingDriversOfNewBooking(params: {
  kind: string;
  vehicleType: string;
  vehicleClass?: string | null;
  /** When set, notify only this driver (not all matching). */
  driverId?: string | null;
  bookingId?: string;
  showAlertIfEmpty?: boolean;
  /** Service time window — drivers with overlapping `driver_schedules` are skipped. */
  availability?: BookingScheduleInput | null;
  /** When set, only drivers who speak at least one of these languages are notified. */
  requiredLanguages?: string[] | null;
  /** Open-job filter stored on the booking (`all` | `guide` | `own_vehicle`). */
  requestedDriverCategory?: RequestedDriverCategory | null;
  /** Extra lines appended to push body (e.g. multi-day tour itinerary). */
  detailBody?: string | null;
}): Promise<NotifyMatchingDriversResult> {
  const { vehicleType, vehicleClass } = normalizeBookingVehicleFilters(
    params.vehicleType,
    params.vehicleClass ?? '',
  );

  const emptyResult = (message: string): NotifyMatchingDriversResult => ({
    tokenCount: 0,
    sentCount: 0,
    failedCount: 0,
    vehicleType,
    vehicleClass,
    message,
  });

  if (!vehicleType) {
    const message = i18n.t('notifications.matchingVehicleInvalid');
    if (__DEV__) console.warn('[notifyMatchingDrivers]', message);
    if (params.showAlertIfEmpty) {
      Alert.alert(i18n.t('system.noticeTitle'), message);
    }
    return emptyResult(message);
  }

  const kindLog = (String(params.kind ?? '').trim() || 'booking');
  const classLog = String(vehicleClass);
  if (__DEV__) {
    console.log(
      `Sending ${kindLog} request to drivers with ${String(vehicleType)} ${classLog}`,
    );
  }

  const targetedDriverId = String(params.driverId ?? '').trim();
  const { recipients, error } = targetedDriverId
    ? await fetchDriverPushRecipientsById(targetedDriverId, params.availability)
    : await fetchMatchingDriverPushRecipients(
        vehicleType,
        vehicleClass,
        params.availability,
        params.requiredLanguages,
        params.requestedDriverCategory,
      );

  if (error) {
    if (__DEV__) console.warn('[notifyMatchingDrivers] fetch error:', error.message);
    if (params.showAlertIfEmpty) {
      Alert.alert(i18n.t('system.errorTitle'), error.message);
    }
    return emptyResult(error.message);
  }

  if (recipients.length === 0) {
    const classLabel = vehicleClass
      ? vehicleClassLabel(vehicleClass)
      : i18n.t('notifications.anyVehicleClass');
    const message = i18n.t('notifications.matchingNoDrivers', {
      type: vehicleTypeLabel(vehicleType),
      class: classLabel,
    });
    if (__DEV__) console.warn('[notifyMatchingDrivers]', message);
    if (params.showAlertIfEmpty) {
      Alert.alert(i18n.t('system.noticeTitle'), message);
    }
    return emptyResult(message);
  }

  const kindNorm = normalizePushBookingKind(params.kind);
  const { title, body: baseBody } = getNewBookingNotificationContent(kindNorm);
  const detail = params.detailBody?.trim();
  const body = detail ? `${baseBody}\n${detail}` : baseBody;
  const data: Record<string, string> = {
    type: 'new_booking',
    booking_kind: kindNorm,
    vehicle_type: vehicleType,
  };
  if (vehicleClass) {
    data.vehicle_class = vehicleClass;
  }
  if (params.bookingId) {
    data.booking_id = params.bookingId;
  }

  const dataRecord: Record<string, unknown> = { ...data };
  await insertInAppNotifications(
    recipients.map((r) => ({
      user_id: r.userId,
      type: 'new_booking',
      title,
      body,
      data: dataRecord,
    })),
  );

  const tokens = [...new Set(recipients.map((r) => r.token))];
  const batch = await sendExpoPushToMany(tokens, title, body, data);

  return {
    tokenCount: tokens.length,
    sentCount: batch.sentCount,
    failedCount: batch.failedCount,
    vehicleType,
    vehicleClass,
    message: null,
  };
}

/**
 * Booking was accepted / confirmed by a driver: in-app notification + optional push for the company.
 */
export async function notifyCompanyBookingAccepted(params: {
  companyUserId: string;
  bookingId: string;
  driverName?: string;
  driverPhone?: string;
  driverPlate?: string;
}): Promise<void> {
  const companyUserId = params.companyUserId.trim();
  const bookingId = params.bookingId.trim();
  if (!companyUserId || !bookingId) return;

  const { title } = getBookingConfirmedNotificationContent();

  const lines: string[] = [];
  lines.push(notifyT('notifications.bookingConfirmedBody', 'Booking confirmed ✅'));
  if (params.driverName?.trim()) lines.push(`👤 ${params.driverName.trim()}`);
  if (params.driverPhone?.trim()) lines.push(`📞 ${params.driverPhone.trim()}`);
  if (params.driverPlate?.trim()) lines.push(`🚗 ${params.driverPlate.trim()}`);
  const body = lines.join('\n');

  const pushData: Record<string, string> = {
    type: 'booking_accepted',
    booking_id: bookingId,
  };
  await insertInAppNotifications([
    {
      user_id: companyUserId,
      type: 'booking_accepted',
      title,
      body,
      data: { ...pushData },
    },
  ]);

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', companyUserId)
    .maybeSingle();

  const token = (profile as { push_token?: string | null } | null)?.push_token?.trim() ?? '';
  if (!token) return;

  const res = await sendExpoPushNotification(token, title, body, pushData);
  if (!res.ok && __DEV__) console.warn('[notify] booking_accepted push failed:', res.error);
}

/** Driver cancelled an accepted / in-progress booking — notify company. */
export async function notifyCompanyDriverCancelledBooking(params: {
  companyUserId: string;
  bookingId: string;
  driverName?: string;
  routeSummary?: string;
}): Promise<void> {
  const companyUserId = params.companyUserId.trim();
  const bookingId = params.bookingId.trim();
  if (!companyUserId || !bookingId) return;

  const title = notifyT('notifications.driverCancelledTitle', 'KEKE · Booking cancelled');
  const driverLine = params.driverName?.trim()
    ? notifyT('notifications.driverCancelledBy', 'Driver {{name}} cancelled the booking').replace(
        '{{name}}',
        params.driverName.trim(),
      )
    : notifyT('notifications.driverCancelledBody', 'The driver cancelled the booking');
  const body = [driverLine, params.routeSummary?.trim()].filter(Boolean).join('\n');

  const pushData: Record<string, string> = {
    type: 'booking_driver_cancelled',
    booking_id: bookingId,
  };

  await insertInAppNotifications([
    {
      user_id: companyUserId,
      type: 'booking_driver_cancelled',
      title,
      body,
      data: { ...pushData },
    },
  ]);

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', companyUserId)
    .maybeSingle();

  const token = (profile as { push_token?: string | null } | null)?.push_token?.trim() ?? '';
  if (!token) return;

  const res = await sendExpoPushNotification(token, title, body, pushData);
  if (!res.ok && __DEV__) console.warn('[notify] driver_cancelled push failed:', res.error);
}

/** Push copy for chat messages. */
export function getChatMessageNotificationContent(senderName: string, preview: string) {
  const name = senderName.trim() || notifyT('common.newMessage', 'New message');
  const titleTpl = notifyT('notifications.newChatTitle', '{{name}}');
  const title = titleTpl.replace('{{name}}', name);
  const body = preview.trim() || notifyT('notifications.newChatBody', 'You have a new message');
  return { title, body };
}

/**
 * Push a chat message to the receiver's device.
 * Chat is universal: skips verification check, only requires a stored push token.
 */
/** Voucher + route summary when company assigns a driver on create. */
export async function notifyBookingVoucherCreated(params: {
  bookingId: string;
  driverUserId: string;
  companyUserId: string;
  voucherCode: string;
  kind?: string | null;
  route?: string | null;
  from_location?: string | null;
  to_location?: string | null;
  tour_days?: unknown;
  transfer_in?: unknown;
  transfer_out?: unknown;
}): Promise<void> {
  const bookingId = params.bookingId.trim();
  const driverId = params.driverUserId.trim();
  const companyId = params.companyUserId.trim();
  const code = params.voucherCode.trim();
  if (!bookingId || !driverId || !code) return;

  const routeLine =
    params.route?.trim() ||
    [params.from_location, params.to_location].filter((x) => x?.trim()).join(' → ') ||
    '';
  const tourDetail =
    normalizePushBookingKind(params.kind) === 'tour' ||
    normalizePushBookingKind(params.kind) === 'day_tour'
      ? formatTourBookingNotificationBody({
          tour_days: params.tour_days as Parameters<typeof formatTourBookingNotificationBody>[0]['tour_days'],
          transfer_in: params.transfer_in as Parameters<typeof formatTourBookingNotificationBody>[0]['transfer_in'],
          transfer_out: params.transfer_out as Parameters<typeof formatTourBookingNotificationBody>[0]['transfer_out'],
        })
      : '';

  const lines = [
    notifyT('notifications.voucherBodyPrefix', `Voucher ${code}`),
    routeLine,
    tourDetail,
  ].filter(Boolean);
  const body = lines.join('\n').slice(0, 900);
  const title = notifyT('notifications.voucherTitle', 'KEKE · Voucher');
  const data: Record<string, unknown> = {
    type: 'booking_voucher',
    booking_id: bookingId,
    voucher_code: code,
  };

  await insertInAppNotifications([
    { user_id: driverId, type: 'booking_voucher', title, body, data },
    ...(companyId
      ? [{ user_id: companyId, type: 'booking_voucher', title, body, data }]
      : []),
  ]);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, push_token')
    .in('id', [driverId, companyId].filter(Boolean));

  const pushData: Record<string, string> = {
    type: 'booking_voucher',
    booking_id: bookingId,
    voucher_code: code,
  };

  const tokens = [
    ...new Set(
      ((profiles ?? []) as { id: string; push_token?: string | null }[])
        .map((p) => p.push_token?.trim())
        .filter((t): t is string => !!t),
    ),
  ];
  if (tokens.length > 0) {
    await sendExpoPushToMany(tokens, title, body, pushData);
  }
}

export async function notifyChatMessageRecipient(params: {
  receiverUserId: string;
  senderUserId: string;
  senderName: string;
  messageText: string;
  bookingId?: string;
  threadType?: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const receiverId = String(params.receiverUserId ?? '').trim();
  const senderId = String(params.senderUserId ?? '').trim();
  if (!receiverId || !senderId) {
    return { ok: false, error: 'invalid_user_id' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', receiverId)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('[notifyChat] push_token lookup failed:', error.message);
    return { ok: false, error: error.message };
  }

  const preview = params.messageText.trim().slice(0, 120);
  const { title, body } = getChatMessageNotificationContent(params.senderName, preview);
  const pushDataStr: Record<string, string> = {
    type: 'chat_message',
    sender_id: senderId,
  };
  if (params.bookingId?.trim()) {
    pushDataStr.booking_id = params.bookingId.trim();
  }
  if (params.threadType?.trim()) {
    pushDataStr.thread_type = params.threadType.trim();
  }
  await insertInAppNotifications([
    {
      user_id: receiverId,
      type: 'chat_message',
      title,
      body,
      data: { ...pushDataStr },
    },
  ]);

  const token = (data as { push_token?: string | null } | null)?.push_token?.trim() ?? '';
  if (!token) {
    return { ok: true, error: null };
  }

  const res = await sendExpoPushNotification(token, title, body, pushDataStr);

  if (!res.ok) {
    if (__DEV__) console.warn('[notifyChat] send failed:', res.error);
    return { ok: false, error: res.error };
  }
  return { ok: true, error: null };
}

function formatBookingUpdateBody(
  diff: Record<string, { old: string; new: string; label: string }>,
): string {
  const lines = Object.values(diff)
    .slice(0, 6)
    .map((d) => `${d.label}: ${d.old} → ${d.new}`);
  return lines.join('\n') || notifyT('notifications.bookingUpdatedBody', 'Company updated booking details');
}

async function pushBookingUpdatedToUser(
  userId: string,
  bookingId: string,
  diff: Record<string, { old: string; new: string; label: string }>,
): Promise<void> {
  const uid = userId.trim();
  const bid = bookingId.trim();
  if (!uid || !bid) return;

  const title = notifyT('notifications.bookingUpdatedTitle', '📝 Booking updated');
  const body = formatBookingUpdateBody(diff);
  const pushData: Record<string, string> = {
    type: 'booking_updated',
    booking_id: bid,
  };

  await insertInAppNotifications([
    {
      user_id: uid,
      type: 'booking_updated',
      title,
      body,
      data: { ...pushData, changes_json: JSON.stringify(diff) },
    },
  ]);

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', uid)
    .maybeSingle();

  const token = (profile as { push_token?: string | null } | null)?.push_token?.trim() ?? '';
  if (!token) return;

  const res = await sendExpoPushNotification(token, title, body, pushData);
  if (!res.ok && __DEV__) console.warn('[notify] booking_updated push failed:', res.error);
}

export async function notifyDriverBookingUpdated(
  driverId: string,
  bookingId: string,
  changes: Record<string, { old: string; new: string; label: string }>,
): Promise<void> {
  await pushBookingUpdatedToUser(driverId, bookingId, changes);
}

export async function notifyHostBookingUpdated(
  hostDriverId: string,
  bookingId: string,
  changes: Record<string, { old: string; new: string; label: string }>,
): Promise<void> {
  await pushBookingUpdatedToUser(hostDriverId, bookingId, changes);
}
