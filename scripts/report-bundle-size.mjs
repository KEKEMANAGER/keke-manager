/**
 * Prints initial web JS size after `expo export -p web`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const distJs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', '_expo', 'static', 'js', 'web');

if (!fs.existsSync(distJs)) {
  console.error('No dist/_expo/static/js/web — run npm run build first');
  process.exit(1);
}

const files = fs.readdirSync(distJs).map((name) => {
  const full = path.join(distJs, name);
  return { name, bytes: fs.statSync(full).size };
});

const entry = files.find((f) => f.name.startsWith('entry-'));
const common = files.find((f) => f.name.startsWith('__common-'));
const runtime = files.find((f) => f.name.startsWith('__expo-metro-runtime-'));
const initial = [entry, common, runtime].filter(Boolean);
const initialBytes = initial.reduce((sum, f) => sum + f.bytes, 0);
const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);

const mb = (n) => `${(n / (1024 * 1024)).toFixed(2)} MB`;

console.log('Web bundle summary');
console.log(`  Initial (entry + common + runtime): ${mb(initialBytes)}`);
if (entry) console.log(`    entry: ${mb(entry.bytes)}`);
if (common) console.log(`    common: ${mb(common.bytes)}`);
console.log(`  All JS chunks: ${mb(totalBytes)} (${files.length} files)`);
