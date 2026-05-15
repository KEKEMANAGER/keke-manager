import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { COLORS } from '../constants/theme';

import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  name: IoniconName;
  color: string;
  focused: boolean;
};

export function TabBarIcon({ name, color, focused }: Props) {
  return (
    <View style={styles.wrap}>
      {focused ? <View style={styles.activeBar} /> : null}
      <Ionicons name={name} size={26} color={color} />
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
  activeBar: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.gold,
  },
});
