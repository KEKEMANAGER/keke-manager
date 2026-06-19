import i18n from 'i18next';
import type { AppLanguage } from './i18nTypes';

const APP_LANGS: AppLanguage[] = ['ka', 'en', 'ru', 'hy'];

export function isAppLanguage(code: string | null | undefined): code is AppLanguage {
  return !!code && (APP_LANGS as string[]).includes(code);
}

export async function loadAppLocale(lng: AppLanguage): Promise<void> {
  if (lng === 'ka' || i18n.hasResourceBundle(lng, 'translation')) return;
  const mod = await import(`../locales/${lng}.json`);
  i18n.addResourceBundle(lng, 'translation', mod.default ?? mod, true, true);
}
