import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Android Google Maps SDK requires an API key in the native manifest.
 * Without it, mounting react-native-maps MapView can hard-crash the process
 * ("keeps stopping") — which MapErrorBoundary cannot catch.
 */
export function getAndroidGoogleMapsApiKey(): string {
  const fromConfig = Constants.expoConfig?.android?.config?.googleMaps?.apiKey;
  if (typeof fromConfig === 'string' && fromConfig.trim()) {
    return fromConfig.trim();
  }
  const fromEnv =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    '';
  return fromEnv;
}

/** True when it is safe to mount a native Google MapView on this platform. */
export function canUseNativeGoogleMaps(): boolean {
  if (Platform.OS !== 'android') return true;
  return getAndroidGoogleMapsApiKey().length > 0;
}
