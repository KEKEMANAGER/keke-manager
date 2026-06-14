import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import '../lib/backgroundLocation';
import {
  configureNotificationHandler,
  ensureAndroidNotificationChannel,
  notificationContentFromRequest,
} from '../lib/notifications';
import { driverProfileMatchesBooking } from '../lib/profiles';
import { registerForPushNotificationsAsync } from '../lib/pushRegistration';
import { getUserRole } from '../lib/role';

configureNotificationHandler();
void ensureAndroidNotificationChannel();

function shouldRegisterPush(role: ReturnType<typeof getUserRole>): boolean {
  return role === 'driver' || role === 'company' || role === 'admin';
}

export function PushNotificationRegistration() {
  const { user, profile, loading, session } = useAuth();
  const role = getUserRole(profile);
  const sessionFingerprint = session?.access_token ?? '';

  useEffect(() => {
    if (loading || !user?.id) return;
    if (!shouldRegisterPush(role)) return;
    void registerForPushNotificationsAsync(user.id, { requestPermission: true });
  }, [loading, user?.id, role, sessionFingerprint]);

  return null;
}

type BookingPushTapPayload = {
  type?: string;
  booking_id?: string;
  sender_id?: string;
  thread_type?: string;
};

function driverOpensBookingsNotificationTypes(data: BookingPushTapPayload | undefined): boolean {
  const payloadType = data?.type;
  return (
    payloadType === 'new_booking' ||
    payloadType === 'booking_confirmed' ||
    payloadType === 'emergency_replacement' ||
    payloadType === 'booking_voucher' ||
    payloadType === 'test'
  );
}

function isChatTapPayload(data: BookingPushTapPayload | undefined): boolean {
  return data?.type === 'chat_message' && !!data?.sender_id;
}

function chatPathForRole(role: ReturnType<typeof getUserRole>): '/(driver)/chat' | '/(app)/chat' {
  return role === 'driver' ? '/(driver)/chat' : '/(app)/chat';
}

export function PushNotificationListeners() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const router = useRouter();
  const role = getUserRole(profile);
  const handledOpenRef = useRef<string | null>(null);

  const navigateChatFromTap = useCallback(
    (response: Notifications.NotificationResponse) => {
      if (!role) return;
      const data = response.notification.request.content.data as BookingPushTapPayload | undefined;
      if (!isChatTapPayload(data)) return;
      const id = response.notification.request.identifier;
      if (handledOpenRef.current === id) return;
      handledOpenRef.current = id;
      const senderId = String(data?.sender_id ?? '').trim();
      if (!senderId) return;
      const threadType = typeof data?.thread_type === 'string' ? data.thread_type.trim() : '';
      router.push({
        pathname: chatPathForRole(role),
        params: {
          uid: senderId,
          name: '',
          ...(threadType ? { threadType } : {}),
        },
      });
    },
    [role, router],
  );

  const navigateDriverBookingFromTap = useCallback(
    (response: Notifications.NotificationResponse) => {
      if (role !== 'driver') return;
      const data = response.notification.request.content.data as BookingPushTapPayload | undefined;
      if (!driverOpensBookingsNotificationTypes(data)) return;
      const id = response.notification.request.identifier;
      if (handledOpenRef.current === id) return;
      handledOpenRef.current = id;
      const bid = typeof data?.booking_id === 'string' ? data.booking_id.trim() : '';
      if (bid) {
        router.push({ pathname: '/(driver)/bookings', params: { bookingId: bid } });
      } else {
        router.push('/(driver)/bookings');
      }
    },
    [role, router],
  );

  const lastOpenedFromNotification = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!lastOpenedFromNotification) return;
    const data = lastOpenedFromNotification.notification.request.content.data as
      | BookingPushTapPayload
      | undefined;
    if (isChatTapPayload(data)) {
      navigateChatFromTap(lastOpenedFromNotification);
    } else if (role === 'driver') {
      navigateDriverBookingFromTap(lastOpenedFromNotification);
    }
  }, [lastOpenedFromNotification, role, navigateChatFromTap, navigateDriverBookingFromTap]);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      void (async () => {
        const { title, body } = notificationContentFromRequest(notification);
        const data = notification.request.content.data as BookingPushTapPayload | undefined;

        if (isChatTapPayload(data)) {
          const senderId = String(data.sender_id ?? '').trim();
          const threadType = typeof data.thread_type === 'string' ? data.thread_type.trim() : '';
          Alert.alert(title, body, [
            { text: t('common.close'), style: 'cancel' },
            {
              text: t('notifications.openChat'),
              onPress: () => {
                if (!role || !senderId) return;
                router.push({
                  pathname: chatPathForRole(role),
                  params: {
                    uid: senderId,
                    name: '',
                    ...(threadType ? { threadType } : {}),
                  },
                });
              },
            },
          ]);
          return;
        }

        if (data?.type === 'new_booking' && role === 'driver' && user?.id) {
          const matches = await driverProfileMatchesBooking(
            user.id,
            (data as { vehicle_type?: string }).vehicle_type ?? '',
            (data as { vehicle_class?: string }).vehicle_class ?? '',
          );
          if (!matches) return;
        }

        const isBooking =
          data?.type === 'new_booking' ||
          data?.type === 'booking_confirmed' ||
          data?.type === 'emergency_replacement' ||
          data?.type === 'booking_voucher' ||
          !data?.type;

        if (!isBooking) return;

        const buttons: { text: string; style?: 'cancel' | 'default'; onPress?: () => void }[] = [
          { text: t('common.close'), style: 'cancel' },
        ];
        if (role === 'driver') {
          buttons.push({
            text: t('notifications.viewBookings'),
            onPress: () => {
              const bid = typeof data?.booking_id === 'string' ? data.booking_id.trim() : '';
              if (bid) {
                router.push({ pathname: '/(driver)/bookings', params: { bookingId: bid } });
              } else {
                router.push('/(driver)/bookings');
              }
            },
          });
        }

        Alert.alert(title, body, buttons);
      })();
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as BookingPushTapPayload | undefined;
      if (isChatTapPayload(data)) {
        navigateChatFromTap(response);
      } else {
        navigateDriverBookingFromTap(response);
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [navigateChatFromTap, navigateDriverBookingFromTap, role, router, t, user?.id]);

  return null;
}
