import type { AppLanguage } from '../src/lib/i18n';
import { LEGAL_BUNDLES, type LegalDocLocale, type LegalDocSlug } from './legalBundles';

export type { LegalDocSlug };

export const LEGAL_DOC_SLUGS = ['privacy-policy', 'terms-of-service'] as const;

export function legalLocaleForApp(lang: string): LegalDocLocale {
  return lang === 'ka' ? 'ka' : 'en';
}

export function getLegalMarkdown(slug: LegalDocSlug, appLanguage: AppLanguage | string): string {
  const locale = legalLocaleForApp(appLanguage);
  return LEGAL_BUNDLES[slug][locale];
}

export function legalDocTitleKey(slug: LegalDocSlug): string {
  return slug === 'privacy-policy' ? 'legal.privacyPolicy' : 'legal.termsOfService';
}

export function slugFromInternalMarkdownLink(href: string): LegalDocSlug | null {
  const name = href.split('/').pop()?.toLowerCase() ?? '';
  if (name.includes('privacy-policy')) return 'privacy-policy';
  if (name.includes('terms-of-service')) return 'terms-of-service';
  return null;
}
