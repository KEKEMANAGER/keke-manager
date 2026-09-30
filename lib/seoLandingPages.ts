import data from './seoLandingPages.json';

export type SeoLandingPage = {
  slug: string;
  geo?: { name: string; nameKa: string; lat: number; lng: number };
  serviceName?: { en: string; ka: string };
  title: { en: string; ka: string };
  description: { en: string; ka: string };
  h1: { en: string; ka: string };
  intro: { en: string; ka: string };
  bullets: { en: string[]; ka: string[] };
  relatedBlog: string[];
};

type SeoLandingData = {
  driverCountLabel: string;
  locations: SeoLandingPage[];
  services: SeoLandingPage[];
};

const SEO_DATA = data as SeoLandingData;

export const SEO_DRIVER_COUNT = SEO_DATA.driverCountLabel;

export const SEO_LOCATION_PAGES: SeoLandingPage[] = SEO_DATA.locations;
export const SEO_SERVICE_PAGES: SeoLandingPage[] = SEO_DATA.services;

export function getLocationPage(slug: string): SeoLandingPage | undefined {
  return SEO_LOCATION_PAGES.find((p) => p.slug === slug);
}

export function getServicePage(slug: string): SeoLandingPage | undefined {
  return SEO_SERVICE_PAGES.find((p) => p.slug === slug);
}

export function getAllLocationSlugs(): string[] {
  return SEO_LOCATION_PAGES.map((p) => p.slug);
}

export function getAllServiceSlugs(): string[] {
  return SEO_SERVICE_PAGES.map((p) => p.slug);
}

/**
 * Trailing slashes are deliberate. Cloudflare Pages serves these prerendered
 * routes at the slashed URL, and the canonical, og:url and JSON-LD all declare
 * the slashed form. A sitemap that listed them without it would send Google
 * through a redirect to a page claiming a different canonical — the
 * self-contradiction that kept 66 pages out of the index before.
 *
 * Nothing consumes this yet (the deployed sitemap is written by
 * scripts/build-blog.mjs, which already agrees), so it is kept identical on
 * purpose: the day something does serve it, it must not reopen that bug.
 */
export function getSeoLandingSitemapUrls(siteUrl: string): { loc: string; lastmod: string }[] {
  const today = new Date().toISOString().slice(0, 10);
  const urls: { loc: string; lastmod: string }[] = [];
  for (const p of SEO_LOCATION_PAGES) {
    urls.push({ loc: `${siteUrl}/locations/${p.slug}/`, lastmod: today });
  }
  for (const p of SEO_SERVICE_PAGES) {
    urls.push({ loc: `${siteUrl}/services/${p.slug}/`, lastmod: today });
  }
  return urls;
}

export type SeoLandingLang = 'en' | 'ka';

export function pickLang(lang: string | undefined): SeoLandingLang {
  return lang === 'en' ? 'en' : 'ka';
}
