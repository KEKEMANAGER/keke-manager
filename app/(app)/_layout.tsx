import { Tabs, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppDrawer } from '../../components/layout/AppDrawer';
import { AppHeader } from '../../components/layout/AppHeader';
import { TabBarIcon } from '../../components/TabBarIcon';
import { APP_HEADER_BODY_HEIGHT, tabBarMinHeight, Z_INDEX } from '../../constants/layout';
import { COLORS, SPACING } from '../../constants/theme';
import { AuthScope } from '../../components/AuthScope';
import { AppMenuProvider } from '../../contexts/AppMenuContext';
import { useAuth } from '../../contexts/AuthContext';
import { notifyIncomingChatMessageLocally } from '../../lib/localNotifications';
import { subscribeToConversationList } from '../../lib/messages';
import { supabase } from '../../lib/supabase';
import { useChatUnreadCount } from '../../lib/useChatUnreadCount';

function CompanyTabs() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { user } = useAuth();
  const { tabBadge } = useChatUnreadCount(user?.id);
  const bottomPad = Math.max(insets.bottom, SPACING.sm);
  const tabMinH = tabBarMinHeight(bottomPad);
  const onChat = segments[segments.length - 1] === 'chat';
  const scenePadTop = onChat ? 0 : insets.top + APP_HEADER_BODY_HEIGHT + 8;

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

  return (
    <View style={styles.root}>
      <AppHeader />
      <Tabs
        initialRouteName="dashboard"
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
          <Tabs.Screen name="rate-booking" options={{ href: null }} />
          <Tabs.Screen name="admin-verify" options={{ href: null }} />
          <Tabs.Screen name="admin-panel" options={{ href: null }} />
          <Tabs.Screen name="admin-user/[id]" options={{ href: null }} />
          <Tabs.Screen
            name="chat"
            options={{
              href: null,
              tabBarStyle: { display: 'none' },
            }}
          />
          <Tabs.Screen name="history" options={{ href: null }} />
          <Tabs.Screen name="bookings" options={{ href: null }} />
          <Tabs.Screen name="drivers" options={{ href: null }} />
          <Tabs.Screen name="settings" options={{ href: null }} />
          <Tabs.Screen name="edit-booking/[id]" options={{ href: null }} />
          <Tabs.Screen name="company-voucher/[id]" options={{ href: null }} />
          <Tabs.Screen name="profile" options={{ href: null }} />
          <Tabs.Screen name="tracking" options={{ href: null }} />
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
                <TabBarIcon
                  name="chatbubbles-outline"
                  color={color}
                  focused={focused}
                  badge={tabBadge}
                />
              ),
            }}
          />
      </Tabs>
      <AppDrawer />
    </View>
  );
}

export default function CompanyTabsLayout() {
  return (
    <AuthScope>
      <AppMenuProvider>
        <CompanyTabs />
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
