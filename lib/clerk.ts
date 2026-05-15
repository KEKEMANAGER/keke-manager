import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const publishableKey =
  (Constants.expoConfig?.extra as { clerkPublishableKey?: string } | undefined)
    ?.clerkPublishableKey ||
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  '';

export const tokenCache = {
  async getToken(key: string) {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // ignore
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
};
