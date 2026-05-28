import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { sx } from '../lib/sx';

import { BRAND_LOGO } from '../lib/brandLogo';

type AppLogoSize = 'auth' | 'header';

type Props = {
  size?: AppLogoSize;
  style?: StyleProp<ImageStyle>;
};

export function AppLogo({ size = 'auth', style }: Props) {
  const dimensions = size === 'auth' ? styles.auth : styles.header;
  return (
    <Image
      source={BRAND_LOGO}
      style={sx(dimensions, style)}
      resizeMode="contain"
      accessibilityLabel="KEKE MANAGER"
    />
  );
}

const styles = StyleSheet.create({
  auth: {
    width: 150,
    height: 150,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
});
