/**
 * Fail the build if dist/index.html references JS/CSS files that are missing from dist/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const indexPath = path.join(distDir, 'index.html');

function collectRefs(html) {
  const refs = new Set();
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/gi)) refs.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+href="([^"]+\.(?:css|js))"/gi)) refs.add(m[1]);
  return [...refs];
}

function main() {
  if (!fs.existsSync(indexPath)) {
    console.error('verify-dist-assets: dist/index.html missing');
    process.exit(1);
  }

  const html = fs.readFileSync(indexPath, 'utf8');
  const refs = collectRefs(html);
  const missing = [];

  for (const ref of refs) {
    if (!ref.startsWith('/')) continue;
    const local = path.join(distDir, ref.replace(/^\//, '').split('/').join(path.sep));
    if (!fs.existsSync(local)) missing.push(ref);
  }

  const entry = refs.find((r) => r.includes('entry-'));
  if (!entry) {
    console.error('verify-dist-assets: no entry-*.js script in dist/index.html');
    process.exit(1);
  }

  const entryLocal = path.join(distDir, entry.replace(/^\//, '').split('/').join(path.sep));
  const entrySize = fs.statSync(entryLocal).size;
  if (entrySize < 100_000) {
    console.error(`verify-dist-assets: entry bundle suspiciously small (${entrySize} bytes)`);
    process.exit(1);
  }

  if (missing.length) {
    console.error('verify-dist-assets: missing files referenced by index.html:');
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  console.log(`verify-dist-assets: OK (${entry}, ${(entrySize / (1024 * 1024)).toFixed(2)} MB)`);
}

main();
