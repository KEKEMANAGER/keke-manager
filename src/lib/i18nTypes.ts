export const LANGUAGES = [
  { code: 'ka', label: 'GE' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
] as const;

export type AppLanguage = 'ka' | 'en' | 'ru' | 'hy';
