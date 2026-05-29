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

export function getSeoLandingSitemapUrls(siteUrl: string): { loc: string; lastmod: string }[] {
  const today = new Date().toISOString().slice(0, 10);
  const urls: { loc: string; lastmod: string }[] = [];
  for (const p of SEO_LOCATION_PAGES) {
    urls.push({ loc: `${siteUrl}/locations/${p.slug}`, lastmod: today });
  }
  for (const p of SEO_SERVICE_PAGES) {
    urls.push({ loc: `${siteUrl}/services/${p.slug}`, lastmod: today });
  }
  return urls;
}

export type SeoLandingLang = 'en' | 'ka';

export function pickLang(lang: string | undefined): SeoLandingLang {
  return lang === 'en' ? 'en' : 'ka';
}
