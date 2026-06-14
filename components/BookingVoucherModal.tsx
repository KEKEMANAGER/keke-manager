import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { COLORS, SHADOWS, SPACING } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import type { BookingRow } from '../lib/bookings';
import type { CompanyVoucherData } from '../lib/companyVoucherData';
import { fetchCompanyVoucherData } from '../lib/companyVoucherData';
import { CompanyBookingVoucherContent } from './CompanyBookingVoucher';

type Props = {
  booking: BookingRow | null;
  visible: boolean;
  onClose: () => void;
};

export function BookingVoucherModal({ booking, visible, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CompanyVoucherData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !booking) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchCompanyVoucherData(booking.id, undefined, user?.id).then(({ data: loaded, error }) => {
      if (cancelled) return;
      setData(
        loaded ?? {
          booking,
          driver: null,
          vehicle: null,
          host: null,
          company: null,
        },
      );
      setLoading(false);
      if (__DEV__ && error) {
        console.warn('[BookingVoucherModal]', error.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, booking?.id, user?.id]);

  if (!booking) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            SHADOWS.card,
            {
              marginTop: insets.top + SPACING.md,
              marginBottom: Math.max(insets.bottom, SPACING.md),
              maxWidth: Platform.OS === 'web' ? 520 : undefined,
              alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
              width: Platform.OS === 'web' ? '92%' : undefined,
              flex: 1,
              maxHeight: '92%',
            },
          ]}
        >
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.gold} />
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          ) : data ? (
            <CompanyBookingVoucherContent
              data={data}
              onClose={onClose}
              showClose
              allowTouristTab={false}
            />
          ) : (
            <View style={styles.loadingBox}>
              <Text style={styles.loadingText}>{t('system.errorTitle')}</Text>
              <Pressable onPress={onClose} style={styles.closeFallback}>
                <Text style={styles.closeFallbackText}>{t('common.close')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: SPACING.sm,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  closeFallback: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceAlt,
  },
  closeFallbackText: {
    fontWeight: '700',
    color: COLORS.text,
  },
});
