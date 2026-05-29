/** Ensures public assets (logo.webp, _redirects) exist in dist for static hosting. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

if (!fs.existsSync(distDir)) process.exit(0);

function copyFile(name, required = false) {
  const src = path.join(publicDir, name);
  const dest = path.join(distDir, name);
  if (!fs.existsSync(src)) {
    if (required) {
      console.error(`copy-public: missing required file public/${name}`);
      process.exit(1);
    }
    return;
  }
  fs.copyFileSync(src, dest);
  console.log(`copy-public: ${name} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
}

copyFile('logo.webp', true);
copyFile('_redirects');
