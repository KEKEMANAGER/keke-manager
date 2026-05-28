import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';
import ka from '../locales/ka.json';
import type { AppLanguage } from './i18nTypes';

export type { AppLanguage } from './i18nTypes';
export { LANGUAGES } from './i18nTypes';

const LANG_STORAGE_KEY = '@keke/language';

const resources = {
  ka: { translation: ka },
};

async function ensureLocale(lng: AppLanguage): Promise<void> {
  if (lng === 'ka' || i18n.hasResourceBundle(lng, 'translation')) return;
  const mod =
    lng === 'en'
      ? await import('../locales/en.json')
      : await import('../locales/ru.json');
  i18n.addResourceBundle(lng, 'translation', mod.default ?? mod, true, true);
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'ka',
    fallbackLng: 'ka',
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false },
    react: {
      useSuspense: false,
      bindI18n: 'languageChanged',
      bindI18nStore: 'added removed',
    },
  });
}

/** Native bundles all locales; web loads EN/RU on demand to shrink the initial chunk. */
if (Platform.OS !== 'web') {
  void (async () => {
    await ensureLocale('en');
    await ensureLocale('ru');
  })();
}

export async function initI18n(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'ka' || stored === 'en' || stored === 'ru') {
      await ensureLocale(stored);
      await i18n.changeLanguage(stored);
    }
  } catch {
    /* use default */
  }
}

export async function persistLanguage(lng: AppLanguage): Promise<void> {
  await ensureLocale(lng);
  await AsyncStorage.setItem(LANG_STORAGE_KEY, lng);
  await i18n.changeLanguage(lng);
}

export default i18n;
