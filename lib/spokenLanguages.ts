import i18n from '../src/lib/i18n';
import en from '../src/locales/en.json';
import ka from '../src/locales/ka.json';
import ru from '../src/locales/ru.json';

/** Canonical language codes stored in `users.languages`, `profiles.languages`, `bookings.required_languages`. */
export const SPOKEN_LANGUAGE_CODES = [
  'ka',
  'en',
  'ru',
  'de',
  'fr',
  'es',
  'it',
  'tr',
  'ar',
  'zh',
  'ja',
  'ko',
  'pt',
  'nl',
  'pl',
  'uk',
  'hy',
  'az',
  'fa',
  'hi',
  'sv',
  'no',
  'da',
  'fi',
  'cs',
  'ro',
  'el',
  'he',
  'th',
  'vi',
  'id',
  'bn',
  'ur',
] as const;

export type SpokenLanguageCode = (typeof SPOKEN_LANGUAGE_CODES)[number];

const CODE_SET = new Set<string>(SPOKEN_LANGUAGE_CODES);

/** @deprecated Use SPOKEN_LANGUAGE_CODES — kept for job board imports. */
export const JOB_BOARD_LANG_CODES = SPOKEN_LANGUAGE_CODES;
export type JobBoardLangCode = SpokenLanguageCode;

const ALIAS_TO_CODE: Record<string, SpokenLanguageCode> = {
  ka: 'ka',
  ge: 'ka',
  georgian: 'ka',
  english: 'en',
  eng: 'en',
  russian: 'ru',
  rus: 'ru',
  german: 'de',
  deutsch: 'de',
  french: 'fr',
  francais: 'fr',
  spanish: 'es',
  espanol: 'es',
  italian: 'it',
  turkish: 'tr',
  arabic: 'ar',
  chinese: 'zh',
  mandarin: 'zh',
  japanese: 'ja',
  korean: 'ko',
  portuguese: 'pt',
  dutch: 'nl',
  polish: 'pl',
  ukrainian: 'uk',
  armenian: 'hy',
  azerbaijani: 'az',
  persian: 'fa',
  farsi: 'fa',
  hindi: 'hi',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  czech: 'cs',
  romanian: 'ro',
  greek: 'el',
  hebrew: 'he',
  thai: 'th',
  vietnamese: 'vi',
  indonesian: 'id',
  bengali: 'bn',
  urdu: 'ur',
};

function aliasKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9\u10a0-\u10ff\u0400-\u04ff]/gi, '');
}

export function normalizeSpokenLanguageCode(raw: string): SpokenLanguageCode | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (CODE_SET.has(lower)) return lower as SpokenLanguageCode;

  const key = aliasKey(trimmed);
  if (key && ALIAS_TO_CODE[key]) return ALIAS_TO_CODE[key];

  if (lower.includes('georg') || lower.includes('ქართ')) return 'ka';
  if (lower.includes('engl') || lower.includes('ინგლ')) return 'en';
  if (lower.includes('russ') || lower.includes('რუს')) return 'ru';
  if (lower.includes('german') || lower.includes('გერმ')) return 'de';
  if (lower.includes('french') || lower.includes('ფრანგ')) return 'fr';
  if (lower.includes('spanish') || lower.includes('ესპ')) return 'es';
  if (lower.includes('italian')) return 'it';
  if (lower.includes('turkish') || lower.includes('თურქ')) return 'tr';
  if (lower.includes('arab')) return 'ar';
  if (lower.includes('chinese') || lower.includes('ჩინ')) return 'zh';
  if (lower.includes('japan')) return 'ja';
  if (lower.includes('korean')) return 'ko';
  if (lower.includes('portug')) return 'pt';
  if (lower.includes('dutch')) return 'nl';
  if (lower.includes('polish') || lower.includes('პოლ')) return 'pl';
  if (lower.includes('ukrain')) return 'uk';
  if (lower.includes('armen')) return 'hy';
  if (lower.includes('azer')) return 'az';
  if (lower.includes('persian') || lower.includes('farsi')) return 'fa';
  if (lower.includes('hindi')) return 'hi';

  return null;
}

/** @deprecated Use normalizeSpokenLanguageCode */
export function normalizeLanguageCode(raw: string): SpokenLanguageCode | null {
  return normalizeSpokenLanguageCode(raw);
}

export function languageCodesFromList(languages: string[] | null | undefined): SpokenLanguageCode[] {
  const set = new Set<SpokenLanguageCode>();
  for (const lang of languages ?? []) {
    const code = normalizeSpokenLanguageCode(String(lang));
    if (code) set.add(code);
  }
  return [...set];
}

export function spokenLanguageLabel(code: string, lang?: string): string {
  const norm = normalizeSpokenLanguageCode(code);
  if (!norm) return code;
  const bundleLang = (lang ?? String(i18n.resolvedLanguage || i18n.language || 'ka')).split('-')[0]?.toLowerCase() ?? 'ka';
  if (bundleLang === 'ru') {
    const label = (ru.spokenLanguages as Record<string, string>)[norm];
    if (label) return label;
  } else if (bundleLang === 'en') {
    const label = (en.spokenLanguages as Record<string, string>)[norm];
    if (label) return label;
  } else {
    const label = (ka.spokenLanguages as Record<string, string>)[norm];
    if (label) return label;
  }
  const key = `spokenLanguages.${norm}`;
  if (i18n.exists(key)) return i18n.t(key);
  return norm.toUpperCase();
}

/** @deprecated Use spokenLanguageLabel */
export function languageBadgeLabel(code: JobBoardLangCode | string): string {
  return spokenLanguageLabel(code);
}

export function formatSpokenLanguagesList(codes: string[], lang?: string): string {
  const normalized = languageCodesFromList(codes);
  if (!normalized.length) return '';
  return normalized.map((c) => spokenLanguageLabel(c, lang)).join(', ');
}

/**
 * Driver matches when they speak at least one required language (OR).
 * Empty required → all drivers match.
 */
export function driverMatchesRequiredLanguages(
  driverLanguages: string[] | null | undefined,
  requiredLanguages: string[] | null | undefined,
): boolean {
  const required = languageCodesFromList(requiredLanguages ?? []);
  if (required.length === 0) return true;
  const spoken = languageCodesFromList(driverLanguages ?? []);
  return required.some((code) => spoken.includes(code));
}

export type SpokenLanguageOption = {
  code: SpokenLanguageCode;
  label: string;
  searchText: string;
};

export function getSpokenLanguageOptions(): SpokenLanguageOption[] {
  return SPOKEN_LANGUAGE_CODES.map((code) => {
    const label = spokenLanguageLabel(code);
    return {
      code,
      label,
      searchText: `${code} ${label}`.toLowerCase(),
    };
  });
}

export function filterSpokenLanguageOptions(
  query: string,
  options: SpokenLanguageOption[] = getSpokenLanguageOptions(),
): SpokenLanguageOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.searchText.includes(q) || o.code.includes(q));
}

export function sanitizeLanguageCodes(raw: string[]): string[] {
  const set = new Set<SpokenLanguageCode>();
  const items = Array.isArray(raw) ? raw : [];
  for (const item of items) {
    const code = normalizeSpokenLanguageCode(item);
    if (code) set.add(code);
  }
  return [...set];
}
