import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import ka from '../locales/ka.json';
import ru from '../locales/ru.json';

const LANG_STORAGE_KEY = '@keke/language';

export const LANGUAGES = [
  { code: 'ka', label: 'GE' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
] as const;

export type AppLanguage = (typeof LANGUAGES)[number]['code'];

const resources = {
  ka: { translation: ka },
  en: { translation: en },
  ru: { translation: ru },
};

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

export async function initI18n(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'ka' || stored === 'en' || stored === 'ru') {
      await i18n.changeLanguage(stored);
    }
  } catch {
    /* use default */
  }
}

export async function persistLanguage(lng: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANG_STORAGE_KEY, lng);
  await i18n.changeLanguage(lng);
}

export default i18n;
