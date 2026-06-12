import { Tabs, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppDrawer } from '../../components/layout/AppDrawer';
import { AppHeader } from '../../components/layout/AppHeader';
import { ChatTabBarIcon } from '../../components/ChatTabBarIcon';
import { TabBarIcon } from '../../components/TabBarIcon';
import { APP_HEADER_BODY_HEIGHT, tabBarMinHeight, Z_INDEX } from '../../constants/layout';
import { COLORS, SPACING } from '../../constants/theme';
import { AuthScope } from '../../components/AuthScope';
import { DriverVerificationGuard } from '../../components/driver/DriverVerificationGuard';
import { AppMenuProvider } from '../../contexts/AppMenuContext';
import { ChatUnreadProvider } from '../../contexts/ChatUnreadContext';
import { useAuth } from '../../contexts/AuthContext';
import { notifyIncomingChatMessageLocally } from '../../lib/localNotifications';
import { subscribeToConversationList } from '../../lib/messages';
import { supabase } from '../../lib/supabase';
import { ensureWebNotificationPermission } from '../../lib/webChatAlerts';

function DriverTabsInner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { user } = useAuth();
  const bottomPad = Math.max(insets.bottom, SPACING.sm);
  const tabMinH = tabBarMinHeight(bottomPad);
  const onChat = segments[segments.length - 1] === 'chat';
  const scenePadTop = onChat ? 0 : insets.top + APP_HEADER_BODY_HEIGHT + 8;

  useEffect(() => {
    if (Platform.OS === 'web') {
      void ensureWebNotificationPermission();
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const channel = subscribeToConversationList(user.id, (msg) => {
      if (msg && msg.sender_id !== user.id) {
        void notifyIncomingChatMessageLocally({
          senderUserId: msg.sender_id,
          text: msg.text,
          threadType: msg.thread_type,
        });
      }
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <View style={styles.root}>
      <AppHeader />
      <Tabs
        initialRouteName="bookings"
        screenOptions={{
          headerShown: false,
          sceneStyle: { paddingTop: scenePadTop },
          tabBarStyle: {
            backgroundColor: COLORS.white,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
            paddingTop: SPACING.xs,
            paddingBottom: bottomPad,
            minHeight: tabMinH,
            ...(Platform.OS === 'web'
              ? { position: 'relative' as const, zIndex: Z_INDEX.tabBar, width: '100%' as const }
              : {}),
          },
          tabBarActiveTintColor: COLORS.gold,
          tabBarInactiveTintColor: COLORS.textSecondary,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
        }}
      >
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen
          name="chat"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen name="dashboard" options={{ href: null }} />
        <Tabs.Screen name="vehicle" options={{ href: null }} />
        <Tabs.Screen name="vehicles" options={{ href: null }} />
        <Tabs.Screen name="verification" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="fleet" options={{ href: null }} />
        <Tabs.Screen name="hired-drivers" options={{ href: null }} />
        <Tabs.Screen name="fleet-map" options={{ href: null }} />
        <Tabs.Screen name="find-drivers" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="ratings" options={{ href: null }} />
        <Tabs.Screen name="my-host" options={{ href: null }} />
        <Tabs.Screen name="assigned-vehicle" options={{ href: null }} />

        <Tabs.Screen
          name="bookings"
          options={{
            title: t('tabs.bookings'),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="calendar-outline" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="gps"
          options={{
            title: t('tabs.gps'),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="navigate-outline" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat-list"
          options={{
            title: t('tabs.chat'),
            tabBarIcon: ({ color, focused }) => (
              <ChatTabBarIcon color={color} focused={focused} />
            ),
          }}
        />
      </Tabs>
      <AppDrawer />
    </View>
  );
}

function DriverTabs() {
  const { user } = useAuth();
  return (
    <ChatUnreadProvider userId={user?.id}>
      <DriverTabsInner />
    </ChatUnreadProvider>
  );
}

export default function DriverTabsLayout() {
  return (
    <AuthScope>
      <AppMenuProvider>
        <DriverVerificationGuard>
          <DriverTabs />
        </DriverVerificationGuard>
      </AppMenuProvider>
    </AuthScope>
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
});
