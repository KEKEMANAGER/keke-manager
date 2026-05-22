import Constants from 'expo-constants';

/**
 * Expo Go connection URL for dev QR screen.
 * Set EXPO_PUBLIC_EXPO_CONNECT_URL in .env from `npx expo start --tunnel` terminal output.
 */
export function getDevConnectUrlFromEnv(): string {
  const fromEnv = process.env.EXPO_PUBLIC_EXPO_CONNECT_URL?.trim() ?? '';
  if (fromEnv) return fromEnv;

  const extra = Constants.expoConfig?.extra as { expoConnectUrl?: string } | undefined;
  const fromExtra = extra?.expoConnectUrl?.trim() ?? '';
  if (fromExtra) return fromExtra;

  const hostUri = Constants.expoConfig?.hostUri?.trim() ?? '';
  if (hostUri) {
    if (hostUri.startsWith('exp://') || hostUri.startsWith('http')) return hostUri;
    return `exp://${hostUri}`;
  }

  return '';
}

export function normalizeExpoConnectUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('exp://') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `exp://${trimmed}`;
}
