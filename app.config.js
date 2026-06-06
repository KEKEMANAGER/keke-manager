const fs = require('fs');
const path = require('path');

/**
 * Ensure .env is applied before reading EXPO_PUBLIC_* for `extra`.
 * Expo may evaluate this file before other env wiring runs.
 */
function readEnvText(envPath) {
  const buf = fs.readFileSync(envPath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf8');
  }
  // UTF-16 LE without BOM (common on Windows): ASCII pairs with 0 high byte
  const looksUtf16LeAscii =
    buf.length >= 8 &&
    buf[1] === 0 &&
    buf[3] === 0 &&
    buf[5] === 0 &&
    buf[7] === 0;
  if (looksUtf16LeAscii) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of readEnvText(envPath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile();

function normalizeSupabaseEnv() {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_URL?.trim()) {
    process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL.trim();
  }
  if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() && process.env.SUPABASE_ANON_KEY?.trim()) {
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY.trim();
  }
}

normalizeSupabaseEnv();

const appJson = require('./app.json');

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    scheme: appJson.expo.scheme ?? 'kekemanager',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    ios: {
      ...(appJson.expo.ios ?? {}),
      supportsTablet: true,
    },
    android: {
      ...(appJson.expo.android ?? {}),
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FFFFFF',
      },
    },
    plugins: [
      ...(appJson.expo.plugins ?? []).filter(
        (p) => p !== 'expo-notifications' && !(Array.isArray(p) && p[0] === 'expo-notifications'),
      ),
      [
        'expo-notifications',
        {
          defaultChannel: 'bookings',
          enableBackgroundRemoteNotifications: true,
        },
      ],
    ],
    extra: {
      ...(appJson.expo.extra ?? {}),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '',
      expoConnectUrl: process.env.EXPO_PUBLIC_EXPO_CONNECT_URL?.trim() || '',
      eas: {
        ...(appJson.expo.extra?.eas ?? {}),
        projectId:
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
          appJson.expo.extra?.eas?.projectId ||
          '42888595-a62e-427b-9446-680bf289be23',
      },
    },
  },
};
