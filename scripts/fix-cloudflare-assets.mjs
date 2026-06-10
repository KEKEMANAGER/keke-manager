/**
 * Cloudflare Pages silently drops any folder named "node_modules" during deploy,
 * but Expo web export puts icon fonts in dist/assets/node_modules/@expo/vector-icons/...
 * (see https://github.com/cloudflare/workers-sdk/issues/3615).
 *
 * This script renames dist/assets/node_modules -> dist/assets/vendor and rewrites
 * all references inside the exported JS bundles and HTML files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const oldDir = path.join(dist, 'assets', 'node_modules');
const newDir = path.join(dist, 'assets', 'vendor');

if (!fs.existsSync(dist)) {
  console.error('fix-cloudflare-assets: dist/ not found, run expo export first');
  process.exit(1);
}

function moveDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      moveDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

let movedFiles = 0;
if (fs.existsSync(oldDir)) {
  moveDir(oldDir, newDir);
  movedFiles = fs.readdirSync(newDir, { recursive: true }).length;
  fs.rmSync(oldDir, { recursive: true, force: true });
  console.log(`fix-cloudflare-assets: moved assets/node_modules -> assets/vendor`);
} else {
  console.log('fix-cloudflare-assets: no dist/assets/node_modules found (nothing to move)');
}

// Rewrite references in JS bundles and HTML files.
const TEXT_EXTS = new Set(['.js', '.html', '.css', '.json', '.map']);
let patched = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!TEXT_EXTS.has(path.extname(entry.name))) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (!content.includes('assets/node_modules')) continue;
    fs.writeFileSync(full, content.replaceAll('assets/node_modules', 'assets/vendor'));
    patched += 1;
  }
}

walk(dist);
console.log(`fix-cloudflare-assets: patched ${patched} file(s) referencing assets/node_modules`);
