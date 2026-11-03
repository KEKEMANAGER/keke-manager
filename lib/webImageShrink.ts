/**
 * On the web, a photo is made smaller before it is uploaded: at most 1920
 * pixels on its longer side, saved again as JPEG (a PNG stays PNG, so a logo
 * keeps its transparency). A phone photo of 3–20 MB becomes a few hundred KB,
 * and the location and other metadata in the original are not carried over.
 *
 * Anything the browser cannot read — an iPhone HEIC photo in Chrome, a RAW
 * file, a PDF — is uploaded exactly as before, and so is a photo that is small
 * already, or one that would not come out smaller. Nothing here runs in the
 * phone apps (no canvas there); they keep uploading as they do.
 */
export const WEB_UPLOAD_MAX_SIDE = 1920;

/** Below this a photo that is not too large in pixels is left alone. */
const LEAVE_UNDER_BYTES = 600 * 1024;

const READABLE = /^image\/(jpeg|jpg|pjpeg|png|webp|heic|heif|bmp)$/;

export async function shrinkImageForUpload(
  blob: Blob,
  contentType: string,
): Promise<{ body: Blob; contentType: string }> {
  const keep = { body: blob, contentType };
  const type = (contentType || blob.type || '').toLowerCase();
  if (!READABLE.test(type)) return keep;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return keep;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return keep; // the browser cannot read this format
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!longest) return keep;
    const scale = Math.min(1, WEB_UPLOAD_MAX_SIDE / longest);
    if (scale === 1 && blob.size <= LEAVE_UNDER_BYTES) return keep;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return keep;
    const png = type === 'image/png';
    if (!png) {
      // JPEG has no transparency: a transparent area would turn black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const outType = png ? 'image/png' : 'image/jpeg';
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outType, png ? undefined : 0.85),
    );
    if (!out || out.size === 0 || out.size >= blob.size) return keep;
    return { body: out, contentType: outType };
  } catch {
    return keep;
  } finally {
    bitmap.close();
  }
}
