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

function pickEnv(names) {
  for (const name of names) {
    const val = process.env[name]?.trim();
    if (val) return val;
  }
  return '';
}

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

const url = pickEnv(['EXPO_PUBLIC_SUPABASE_URL', ...ALIASES.EXPO_PUBLIC_SUPABASE_URL]);
const key = pickEnv(['EXPO_PUBLIC_SUPABASE_ANON_KEY', ...ALIASES.EXPO_PUBLIC_SUPABASE_ANON_KEY]);

if (!url || !key) {
  console.error('\nnormalize-expo-env: Missing Supabase credentials for production build.\n');
  console.error('Set these in Cloudflare Pages → Settings → Environment variables');
  console.error('(Production AND Preview — used during the build step):\n');
  console.error('  EXPO_PUBLIC_SUPABASE_URL');
  console.error('  EXPO_PUBLIC_SUPABASE_ANON_KEY\n');
  console.error('Accepted aliases (auto-mapped):');
  console.error('  SUPABASE_URL → EXPO_PUBLIC_SUPABASE_URL');
  console.error('  SUPABASE_ANON_KEY → EXPO_PUBLIC_SUPABASE_ANON_KEY\n');
  process.exit(1);
}

console.log('normalize-expo-env: OK (Supabase URL + anon key present)');
