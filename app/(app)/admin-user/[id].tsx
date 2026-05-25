import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdminUserDetailView } from '../../../components/admin/AdminUserDetailView';
import { COLORS } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';

export default function AdminUserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const userId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

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
        onClose={() => router.back()}
        onOpenUser={(hostId) => router.push(`/(app)/admin-user/${hostId}`)}
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
