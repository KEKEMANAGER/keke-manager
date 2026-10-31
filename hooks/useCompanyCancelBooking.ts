import { useCallback, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { cancelBookingByCompany, type BookingRow } from '../lib/bookings';
import { companyCancelRefusalKey } from '../lib/companyCancel';
import { getSupabaseErrorMessage } from '../lib/errorHandler';

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(message);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * The company's "cancel booking", the same on every screen that offers it:
 * one confirmation that says who will be told (a tap by mistake does nothing
 * until "Yes, cancel"), one request at a time, then the server's answer in
 * words. `onSettled` runs whenever the booking may have changed — cancelled,
 * or found already cancelled, finished or under way — so the screen reloads.
 */
export function useCompanyCancelBooking(onSettled?: (booking: BookingRow) => void) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // one cancellation at a time: from the first tap (while the question is
  // open) until the server has answered
  const busy = useRef(false);

  const requestCancel = useCallback(
    (booking: BookingRow, opts?: { reason?: string | null }) => {
      const userId = user?.id;
      if (!userId) {
        showMessage(t('common.error'), t('companyDashboard.sessionInactive'));
        return;
      }
      if (busy.current) return;

      const driverName = booking.driver_display_name?.trim() || t('company.driverDefault');
      const question = booking.is_group_master
        ? t('companyCancel.confirmConvoy')
        : booking.driver_id
          ? t('companyCancel.confirmWithDriver', { name: driverName })
          : t('companyDashboard.cancelConfirm');

      busy.current = true;
      const run = async () => {
        setCancellingId(booking.id);
        try {
          const res = await cancelBookingByCompany(booking.id, userId, opts?.reason);
          if (res.ok) {
            showMessage(
              t('companyCancel.title'),
              res.driverTold ? t('companyCancel.successDriverTold') : t('companyDashboard.cancelSuccess'),
            );
            onSettled?.(booking);
            return;
          }
          const key = companyCancelRefusalKey(res.code);
          showMessage(
            t('companyCancel.title'),
            key ? t(key) : res.error ? getSupabaseErrorMessage(res.error) : t('companyDashboard.cancelFailed'),
          );
          if (res.code !== 'failed') onSettled?.(booking);
        } finally {
          busy.current = false;
          setCancellingId(null);
        }
      };

      const release = () => {
        busy.current = false;
      };
      if (Platform.OS === 'web') {
        if (window.confirm(question)) void run();
        else release();
        return;
      }
      Alert.alert(
        t('companyCancel.title'),
        question,
        [
          { text: t('common.no'), style: 'cancel', onPress: release },
          { text: t('companyCancel.confirmButton'), style: 'destructive', onPress: () => void run() },
        ],
        { cancelable: true, onDismiss: release },
      );
    },
    [user?.id, t, onSettled],
  );

  return { cancellingId, requestCancel };
}
