/**
 * Maps Cloudflare / Supabase env names to EXPO_PUBLIC_* before Expo export.
 * Never fails the build — missing values fall back to empty strings.
 */
import { normalizeSupabaseBuildEnv } from './supabaseEnvBuild.mjs';

const { url, anonKey } = normalizeSupabaseBuildEnv();

if (!url || !anonKey) {
  console.warn(
    'normalize-expo-env: Supabase credentials not found in build env — continuing with empty fallbacks.',
  );
  console.warn(
    'Runtime uses window.__KEKE_ENV__ from app/+html.tsx and patch-web-html.mjs when vars are available.',
  );
} else {
  console.log('normalize-expo-env: OK (Supabase URL + anon key present)');
}
