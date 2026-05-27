import type { AppMenuRole } from './menuRole';

/** Primary “home” route per app shell (matches drawer dashboard entry). */
export function getAppHomeRoute(menuRole: AppMenuRole): string {
  if (menuRole === 'company') return '/(app)/dashboard';
  return '/(driver)/dashboard';
}

export function isAppHomeSegment(menuRole: AppMenuRole | null, segment: string | undefined): boolean {
  if (!menuRole || !segment) return false;
  return segment === 'dashboard';
}
