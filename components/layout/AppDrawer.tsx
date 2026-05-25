import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DRAWER_WIDTH, Z_INDEX } from '../../constants/layout';
import { COLORS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useAppMenu } from '../../contexts/AppMenuContext';
function nameInitials(name: string | null | undefined): string {
  if (!name?.trim()) return '?';
  return name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

type DrawerIcon = React.ComponentProps<typeof Ionicons>['name'];

type DrawerMenuItem =
  | { divider: true }
  | {
      icon: DrawerIcon;
      label: string;
      route?: string;
      action?: () => void;
      danger?: boolean;
    };

function DrawerItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: DrawerIcon;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
    >
      <Ionicons name={icon} size={20} color={danger ? COLORS.error : COLORS.text} />
      <Text style={[styles.drawerItemLabel, danger && styles.drawerItemDanger]}>{label}</Text>
    </Pressable>
  );
}

export function AppDrawer() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, menuRole, isHost, signOut } = useAuth();
  const { drawerVisible, drawerAnim, backdropAnim, closeDrawer } = useAppMenu();

  const displayName = profile?.full_name?.trim() || user?.email?.split('@')[0] || '';
  const email = user?.email || '';
  const isAdmin = profile?.role === 'admin';

  function navigate(path: string) {
    closeDrawer(() => router.push(path as never));
  }

  const menuItems = useMemo((): DrawerMenuItem[] => {
    const logoutItem: DrawerMenuItem = {
      icon: 'log-out-outline',
      label: t('common.logout'),
      action: () => closeDrawer(() => void signOut()),
      danger: true,
    };
    if (menuRole === 'company') {
      return [
        { icon: 'home-outline', label: t('menu.dashboard'), route: '/(app)/dashboard' },
        { icon: 'people-outline', label: t('menu.drivers'), route: '/(app)/drivers' },
        { icon: 'calendar-outline', label: t('menu.bookings'), route: '/(app)/bookings' },
        { icon: 'chatbubbles-outline', label: t('menu.chats'), route: '/(app)/chat-list' },
        { icon: 'business-outline', label: t('menu.companyProfile'), route: '/(app)/profile' },
        ...(isAdmin
          ? [{ icon: 'shield-checkmark-outline' as DrawerIcon, label: t('adminPanel.drawerLabel'), route: '/(app)/admin-panel' }]
          : []),
        { divider: true },
        { icon: 'settings-outline', label: t('menu.settings'), route: '/(app)/settings' },
        logoutItem,
      ];
    }

    if (menuRole === 'freelance_driver') {
      return [
        { icon: 'home-outline', label: t('menu.dashboard'), route: '/(driver)/dashboard' },
        {
          icon: 'car-outline',
          label: isHost ? t('tabs.fleet') : t('tabs.vehicle'),
          route: '/(driver)/vehicles',
        },
        ...(isHost
          ? [
              { icon: 'people-outline' as DrawerIcon, label: t('menu.myDrivers'), route: '/(driver)/hired-drivers' },
              { icon: 'search-outline' as DrawerIcon, label: t('tabs.findDrivers'), route: '/(driver)/find-drivers' },
            ]
          : []),
        { icon: 'calendar-outline', label: t('menu.myBookings'), route: '/(driver)/bookings' },
        { icon: 'chatbubbles-outline', label: t('menu.chats'), route: '/(driver)/chat-list' },
        { icon: 'person-outline', label: t('menu.myProfile'), route: '/(driver)/profile' },
        { icon: 'star-outline', label: t('menu.ratings'), route: '/(driver)/ratings' },
        { divider: true },
        { icon: 'settings-outline', label: t('menu.settings'), route: '/(driver)/settings' },
        logoutItem,
      ];
    }

    if (menuRole === 'hired_driver') {
      return [
        { icon: 'home-outline', label: t('menu.dashboard'), route: '/(driver)/dashboard' },
        { icon: 'hand-left-outline', label: t('menu.myHost'), route: '/(driver)/my-host' },
        { icon: 'car-outline', label: t('menu.assignedVehicle'), route: '/(driver)/assigned-vehicle' },
        { icon: 'calendar-outline', label: t('menu.myBookings'), route: '/(driver)/bookings' },
        { icon: 'chatbubbles-outline', label: t('menu.chats'), route: '/(driver)/chat-list' },
        { icon: 'person-outline', label: t('menu.myProfile'), route: '/(driver)/profile' },
        { icon: 'star-outline', label: t('menu.ratings'), route: '/(driver)/ratings' },
        { divider: true },
        { icon: 'settings-outline', label: t('menu.settings'), route: '/(driver)/settings' },
        logoutItem,
      ];
    }

    return [logoutItem];
  }, [menuRole, isHost, isAdmin, t, signOut, closeDrawer]);

  if (!drawerVisible) return null;

  return (
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
          {menuItems.map((item, idx) => {
            if ('divider' in item) {
              return <View key={`div-${idx}`} style={styles.divider} />;
            }
            return (
              <DrawerItem
                key={`${item.label}-${idx}`}
                icon={item.icon}
                label={item.label}
                danger={item.danger}
                onPress={() => {
                  if (item.action) {
                    item.action();
                  } else if (item.route) {
                    navigate(item.route);
                  }
                }}
              />
            );
          })}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
    zIndex: Z_INDEX.dropdown,
  },
  drawer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    zIndex: Z_INDEX.dropdown + 1,
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
  drawerItemDanger: {
    color: COLORS.error,
  },
});
