/**
 * Generates public/og-image.jpg and compresses public/logo.png for web SEO.
 * Run: node scripts/generate-seo-assets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const logoSrc = path.join(root, 'assets', 'images', 'logo.png');

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Install sharp: npm install --no-save sharp');
    process.exit(1);
  }

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  if (fs.existsSync(logoSrc)) {
    const logoOut = path.join(publicDir, 'logo.png');
    await sharp(logoSrc)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, quality: 82 })
      .toFile(logoOut);
    const logoSize = fs.statSync(logoOut).size;
    console.log(`logo.png: ${(logoSize / 1024).toFixed(0)} KB`);
  }

  const width = 1200;
  const height = 630;
  const gold = '#EF9F27';
  const dark = '#0a0a0a';

  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a"/>
      <stop offset="100%" style="stop-color:#1a1208"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="0" y="0" width="100%" height="6" fill="${gold}"/>
  <text x="600" y="260" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="900" fill="${gold}" letter-spacing="8">KEKE MANAGER</text>
  <text x="600" y="340" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="600" fill="#f5f5f5">B2B Tourist Transport Ecosystem</text>
  <text x="600" y="400" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#aaaaaa">Georgia · Bookings · GPS · Vouchers · 33 Languages</text>
  <rect x="200" y="480" width="800" height="2" fill="${gold}" opacity="0.5"/>
  <text x="600" y="530" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#888888">kekemanager.com</text>
</svg>`;

  const ogOut = path.join(publicDir, 'og-image.jpg');
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 82, mozjpeg: true })
    .resize(width, height)
    .toFile(ogOut);

  const ogSize = fs.statSync(ogOut).size;
  console.log(`og-image.jpg: ${(ogSize / 1024).toFixed(0)} KB (${width}x${height})`);
  if (ogSize > 300 * 1024) {
    await sharp(ogOut).jpeg({ quality: 70, mozjpeg: true }).toFile(ogOut);
    console.log(`og-image.jpg recompressed: ${(fs.statSync(ogOut).size / 1024).toFixed(0)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
