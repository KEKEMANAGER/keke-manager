import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBarIcon } from '../../components/TabBarIcon';
import { COLORS, SPACING } from '../../constants/theme';

export default function DriverTabsLayout() {
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
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null, title: t('tabs.chat') }} />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="home-outline" color={color} focused={focused} />
          ),
        }}
      />
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
        name="vehicle"
        options={{
          title: t('tabs.vehicle'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="car-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="verification"
        options={{
          title: t('tabs.verification'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="shield-checkmark-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="person-outline" color={color} focused={focused} />
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
      <Tabs.Screen
        name="gps"
        options={{
          title: t('tabs.gps'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="navigate-outline" color={color} focused={focused} />
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
