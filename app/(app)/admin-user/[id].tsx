import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdminUserDetailView } from '../../../components/admin/AdminUserDetailView';
import { COLORS } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useBackTo } from '../../../hooks/useBackTo';
import { adminPanelBackHref } from '../../../lib/adminNav';

export default function AdminUserDetailScreen() {
  const { id, adminTab } = useLocalSearchParams<{ id: string; adminTab?: string }>();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const userId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

  // Only the admin panel opens this screen, so back always returns there —
  // to the tab it came from, the users list by default.
  const tab = adminTab ?? 'users';
  const goBack = useBackTo(adminPanelBackHref(tab) ?? adminPanelBackHref('users'));

  useEffect(() => {
    if (loading) return;
    if (profile?.role !== 'admin') {
      router.replace('/(app)/dashboard');
    }
  }, [loading, profile?.role, router]);

  if (!userId || profile?.role !== 'admin') {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <AdminUserDetailView
        userId={userId}
        onClose={goBack}
        onOpenUser={(hostId) =>
          router.push({ pathname: '/(app)/admin-user/[id]', params: { id: hostId, adminTab: tab } })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
