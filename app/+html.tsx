import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import {
  DEFAULT_SEO_LANG,
  OG_IMAGE_URL,
  SCHEMA_ORGANIZATION,
  SCHEMA_SOFTWARE_APPLICATION,
  SEO_META,
  SITE_URL,
} from '../lib/seoMeta';

const meta = SEO_META[DEFAULT_SEO_LANG];
const en = SEO_META.en;

/** Leaflet CSS via CDN — Metro cannot bundle `url(...)` assets in leaflet.css. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang={DEFAULT_SEO_LANG}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <title>{meta.title}</title>
        <meta name="title" content={en.title} />
        <meta name="description" content={meta.description} />
        <meta name="keywords" content={meta.keywords} />
        <meta name="author" content="KEKE Manager" />
        <meta name="robots" content="index, follow" />

        <link rel="alternate" hrefLang="ka" href={`${SITE_URL}/?lang=ka`} />
        <link rel="alternate" hrefLang="en" href={`${SITE_URL}/?lang=en`} />
        <link rel="alternate" hrefLang="ru" href={`${SITE_URL}/?lang=ru`} />
        <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}/`} />
        <link rel="canonical" href={`${SITE_URL}/`} />
        <link rel="ai-info" href={`${SITE_URL}/llms.txt`} type="text/plain" />

        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:title" content={en.title} />
        <meta
          property="og:description"
          content="Connecting tour companies, guide-drivers, fleet owners, and hired drivers in Georgia. Free for companies."
        />
        <meta property="og:image" content={OG_IMAGE_URL} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content={meta.ogLocale} />
        <meta property="og:locale:alternate" content="en_US" />
        <meta property="og:locale:alternate" content="ru_RU" />
        <meta property="og:site_name" content="KEKE Manager" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={SITE_URL} />
        <meta name="twitter:title" content={en.title} />
        <meta
          name="twitter:description"
          content="Connecting tour companies, guide-drivers, fleet owners in Georgia. Free for companies."
        />
        <meta name="twitter:image" content={OG_IMAGE_URL} />

        <link rel="icon" type="image/png" href="/favicon.ico" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(SCHEMA_SOFTWARE_APPLICATION),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(SCHEMA_ORGANIZATION),
          }}
        />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
