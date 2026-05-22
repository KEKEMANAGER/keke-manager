/**
 * Generate 1024×1024 store icons from assets/logo.png.
 * Run: node scripts/generate-store-icons.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const source = path.join(root, 'assets', 'logo.png');
const SIZE = 1024;
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

async function composeIcon(outPath, innerMaxPx) {
  const meta = await sharp(source).metadata();
  const scale = Math.min(innerMaxPx / meta.width, innerMaxPx / meta.height);
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const left = Math.round((SIZE - w) / 2);
  const top = Math.round((SIZE - h) / 2);

  const resized = await sharp(source).resize(w, h, { fit: 'inside' }).png().toBuffer();

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: BG },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const outMeta = await sharp(outPath).metadata();
  console.log(`Wrote ${path.relative(root, outPath)} (${outMeta.width}×${outMeta.height})`);
}

await composeIcon(path.join(root, 'assets', 'icon.png'), Math.round(SIZE * 0.88));
await composeIcon(path.join(root, 'assets', 'adaptive-icon.png'), Math.round(SIZE * 0.72));

const faviconPath = path.join(root, 'assets', 'favicon.png');
await sharp(source)
  .resize(48, 48, { fit: 'contain', background: BG })
  .png()
  .toFile(faviconPath);
console.log(`Wrote ${path.relative(root, faviconPath)} (48×48)`);
