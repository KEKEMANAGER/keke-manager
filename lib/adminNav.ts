import type { Href } from 'expo-router';
import type { AdminTabId } from '../components/admin/AdminTabBar';

/** Every admin panel tab, checked against the type so none can be forgotten. */
const ADMIN_TABS: Record<AdminTabId, true> = {
  users: true,
  verify: true,
  chats: true,
  bookings: true,
  regions: true,
  dispatch: true,
  imports: true,
  gps: true,
  stats: true,
  ads: true,
  motivation: true,
};

export function isAdminTabId(value: unknown): value is AdminTabId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ADMIN_TABS, value);
}

/**
 * Where "back" goes for a screen the admin panel opened: the panel, on the
 * tab it was opened from. Screens opened from anywhere else carry no
 * `adminTab` param and get null, so their back button is left alone.
 */
export function adminPanelBackHref(adminTab: string | string[] | undefined): Href | null {
  const tab = Array.isArray(adminTab) ? adminTab[0] : adminTab;
  if (!isAdminTabId(tab)) return null;
  return { pathname: '/(app)/admin-panel', params: { tab } };
}
