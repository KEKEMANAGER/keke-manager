/**
 * Syncs public/ into dist/ after expo export so static assets (llms.txt, robots, blog, etc.)
 * are always present for Cloudflare Pages — not only what Metro copies by default.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

/** Always copied explicitly (fail build if missing). */
const REQUIRED_FILES = ['logo.webp', 'og-image.jpg', 'llms.txt', 'llms-full.txt', '_redirects', '_headers', '_routes.json', 'asset-not-found.html'];

if (!fs.existsSync(distDir)) {
  console.log('copy-public: dist/ missing, skipping');
  process.exit(0);
}

if (!fs.existsSync(publicDir)) {
  console.error('copy-public: public/ missing');
  process.exit(1);
}

function copyFile(name, required = false) {
  const src = path.join(publicDir, name);
  const dest = path.join(distDir, name);
  if (!fs.existsSync(src)) {
    if (required) {
      console.error(`copy-public: missing required file public/${name}`);
      process.exit(1);
    }
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`copy-public: ${name} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
  return true;
}

function copyDirRecursive(relDir) {
  const srcDir = path.join(publicDir, relDir);
  const destDir = path.join(distDir, relDir);
  if (!fs.existsSync(srcDir)) return;

  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    const src = path.join(publicDir, rel);
    const dest = path.join(distDir, rel);
    if (entry.isDirectory()) {
      copyDirRecursive(rel);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
  console.log(`copy-public: synced public/${relDir}/`);
}

// 1) Full public/ sync (llms, robots, sitemap, blog assets, _redirects, …)
for (const entry of fs.readdirSync(publicDir, { withFileTypes: true })) {
  const rel = entry.name;
  if (entry.isDirectory()) {
    copyDirRecursive(rel);
  } else {
    copyFile(rel);
  }
}

// 2) Verify required files landed in dist/
for (const name of REQUIRED_FILES) {
  const dest = path.join(distDir, name);
  if (!fs.existsSync(dest)) {
    console.error(`copy-public: dist/${name} missing after sync`);
    process.exit(1);
  }
}

console.log('copy-public: OK');
