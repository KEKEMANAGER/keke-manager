/** Landing page language picker (33 codes). App UI: ka, en, ru, hy (+ en fallback for hy). */
export type LandingLangCode =
  | 'ka'
  | 'en'
  | 'ru'
  | 'tr'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'ar'
  | 'zh'
  | 'uk'
  | 'pl'
  | 'nl'
  | 'pt'
  | 'sv'
  | 'no'
  | 'da'
  | 'fi'
  | 'cs'
  | 'hu'
  | 'ro'
  | 'bg'
  | 'el'
  | 'he'
  | 'hi'
  | 'ja'
  | 'ko'
  | 'th'
  | 'vi'
  | 'id'
  | 'ms'
  | 'az'
  | 'hy';

export const LANDING_LANGUAGES: { code: LandingLangCode; label: string }[] = [
  { code: 'ka', label: 'KA' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'tr', label: 'TR' },
  { code: 'es', label: 'ES' },
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
  { code: 'it', label: 'IT' },
  { code: 'ar', label: 'AR' },
  { code: 'zh', label: 'ZH' },
  { code: 'uk', label: 'UK' },
  { code: 'pl', label: 'PL' },
  { code: 'nl', label: 'NL' },
  { code: 'pt', label: 'PT' },
  { code: 'sv', label: 'SV' },
  { code: 'no', label: 'NO' },
  { code: 'da', label: 'DA' },
  { code: 'fi', label: 'FI' },
  { code: 'cs', label: 'CS' },
  { code: 'hu', label: 'HU' },
  { code: 'ro', label: 'RO' },
  { code: 'bg', label: 'BG' },
  { code: 'el', label: 'EL' },
  { code: 'he', label: 'HE' },
  { code: 'hi', label: 'HI' },
  { code: 'ja', label: 'JA' },
  { code: 'ko', label: 'KO' },
  { code: 'th', label: 'TH' },
  { code: 'vi', label: 'VI' },
  { code: 'id', label: 'ID' },
  { code: 'ms', label: 'MS' },
  { code: 'az', label: 'AZ' },
  { code: 'hy', label: 'HY' },
];

export const APP_SYNCED_LANDING_LANGS = new Set<LandingLangCode>(['ka', 'en', 'ru', 'hy']);

const LANDING_LANG_CODE_SET = new Set<string>(LANDING_LANGUAGES.map((l) => l.code));

export function isLandingLangCode(code: string): code is LandingLangCode {
  return LANDING_LANG_CODE_SET.has(code);
}
