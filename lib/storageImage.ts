/**
 * A smaller copy of a photo kept in Supabase Storage, made by Storage itself
 * (Image Transformations, Pro plan): the same address with
 * `/object/public/` replaced by `/render/image/public/` and the size asked for.
 *
 * Phones upload their photos as they are — a vehicle photo averages about
 * 3 MB and some are over 20 MB, in JPEG, PNG, iPhone HEIC or even RAW. Shown as
 * a 100-pixel thumbnail, each of them used to be downloaded whole; the copy
 * Storage makes is 15–30 KB, and it is a JPEG or WebP every browser can show
 * (HEIC and RAW files included).
 *
 * Billing: Storage counts each distinct original it resizes in a billing
 * cycle (100 included on Pro, then a small fee per 1,000), not each request.
 *
 * Anything that is not a public Storage address (a signed link to a private
 * document, a local file, a data: URI) comes back unchanged.
 */
export type StorageImageSize = {
  width: number;
  height?: number;
  /** 20–100; Storage's default is 80. */
  quality?: number;
  /** How the photo fits the size asked for (Storage's default is cover). */
  resize?: 'cover' | 'contain' | 'fill';
};

const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

export function isPublicStorageUrl(url: string | null | undefined): boolean {
  const u = (url ?? '').trim();
  return /^https?:\/\//i.test(u) && u.includes(OBJECT_PATH);
}

export function storageImageUrl(url: string | null | undefined, size: StorageImageSize): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  if (!isPublicStorageUrl(u)) return u;
  const cut = u.indexOf('?');
  const base = cut >= 0 ? u.slice(0, cut) : u;
  const params = new URLSearchParams(cut >= 0 ? u.slice(cut + 1) : '');
  const clamp = (n: number) => String(Math.max(1, Math.min(2500, Math.round(n))));
  params.set('width', clamp(size.width));
  if (size.height) params.set('height', clamp(size.height));
  else params.delete('height');
  params.set('resize', size.resize ?? 'cover');
  params.set('quality', String(Math.max(20, Math.min(100, Math.round(size.quality ?? 70)))));
  return `${base.replace(OBJECT_PATH, RENDER_PATH)}?${params.toString()}`;
}
