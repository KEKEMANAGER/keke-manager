import titles from './generated/seoBlogLinkTitles.json';
import type { SeoLandingLang } from './seoLandingPages';

type BlogLinkTitle = { ka: string; en: string };

const TITLE_MAP = titles as Record<string, BlogLinkTitle>;

export function getSeoBlogLinkTitle(slug: string, lang: SeoLandingLang): string | null {
  const entry = TITLE_MAP[slug];
  if (!entry) return null;
  return lang === 'en' ? entry.en : entry.ka;
}
