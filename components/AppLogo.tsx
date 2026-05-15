import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

const logoSource = require('../assets/logo.png.png');

type AppLogoSize = 'auth' | 'header';

type Props = {
  size?: AppLogoSize;
  style?: StyleProp<ImageStyle>;
};

export function AppLogo({ size = 'auth', style }: Props) {
  const dimensions = size === 'auth' ? styles.auth : styles.header;
  return <Image source={logoSource} style={[dimensions, style]} resizeMode="contain" accessibilityLabel="KEKE MANAGER" />;
}

const styles = StyleSheet.create({
  auth: {
    width: 120,
    height: 48,
    alignSelf: 'center',
  },
  header: {
    width: 40,
    height: 40,
  },
});
