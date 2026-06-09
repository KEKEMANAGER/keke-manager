/**
 * Apply a single Supabase migration SQL file to the hosted database.
 *
 * Requires in .env (or environment):
 *   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_DB_PASSWORD=<database password from Dashboard → Settings → Database>
 *
 * Usage:
 *   node scripts/apply-supabase-migration.mjs
 *   node scripts/apply-supabase-migration.mjs supabase/migrations/20260630250000_pre_submission_hardening.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function projectRefFromUrl(url) {
  const m = String(url).match(/https?:\/\/([^.]+)\.supabase\.co/i);
  return m?.[1] ?? null;
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const password = process.env.SUPABASE_DB_PASSWORD?.trim() ?? '';
  const ref = projectRefFromUrl(supabaseUrl);

  if (!ref) {
    console.error('Missing or invalid EXPO_PUBLIC_SUPABASE_URL in .env');
    process.exit(1);
  }
  if (!password) {
    console.error(
      'Missing SUPABASE_DB_PASSWORD. Add it to .env (Supabase Dashboard → Project Settings → Database → password).',
    );
    process.exit(1);
  }

  const rel = process.argv[2] ?? 'supabase/migrations/20260630250000_pre_submission_hardening.sql';
  const sqlPath = path.isAbsolute(rel) ? rel : path.join(root, rel);
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found:', sqlPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const host = `db.${ref}.supabase.co`;
  const connectionString = `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/postgres`;

  console.log(`Applying ${path.basename(sqlPath)} to ${host} ...`);

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(sql);
    const { rows } = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'create_user_notifications'
       ) AS ok`,
    );
    console.log('Migration applied successfully.');
    console.log('create_user_notifications exists:', rows[0]?.ok === true);
  } catch (err) {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
