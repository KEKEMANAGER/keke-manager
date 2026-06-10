/**
 * Lists Supabase SQL migrations in apply order.
 * Compare with Supabase Dashboard → Database → Migrations.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

console.log(`Supabase migrations (${files.length} files):\n`);
for (const f of files) {
  console.log(`  ${f}`);
}
console.log('\nApply via: supabase db push  OR  paste into SQL editor');
console.log('Latest (verify on production):');
for (const f of files.slice(-3)) {
  console.log(`  → ${f}`);
}
