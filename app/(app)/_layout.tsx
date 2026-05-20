import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TabBarIcon } from '../../components/TabBarIcon';
import { COLORS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { notifyIncomingChatMessageLocally } from '../../lib/localNotifications';
import { subscribeToConversationList } from '../../lib/messages';
import { supabase } from '../../lib/supabase';

const DRAWER_WIDTH = 280;

function nameInitials(name: string | null | undefined): string {
  if (!name?.trim()) return '?';
  return name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function DrawerItem({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
    >
      <Ionicons name={icon} size={20} color={COLORS.text} />
      <Text style={styles.drawerItemLabel}>{label}</Text>
    </Pressable>
  );
}

export default function CompanyTabsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const bottomPad = Math.max(insets.bottom, SPACING.sm);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user?.id) return;
    const channel = subscribeToConversationList(user.id, (msg) => {
      if (msg && msg.sender_id !== user.id) {
        void notifyIncomingChatMessageLocally({
          senderUserId: msg.sender_id,
          text: msg.text,
        });
      }
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  function openDrawer() {
    setDrawerVisible(true);
    Animated.parallel([
      Animated.timing(drawerAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }

  function closeDrawer(cb?: () => void) {
    Animated.parallel([
      Animated.timing(drawerAnim, { toValue: DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setDrawerVisible(false);
      cb?.();
    });
  }

  function navigate(path: string) {
    closeDrawer(() => router.push(path as never));
  }

  const displayName = profile?.full_name?.trim() || user?.email?.split('@')[0] || '';
  const email = user?.email || '';

  return (
    <View style={styles.root}>
      <Tabs
        initialRouteName="dashboard"
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.white,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
            paddingTop: SPACING.xs,
            paddingBottom: bottomPad,
            minHeight: Platform.OS === 'web' ? 72 + bottomPad : 64 + bottomPad,
            ...(Platform.OS === 'web'
              ? { position: 'relative' as const, zIndex: 20, width: '100%' as const }
              : {}),
          },
          tabBarActiveTintColor: COLORS.gold,
          tabBarInactiveTintColor: COLORS.textSecondary,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
        }}
      >
        <Tabs.Screen name="index"        options={{ href: null }} />
        <Tabs.Screen name="rate-booking" options={{ href: null }} />
        <Tabs.Screen name="admin-verify" options={{ href: null }} />
        <Tabs.Screen name="admin-panel" options={{ href: null }} />
        <Tabs.Screen name="chat"         options={{ href: null }} />
        <Tabs.Screen name="history"      options={{ href: null }} />
        <Tabs.Screen name="profile"      options={{ href: null }} />
        <Tabs.Screen name="tracking"       options={{ href: null }} />
        <Tabs.Screen name="admin-tracking" options={{ href: null }} />

        <Tabs.Screen
          name="dashboard"
          options={{
            title: t('tabs.dashboard'),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="grid-outline" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="new-booking"
          options={{
            title: t('tabs.booking'),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="add-circle-outline" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat-list"
          options={{
            title: t('tabs.chat'),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="chatbubbles-outline" color={color} focused={focused} />
            ),
          }}
        />
      </Tabs>

      {/* Hamburger button */}
      <Pressable
        onPress={openDrawer}
        hitSlop={8}
        style={[styles.menuBtn, { top: insets.top + 10 }]}
      >
        <Ionicons name="menu-outline" size={22} color={COLORS.text} />
      </Pressable>

      {/* Drawer */}
      {drawerVisible ? (
        <>
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => closeDrawer()} />
          </Animated.View>

          <Animated.View
            style={[
              styles.drawer,
              {
                paddingTop: insets.top + SPACING.xl,
                paddingBottom: insets.bottom + SPACING.lg,
                transform: [{ translateX: drawerAnim }],
              },
            ]}
          >
            {/* User info */}
            <View style={styles.drawerUser}>
              <View style={styles.drawerAvatar}>
                <Text style={styles.drawerAvatarText}>{nameInitials(displayName)}</Text>
              </View>
              <View style={styles.drawerUserText}>
                <Text style={styles.drawerUserName} numberOfLines={1}>
                  {displayName || '—'}
                </Text>
                <Text style={styles.drawerUserEmail} numberOfLines={1}>
                  {email}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.drawerItems}>
              <DrawerItem
                icon="time-outline"
                label={t('tabs.history')}
                onPress={() => navigate('/(app)/history')}
              />
              <DrawerItem
                icon="business-outline"
                label={t('tabs.profile')}
                onPress={() => navigate('/(app)/profile')}
              />
              {profile?.role === 'admin' ? (
                <DrawerItem
                  icon="shield-checkmark-outline"
                  label={t('adminPanel.drawerLabel')}
                  onPress={() => navigate('/(app)/admin-panel')}
                />
              ) : null}
            </View>

            <View style={{ flex: 1 }} />
            <View style={styles.divider} />

            <Pressable
              onPress={() => closeDrawer(() => void signOut())}
              style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}
            >
              <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
              <Text style={styles.logoutText}>{t('common.logout')}</Text>
            </Pressable>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    width: '100%',
    ...(Platform.OS === 'web' ? { minHeight: '100%' as const } : {}),
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabItem: {
    paddingBottom: SPACING.xs,
  },
  menuBtn: {
    position: 'absolute',
    right: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
    zIndex: 200,
  },
  drawer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    zIndex: 300,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: -6, height: 0 },
    elevation: 16,
  },
  drawerUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  drawerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  drawerAvatarText: {
    color: '#0f0f0f',
    fontWeight: '800',
    fontSize: 16,
  },
  drawerUserText: {
    flex: 1,
  },
  drawerUserName: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 15,
  },
  drawerUserEmail: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  drawerItems: {
    gap: SPACING.xs,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 11,
    paddingHorizontal: SPACING.sm,
    borderRadius: 10,
  },
  drawerItemPressed: {
    backgroundColor: COLORS.surfaceAlt,
  },
  drawerItemLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 11,
    paddingHorizontal: SPACING.sm,
    borderRadius: 10,
  },
  logoutBtnPressed: {
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  logoutText: {
    color: COLORS.error,
    fontSize: 15,
    fontWeight: '600',
  },
});
