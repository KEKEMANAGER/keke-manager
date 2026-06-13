import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CompanyBookingVoucherContent } from '../../../components/CompanyBookingVoucher';
import { COLORS, SPACING } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import type { CompanyVoucherData } from '../../../lib/companyVoucherData';
import { fetchCompanyVoucherData } from '../../../lib/companyVoucherData';

export default function CompanyVoucherScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = (id ?? '').trim();

  const [data, setData] = useState<CompanyVoucherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bookingId || !user?.id) {
      setError(t('companyVoucher.loadError'));
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchCompanyVoucherData(bookingId, user.id, user.id);
    setLoading(false);
    if (res.error || !res.data) {
      setError(res.error?.message ?? t('companyVoucher.loadError'));
      setData(null);
      return;
    }
    setData(res.data);
    setError(null);
  }, [bookingId, user?.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.nav}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.navTitle}>{t('companyVoucher.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: 48 }} />
      ) : data ? (
        <CompanyBookingVoucherContent
          data={data}
          onClose={() => router.back()}
          showClose={false}
        />
      ) : (
        <Text style={styles.error}>{error ?? t('companyVoucher.loadError')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  navTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  error: { padding: SPACING.lg, textAlign: 'center', color: COLORS.textSecondary },
});
