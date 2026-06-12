import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';

import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  name: IoniconName;
  color: string;
  focused: boolean;
  /** Unread count overlay (web + native; tabBarBadge alone is unreliable on web). */
  badge?: string | number;
};

export function TabBarIcon({ name, color, focused, badge }: Props) {
  const showBadge = badge !== undefined && badge !== null && badge !== '';

  return (
    <View style={styles.wrap}>
      {focused ? <View style={styles.activeBar} /> : null}
      <View style={styles.iconBox}>
        <Ionicons name={name} size={26} color={color} />
        {showBadge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    minHeight: 32,
  },
  iconBox: {
    position: 'relative',
    width: 30,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBar: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.gold,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  badgeText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
