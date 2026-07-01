/**
 * Full admin panel: users, verification, chats, bookings, GPS, statistics.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AdminBookingsSection } from '../../components/admin/AdminBookingsSection';
import { AdminChatsSection } from '../../components/admin/AdminChatsSection';
import { AdminGpsSection } from '../../components/admin/AdminGpsSection';
import { AdminStatsSection } from '../../components/admin/AdminStatsSection';
import { AdminAdsSection } from '../../components/admin/AdminAdsSection';
import { AdminTabBar, type AdminTabId } from '../../components/admin/AdminTabBar';
import { AdminUsersSection } from '../../components/admin/AdminUsersSection';
import { AdminVerifyPanel } from '../../components/admin/AdminVerifyPanel';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useChatUnreadCount } from '../../lib/useChatUnreadCount';
import { useAndroidRouterBack } from '../../hooks/useAndroidRouterBack';

function AdminSearchInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search-outline" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search by name or email"
        placeholderTextColor={COLORS.gray}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const TAB_IDS: AdminTabId[] = ['users', 'verify', 'chats', 'bookings', 'gps', 'stats', 'ads'];

function parseTab(raw: string | string[] | undefined): AdminTabId {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && TAB_IDS.includes(v as AdminTabId)) return v as AdminTabId;
  return 'users';
}

export default function AdminPanelScreen() {
  const { t } = useTranslation();
  const { profile, loading: authLoading, user } = useAuth();
  const { tabBadge: chatTabBadge } = useChatUnreadCount(user?.id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const admin = profile?.role === 'admin';

  const [tab, setTab] = useState<AdminTabId>(() => parseTab(params.tab));
  const [searchQuery, setSearchQuery] = useState('');

  useAndroidRouterBack(!authLoading);

  useEffect(() => {
    setTab(parseTab(params.tab));
  }, [params.tab]);

  useEffect(() => {
    setSearchQuery('');
  }, [tab]);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) router.replace('/(app)/profile');
  }, [authLoading, admin, router]);

  const tabs = useMemo(
    () => [
      { id: 'users' as const, label: t('adminPanel.tabUsers') },
      { id: 'verify' as const, label: t('adminPanel.tabVerify') },
      { id: 'chats' as const, label: t('adminPanel.tabChats'), badge: chatTabBadge },
      { id: 'bookings' as const, label: t('adminPanel.tabBookings') },
      { id: 'gps' as const, label: t('adminPanel.tabGps') },
      { id: 'stats' as const, label: t('adminPanel.tabStats') },
      { id: 'ads' as const, label: '📢 რეკლამა' },
    ],
    [t, chatTabBadge],
  );

  if (authLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + SPACING.xl }]}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (!admin) {
    return (
      <View
        style={[
          styles.center,
          { paddingTop: insets.top + SPACING.xl, paddingHorizontal: SPACING.lg },
        ]}
      >
        <Text style={styles.forbidden}>{t('adminVerify.forbidden')}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.inner,
        { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
      ]}
      keyboardShouldPersistTaps="always"
      nestedScrollEnabled
    >
      <Pressable onPress={() => router.back()} style={styles.backLink}>
        <Text style={styles.backLinkText}>← {t('common.back')}</Text>
      </Pressable>
      <Text style={styles.title}>{t('adminPanel.title')}</Text>
      <Text style={styles.subtitle}>{t('adminPanel.subtitle')}</Text>

      <AdminTabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'users' ? (
        <>
          <AdminSearchInput value={searchQuery} onChangeText={setSearchQuery} />
          <AdminUsersSection searchQuery={searchQuery} />
        </>
      ) : null}
      {tab === 'verify' ? <AdminVerifyPanel /> : null}
      {tab === 'chats' ? <AdminChatsSection /> : null}
      {tab === 'bookings' ? <AdminBookingsSection /> : null}
      {tab === 'gps' ? <AdminGpsSection /> : null}
      {tab === 'stats' ? <AdminStatsSection /> : null}
      {tab === 'ads' ? <AdminAdsSection /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  inner: { paddingHorizontal: SPACING.lg },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forbidden: {
    color: COLORS.error,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBtnText: { color: COLORS.gold, fontWeight: '700' },
  backLink: { alignSelf: 'flex-start', marginBottom: SPACING.sm },
  backLinkText: { color: COLORS.gold, fontSize: 15, fontWeight: '600' },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
});
