/**
 * Generates compressed WebP logos for web bundles and public SEO assets.
 * Run: node scripts/optimize-brand-assets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const logoSrc = path.join(root, 'assets', 'images', 'logo.png');
const imagesDir = path.join(root, 'assets', 'images');
const publicDir = path.join(root, 'public');

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Install sharp: npm install --save-dev sharp');
    process.exit(1);
  }

  if (!fs.existsSync(logoSrc)) {
    console.warn('Skip: assets/images/logo.png not found');
    return;
  }

  const webpOut = path.join(imagesDir, 'logo.webp');
  await sharp(logoSrc)
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toFile(webpOut);
  console.log(`logo.webp: ${(fs.statSync(webpOut).size / 1024).toFixed(0)} KB`);

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const publicPng = path.join(publicDir, 'logo.png');
  await sharp(logoSrc)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, quality: 82 })
    .toFile(publicPng);
  console.log(`public/logo.png: ${(fs.statSync(publicPng).size / 1024).toFixed(0)} KB`);

  const publicWebp = path.join(publicDir, 'logo.webp');
  await sharp(logoSrc)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(publicWebp);
  console.log(`public/logo.webp: ${(fs.statSync(publicWebp).size / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
