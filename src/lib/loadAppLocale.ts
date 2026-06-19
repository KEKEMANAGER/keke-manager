import i18n from 'i18next';
import en from '../locales/en.json';
import hy from '../locales/hy.json';
import ru from '../locales/ru.json';
import type { AppLanguage } from './i18nTypes';

const APP_LANGS: AppLanguage[] = ['ka', 'en', 'ru', 'hy'];

const LOCALE_BUNDLES: Partial<Record<Exclude<AppLanguage, 'ka'>, typeof en>> = {
  en,
  ru,
  hy,
};

export function isAppLanguage(code: string | null | undefined): code is AppLanguage {
  return !!code && (APP_LANGS as string[]).includes(code);
}

export async function loadAppLocale(lng: AppLanguage): Promise<void> {
  if (lng === 'ka' || i18n.hasResourceBundle(lng, 'translation')) return;
  const bundle = LOCALE_BUNDLES[lng];
  if (!bundle) return;
  i18n.addResourceBundle(lng, 'translation', bundle, true, true);
}
