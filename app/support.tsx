import { Redirect } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../constants/theme';
import { getUserRole } from '../lib/role';
import { resolveSupportAdminUserId } from '../lib/supportChat';
import { useEffect, useState } from 'react';

/**
 * Public entry for "Support chat" links (landing footer, emails).
 * Guests → sign-in; signed-in users → in-app support thread; admins → inbox.
 */
export default function SupportEntryScreen() {
  const { user, profile, loading } = useAuth();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (!user?.id || profile?.role === 'admin') {
      setResolving(false);
      return;
    }
    void (async () => {
      const id = await resolveSupportAdminUserId();
      setAdminId(id);
      setResolving(false);
    })();
  }, [user?.id, profile?.role]);

  if (loading || resolving) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  if (profile?.role === 'admin') {
    return <Redirect href="/(app)/admin-panel?tab=chats" />;
  }

  const role = getUserRole(profile);
  const chatPath = role === 'driver' ? '/(driver)/chat' : '/(app)/chat';

  if (!adminId) {
    return <Redirect href={role === 'driver' ? '/(driver)/settings' : '/(app)/settings'} />;
  }

  return (
    <Redirect
      href={{
        pathname: chatPath,
        params: {
          uid: adminId,
          name: 'KEKE Support',
          threadType: 'support',
        },
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
