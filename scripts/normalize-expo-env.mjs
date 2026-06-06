/**
 * Maps common Cloudflare / Supabase env names to EXPO_PUBLIC_* before Expo export.
 * Expo only inlines EXPO_PUBLIC_* into the web bundle at build time.
 */
const ALIASES = {
  EXPO_PUBLIC_SUPABASE_URL: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL'],
  EXPO_PUBLIC_SUPABASE_ANON_KEY: [
    'SUPABASE_ANON_KEY',
    'SUPABASE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_ANON_KEY',
  ],
};

function normalizeExpoEnv() {
  for (const [target, aliases] of Object.entries(ALIASES)) {
    if (process.env[target]?.trim()) continue;
    for (const alias of aliases) {
      const val = process.env[alias]?.trim();
      if (val) {
        process.env[target] = val;
        console.log(`normalize-expo-env: ${alias} → ${target}`);
        break;
      }
    }
  }
}

normalizeExpoEnv();

if (!process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) {
  process.env.EXPO_PUBLIC_SUPABASE_URL = '';
}
if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim();

if (!url || !key) {
  console.warn(
    'normalize-expo-env: Supabase credentials not found in build env — continuing with empty fallbacks.',
  );
  console.warn(
    'Web runtime will use window.__KEKE_ENV__ (injected by patch-web-html.mjs when vars are available).',
  );
} else {
  console.log('normalize-expo-env: OK (Supabase URL + anon key present)');
}
