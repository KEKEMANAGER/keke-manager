import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBarIcon } from '../../components/TabBarIcon';
import { COLORS, SPACING } from '../../constants/theme';

export default function CompanyTabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, SPACING.sm);

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
        <Tabs.Screen name="index" options={{ href: null }} />
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
          name="history"
          options={{
            title: t('tabs.history'),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="time-outline" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen name="rate-booking" options={{ href: null, title: t('common.rating') }} />
        <Tabs.Screen name="admin-verify" options={{ href: null, title: t('common.admin') }} />
        <Tabs.Screen name="chat" options={{ href: null, title: t('tabs.chat') }} />
        <Tabs.Screen
          name="chat-list"
          options={{
            title: t('tabs.chat'),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="chatbubbles-outline" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="business-outline" color={color} focused={focused} />
            ),
          }}
        />
      </Tabs>
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
});
