export const LANGUAGES = [
  { code: 'ka', label: 'GE' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'hy', label: 'HY' },
] as const;

export type AppLanguage = (typeof LANGUAGES)[number]['code'];
