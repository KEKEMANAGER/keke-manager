/** True when expo-router segments already match an href (prevents replace loops on web). */
export function isCurrentRoute(segments: readonly string[], href: string): boolean {
  if (!href || href === '/') {
    return segments.length === 0;
  }

  const parts = href.split('/').filter(Boolean);
  const group = parts.find((p) => p.startsWith('(') && p.endsWith(')'));
  const leaf = parts[parts.length - 1];

  if (group && segments[0] !== group) return false;
  if (leaf && !segments.includes(leaf)) return false;
  return true;
}
