import { storagePublicUrlBase, withCacheBust } from './mediaUpload';

/** Prefer `profiles.avatar_url`, fall back to legacy `users.avatar_url`. */
export function resolveProfileAvatarUrl(
  profileAvatar: string | null | undefined,
  userAvatar: string | null | undefined,
): string | null {
  for (const raw of [profileAvatar, userAvatar]) {
    if (typeof raw === 'string' && raw.trim().startsWith('http')) {
      const base = storagePublicUrlBase(raw.trim());
      return withCacheBust(base) ?? base;
    }
  }
  return null;
}
