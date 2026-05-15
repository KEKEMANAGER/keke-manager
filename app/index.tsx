import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../constants/theme';
import { getUserRole } from '../lib/role';

export default function Index() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (user) {
    const role = getUserRole(profile);
    if (!role) {
      return <Redirect href="/sign-up" />;
    }
    if (role === 'driver') {
      return <Redirect href="/(driver)/dashboard" />;
    }
    return <Redirect href="/(app)/dashboard" />;
  }

  return <Redirect href="/sign-in" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
