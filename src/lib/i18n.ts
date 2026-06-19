import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';
import ka from '../locales/ka.json';
import { isAppLanguage, loadAppLocale } from './loadAppLocale';
import type { AppLanguage } from './i18nTypes';

export type { AppLanguage } from './i18nTypes';
export { LANGUAGES } from './i18nTypes';

const LANG_STORAGE_KEY = '@keke/language';

const resources = {
  ka: { translation: ka },
};

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'ka',
    fallbackLng: {
      hy: ['en', 'ka'],
      en: ['ka'],
      ru: ['ka'],
      default: ['ka'],
    },
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false },
    react: {
      useSuspense: false,
      bindI18n: 'languageChanged',
      bindI18nStore: 'added removed',
    },
  });
}

/** Native preloads common locales; web loads on demand. */
if (Platform.OS !== 'web') {
  void (async () => {
    await loadAppLocale('en');
    await loadAppLocale('ru');
    await loadAppLocale('hy');
  })();
}

export async function initI18n(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(LANG_STORAGE_KEY);
    if (isAppLanguage(stored)) {
      await loadAppLocale(stored);
      await i18n.changeLanguage(stored);
    }
  } catch {
    /* use default */
  }
}

export async function persistLanguage(lng: AppLanguage): Promise<void> {
  await loadAppLocale(lng);
  await AsyncStorage.setItem(LANG_STORAGE_KEY, lng);
  await i18n.changeLanguage(lng);
}

export default i18n;
