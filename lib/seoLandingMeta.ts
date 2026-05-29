import { OG_IMAGE_URL, SITE_URL } from './seoMeta';
import type { SeoLandingLang, SeoLandingPage } from './seoLandingPages';
import { SEO_DRIVER_COUNT } from './seoLandingPages';

export type SeoLandingSeoMeta = {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  keywords: string;
  hreflang: { ka: string; en: string };
};

function pagePath(kind: 'location' | 'service', slug: string): string {
  return kind === 'location' ? `/locations/${slug}` : `/services/${slug}`;
}

export function seoLandingMeta(
  page: SeoLandingPage,
  kind: 'location' | 'service',
  lang: SeoLandingLang,
): SeoLandingSeoMeta {
  const path = pagePath(kind, page.slug);
  const canonical = `${SITE_URL}${path}`;
  const title = page.title[lang];
  const description = page.description[lang];
  const keywords =
    lang === 'ka'
      ? `KEKE Manager, ტურმძღოლი, ტუროკომპანია, B2B პლატფორმა, ტურისტული ტრანსპორტი, ${page.geo?.nameKa ?? page.serviceName?.ka ?? ''}`
      : `KEKE Manager, tour driver, tour company, B2B platform, verified drivers Georgia, ${page.geo?.name ?? page.serviceName?.en ?? ''}`;

  return {
    title,
    description,
    canonical,
    ogImage: OG_IMAGE_URL,
    keywords,
    hreflang: {
      ka: canonical,
      en: `${canonical}?lang=en`,
    },
  };
}

const KEKE_LOCAL_BUSINESS_ID = `${SITE_URL}/#localbusiness`;

export function seoLandingLocalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': KEKE_LOCAL_BUSINESS_ID,
    name: 'KEKE Manager',
    description:
      'B2B marketplace connecting tour companies, travel agencies, and verified guide-drivers across Georgia. KEKE Manager does not operate vehicles.',
    url: SITE_URL,
    image: OG_IMAGE_URL,
    telephone: '+995551003411',
    email: 'info@kekemanager.com',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'GE',
      addressLocality: 'Tbilisi',
    },
    areaServed: {
      '@type': 'Country',
      name: 'Georgia',
    },
    priceRange: 'Free for tour companies',
  };
}

export function seoLandingServiceSchema(
  page: SeoLandingPage,
  kind: 'location' | 'service',
  lang: SeoLandingLang,
) {
  const path = pagePath(kind, page.slug);
  const serviceName =
    lang === 'ka'
      ? page.serviceName?.ka ?? `ვერიფიცირებული ტურმძღოლები — ${page.geo?.nameKa ?? 'საქართველო'}`
      : page.serviceName?.en ?? `Verified tour drivers — ${page.geo?.name ?? 'Georgia'}`;

  const description = page.description[lang];
  const areaServed = page.geo
    ? {
        '@type': 'Place',
        name: page.geo.name,
        geo: {
          '@type': 'GeoCoordinates',
          latitude: page.geo.lat,
          longitude: page.geo.lng,
        },
      }
    : { '@type': 'Country', name: 'Georgia' };

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: serviceName,
    description,
    url: `${SITE_URL}${path}`,
    provider: { '@id': KEKE_LOCAL_BUSINESS_ID },
    serviceType: 'Tour driver marketplace & fleet management platform',
    areaServed,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'GEL',
      description:
        lang === 'ka'
          ? 'ტუროკომპანიებისთვის უფასო — დაუკავშირდით 500+ ვერიფიცირებულ მძღოლს'
          : `Free for tour companies — connect with ${SEO_DRIVER_COUNT} verified drivers`,
      url: `${SITE_URL}/sign-up`,
    },
  };
}

export function seoLandingWebPageSchema(
  page: SeoLandingPage,
  kind: 'location' | 'service',
  lang: SeoLandingLang,
) {
  const meta = seoLandingMeta(page, kind, lang);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: meta.title,
    description: meta.description,
    url: meta.canonical,
    inLanguage: lang === 'ka' ? 'ka' : 'en',
    isPartOf: { '@type': 'WebSite', name: 'KEKE Manager', url: SITE_URL },
    about: { '@type': 'Service', provider: { '@id': KEKE_LOCAL_BUSINESS_ID } },
  };
}

export function seoLandingBreadcrumbSchema(
  page: SeoLandingPage,
  kind: 'location' | 'service',
  lang: SeoLandingLang,
) {
  const path = pagePath(kind, page.slug);
  const section =
    kind === 'location'
      ? lang === 'ka'
        ? 'ლოკაციები'
        : 'Locations'
      : lang === 'ka'
        ? 'სერვისები'
        : 'Services';
  const sectionPath = kind === 'location' ? '/locations' : '/services';
  const label = lang === 'ka' ? page.h1.ka : page.h1.en;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'KEKE Manager', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: section, item: `${SITE_URL}${sectionPath}` },
      { '@type': 'ListItem', position: 3, name: label, item: `${SITE_URL}${path}` },
    ],
  };
}
