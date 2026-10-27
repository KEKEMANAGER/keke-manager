import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { readImageAsArrayBuffer, uploadMediaObject } from './mediaUpload';
import { supabase } from './supabase';
import { getSupabaseUrl } from './supabaseEnv';

/**
 * Drivers' documents — ID card, driving licence, vehicle tech passport.
 *
 * They used to sit in the public `media` bucket next to avatars and car
 * photos, where anyone holding a link could open them, and a link is easy to
 * build from a user id. They now go to the private `documents` bucket, which
 * only the driver himself and an admin may read (storage policies), and are
 * shown through a signed link that expires within the hour.
 *
 * What the database keeps is still an https address — the storage
 * "authenticated" URL of the file — so every check that a document is there
 * (an http link) keeps working, and so does any screen of an older app
 * version; such a link simply does not open without signing in.
 */
export const DOCUMENTS_BUCKET = 'documents';

const AUTHENTICATED_MARKER = `/storage/v1/object/authenticated/${DOCUMENTS_BUCKET}/`;

/** A signed link lives an hour; it is renewed a little before that. */
const SIGNED_URL_SECONDS = 60 * 60;
const SIGNED_URL_REUSE_MS = 50 * 60 * 1000;

/** The stored address of a document at `path` in the private bucket. */
export function documentRef(path: string): string {
  const base = getSupabaseUrl().replace(/\/+$/, '');
  return `${base}${AUTHENTICATED_MARKER}${path.replace(/^\/+/, '')}`;
}

/** The bucket path of a stored document address, or null for anything else (a public photo, a local file). */
export function documentPathFromRef(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  const at = v.indexOf(AUTHENTICATED_MARKER);
  if (at === -1) return null;
  const path = v.slice(at + AUTHENTICATED_MARKER.length).split('?')[0] ?? '';
  try {
    return decodeURIComponent(path) || null;
  } catch {
    return path || null;
  }
}

export function isDocumentRef(value: string | null | undefined): boolean {
  return documentPathFromRef(value) !== null;
}

function contentTypeFor(source: string | Blob, override?: string): string {
  if (override && override.startsWith('image/')) return override;
  if (typeof Blob !== 'undefined' && source instanceof Blob && source.type.startsWith('image/')) {
    return source.type;
  }
  const lower = typeof source === 'string' ? source.toLowerCase() : '';
  if (lower.includes('png')) return 'image/png';
  if (lower.includes('webp')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Upload a document photo to the private bucket at `path` (same paths as
 * before: `verification/<uid>/<slot>.jpg`, `vehicles/<vehicle>/tech_passport_*.jpg`)
 * and return its stored address.
 */
export async function uploadDocumentObject(
  path: string,
  source: string | Blob,
  options?: { contentType?: string },
): Promise<string> {
  let body: Blob | ArrayBuffer;
  if (Platform.OS === 'web' && typeof Blob !== 'undefined' && source instanceof Blob) {
    body = source;
  } else if (typeof source === 'string') {
    body = await readImageAsArrayBuffer(source);
  } else {
    throw new Error('ატვირთვის წყარო არასწორია');
  }
  const contentType = contentTypeFor(source, options?.contentType);
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error && isMissingBucketError(error)) {
    // A database without the private bucket yet: keep working the old way.
    return uploadMediaObject(path, source, { contentType });
  }
  if (error) throw new Error(error.message);
  forgetSignedDocumentUrl(path);
  return documentRef(path);
}

function isMissingBucketError(error: { message?: string; statusCode?: string | number }): boolean {
  return /bucket not found/i.test(error.message ?? '');
}

const signedCache = new Map<string, { url: string; at: number }>();
/** Bumped when a document is replaced, so screens showing it fetch a fresh link. */
const versions = new Map<string, number>();
const listeners = new Set<(path: string) => void>();

function forgetSignedDocumentUrl(path: string): void {
  signedCache.delete(path);
  versions.set(path, (versions.get(path) ?? 0) + 1);
  for (const listener of listeners) listener(path);
}

function freshSignedUrl(path: string): string | null {
  const cached = signedCache.get(path);
  return cached && Date.now() - cached.at < SIGNED_URL_REUSE_MS ? cached.url : null;
}

async function signedUrlForPath(path: string): Promise<string | null> {
  const fresh = freshSignedUrl(path);
  if (fresh) return fresh;
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

/**
 * Something an <Image> can open: a signed link for a private document, the
 * value itself for anything else (a public photo, a local file just picked).
 */
export async function viewableDocumentUri(value: string | null | undefined): Promise<string | null> {
  const v = (value ?? '').trim();
  if (!v) return null;
  const path = documentPathFromRef(v);
  return path ? signedUrlForPath(path) : v;
}

/**
 * The viewable form of a stored document address, for an <Image>. Null while
 * it is being signed. Keyed by the file, not the exact string: screens add a
 * cache-busting `?t=` to links, sometimes on every render.
 */
export function useViewableDocumentUri(value: string | null | undefined): string | null {
  const v = (value ?? '').trim() || null;
  const path = documentPathFromRef(v);
  const [version, setVersion] = useState(() => (path ? versions.get(path) ?? 0 : 0));
  const [signed, setSigned] = useState<{ key: string; uri: string | null } | null>(null);
  const key = path ? `${path}#${version}` : null;

  useEffect(() => {
    if (!path) return;
    setVersion(versions.get(path) ?? 0);
    const onReplaced = (replaced: string) => {
      if (replaced === path) setVersion(versions.get(path) ?? 0);
    };
    listeners.add(onReplaced);
    return () => {
      listeners.delete(onReplaced);
    };
  }, [path]);

  useEffect(() => {
    if (!path || !key) return;
    let cancelled = false;
    void signedUrlForPath(path).then((uri) => {
      if (!cancelled) setSigned({ key, uri });
    });
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  if (!v) return null;
  if (!path) return v;
  if (signed?.key === key) return signed.uri;
  return freshSignedUrl(path);
}
