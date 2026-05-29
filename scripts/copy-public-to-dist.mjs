/** Ensures public assets (logo.webp, _redirects) exist in dist for static hosting. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

if (!fs.existsSync(distDir)) process.exit(0);

function copyFile(name) {
  const src = path.join(publicDir, name);
  const dest = path.join(distDir, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`copy-public: ${name}`);
  }
}

copyFile('logo.webp');
copyFile('_redirects');
