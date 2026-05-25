/** Technical SEO copy and structured data for kekemanager.com (landing / web). */

export const SITE_URL = 'https://kekemanager.com';
export const OG_IMAGE_URL = `${SITE_URL}/og-image.jpg`;

export type SeoLang = 'ka' | 'en' | 'ru';

export type SeoMetaEntry = {
  title: string;
  description: string;
  keywords: string;
  ogLocale: string;
};

export const SEO_META: Record<SeoLang, SeoMetaEntry> = {
  ka: {
    title: 'KEKE Manager — B2B ეკოსისტემა ტურისტული ტრანსპორტისთვის',
    description:
      'პლატფორმა ტურისტული კომპანიებისთვის, გიდ-მძღოლებისთვის, ფლოტის მფლობელებისთვის და დაქირავებული მძღოლებისთვის საქართველოში. ჯავშნები, GPS, რეიტინგი, 33 ენა.',
    keywords:
      'ტურისტული ტრანსპორტი, მძღოლი, გიდ-მძღოლი, ჯავშნა, ფლოტი, საქართველო, თბილისი, B2B, ტრანსფერი, ტური',
    ogLocale: 'ka_GE',
  },
  en: {
    title: 'KEKE Manager — B2B Platform for Tourist Transport in Georgia',
    description:
      'B2B ecosystem connecting tour companies, guide-drivers, fleet owners, and hired drivers in Georgia. Bookings, GPS tracking, ratings, 33 languages. Free for companies.',
    keywords:
      'tourist transport georgia, tour driver, guide driver, booking platform, fleet management, tbilisi transfer, B2B transport, georgia tour transfer',
    ogLocale: 'en_US',
  },
  ru: {
    title: 'KEKE Manager — B2B платформа для туристического транспорта в Грузии',
    description:
      'B2B экосистема для туристических компаний, гидов-водителей, владельцев автопарка и наёмных водителей в Грузии. Бронирование, GPS, рейтинги, 33 языка.',
    keywords:
      'туристический транспорт грузия, водитель тур, гид водитель, бронирование, тбилиси трансфер, B2B транспорт',
    ogLocale: 'ru_RU',
  },
};

export const DEFAULT_SEO_LANG: SeoLang = 'ka';

export function resolveSeoLang(code: string | null | undefined): SeoMetaEntry {
  if (code === 'en' || code === 'ru' || code === 'ka') {
    return SEO_META[code];
  }
  return SEO_META.en;
}

export function isSeoLang(code: string): code is SeoLang {
  return code === 'ka' || code === 'en' || code === 'ru';
}

export const SCHEMA_SOFTWARE_APPLICATION = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'KEKE Manager',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, iOS, Android',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'GEL',
    description: 'Free for tour companies',
  },
  description:
    'B2B ecosystem connecting tour companies, guide-drivers, fleet owners, and hired drivers in Georgia',
  url: SITE_URL,
  logo: OG_IMAGE_URL,
  creator: {
    '@type': 'Organization',
    name: 'KEKE Manager',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    email: 'info@kekemanager.com',
    telephone: '+995551003411',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'GE',
      addressLocality: 'Tbilisi',
    },
    founder: [
      { '@type': 'Person', name: 'Akaki Kachibaia', jobTitle: 'CEO & Founder' },
      { '@type': 'Person', name: 'Ani Kekelia', jobTitle: 'Co-Founder' },
    ],
  },
  inLanguage: ['ka', 'en', 'ru'],
} as const;

export const SCHEMA_ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'KEKE Manager',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+995551003411',
    contactType: 'Customer Service',
    email: 'info@kekemanager.com',
    areaServed: 'GE',
    availableLanguage: ['Georgian', 'English', 'Russian'],
  },
  sameAs: [] as string[],
} as const;
