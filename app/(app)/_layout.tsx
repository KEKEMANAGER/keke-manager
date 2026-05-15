import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBarIcon } from '../../components/TabBarIcon';
import { COLORS, SPACING } from '../../constants/theme';

export default function CompanyTabsLayout() {
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
            title: 'დაშბორდი',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="grid-outline" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="new-booking"
          options={{
            title: 'ჯავშანი',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="add-circle-outline" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'ისტორია',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name="time-outline" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen name="rate-booking" options={{ href: null, title: 'შეფასება' }} />
        <Tabs.Screen name="admin-verify" options={{ href: null, title: 'ადმინი' }} />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'პროფილი',
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
