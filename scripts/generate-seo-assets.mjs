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
const logoCandidates = [
  path.join(root, 'assets', 'images', 'logo.png'),
  path.join(root, 'assets', 'images', 'logo.webp'),
  path.join(root, 'assets', 'logo.png'),
];

function pickLogoSrc() {
  for (const p of logoCandidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Install sharp: npm install --no-save sharp');
    process.exit(1);
  }

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const logoSrc = pickLogoSrc();
  if (logoSrc) {
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
  const darkTop = '#0a0a0a';
  const darkBottom = '#141008';

  const bgSvg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${darkTop}"/>
      <stop offset="100%" style="stop-color:${darkBottom}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="55%">
      <stop offset="0%" style="stop-color:${gold};stop-opacity:0.12"/>
      <stop offset="100%" style="stop-color:${gold};stop-opacity:0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect x="0" y="0" width="100%" height="5" fill="${gold}"/>
</svg>`;

  const textSvg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="600" y="400" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="${gold}">B2B Tourism Transport Platform</text>
  <text x="600" y="455" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="500" fill="#f5f5f5">Georgia&apos;s first B2B platform connecting tour operators and drivers</text>
  <text x="600" y="495" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="500" fill="#c8c8c8">GPS tracking · Bookings · Digital vouchers</text>
  <rect x="320" y="530" width="560" height="2" fill="${gold}" opacity="0.45"/>
  <text x="600" y="575" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="#888888" letter-spacing="2">kekemanager.com</text>
</svg>`;

  const composites = [
    { input: Buffer.from(bgSvg), top: 0, left: 0 },
  ];

  if (logoSrc) {
    const logoBuf = await sharp(logoSrc)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const { width: lw, height: lh } = await sharp(logoBuf).metadata();
    composites.push({
      input: logoBuf,
      top: Math.round(72 - lh / 2 + 90),
      left: Math.round((width - lw) / 2),
    });
  }

  composites.push({ input: Buffer.from(textSvg), top: 0, left: 0 });

  const ogOut = path.join(publicDir, 'og-image.jpg');
  await sharp({
    create: { width, height, channels: 3, background: darkTop },
  })
    .composite(composites)
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(ogOut);

  let ogSize = fs.statSync(ogOut).size;
  console.log(`og-image.jpg: ${(ogSize / 1024).toFixed(0)} KB (${width}x${height})`);
  if (ogSize > 300 * 1024) {
    await sharp(ogOut).jpeg({ quality: 72, mozjpeg: true }).toFile(ogOut);
    ogSize = fs.statSync(ogOut).size;
    console.log(`og-image.jpg recompressed: ${(ogSize / 1024).toFixed(0)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
