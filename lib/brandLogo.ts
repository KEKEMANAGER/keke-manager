import { Platform } from 'react-native';

/** Web uses compressed WebP; native keeps PNG for broad compatibility. */
export const BRAND_LOGO = Platform.select({
  web: require('../assets/images/logo.webp'),
  default: require('../assets/images/logo.png'),
}) as number;
