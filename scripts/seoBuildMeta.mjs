/**
 * Build-time SEO constants (keep aligned with lib/seoMeta.ts).
 */
export const SITE_URL = 'https://kekemanager.com';
export const OG_IMAGE_URL = `${SITE_URL}/og-image.jpg`;
export const OG_TITLE = 'KEKE Manager — B2B Tourism Transport Platform';
export const OG_DESCRIPTION =
  "Georgia's first B2B platform connecting tour operators and drivers. GPS tracking, bookings and digital vouchers — all in one app.";

export const HOME_SEO = {
  lang: 'ka',
  title: 'KEKE Manager — ტურ ოპერატორებისა და მძღოლების მართვის პლათფორმა | საქართველო',
  description:
    'საქართველოს პირველი B2B პლატფორმა ტურ ოპერატორებისა და მძღოლებისთვის. ჯავშნები, GPS ტრეკინგი, ციფრული ვაუჩერი, ფლოტის მართვა — ერთ აპში. ტურ კომპანიებისთვის უფასო.',
  keywords:
    'ტურ ოპერატორი საქართველო, მძღოლების მართვა, ტურისტული ტრანსპორტი, ჯავშნის პლატფორმა, GPS ტრეკინგი, B2B SaaS, თბილისი ტური, tour operator software Georgia',
};

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
};

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
    'B2B platform connecting tour companies, guide-drivers, fleet owners, and hired drivers in Georgia',
  url: SITE_URL,
  logo: OG_IMAGE_URL,
  inLanguage: ['ka', 'en', 'ru'],
};

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildHeadMeta({
  title,
  description,
  keywords,
  canonical,
  lang = 'ka',
  ogType = 'website',
  ogImage = OG_IMAGE_URL,
  extraJsonLd = [],
}) {
  const canon = canonical || SITE_URL;
  const kw = keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}" />` : '';
  const schemas = [SCHEMA_ORGANIZATION, SCHEMA_SOFTWARE_APPLICATION, ...extraJsonLd].filter(Boolean);
  const jsonLd = schemas
    .map((s, i) => `<script type="application/ld+json" id="keke-schema-${i}">${JSON.stringify(s)}</script>`)
    .join('\n    ');

  return `
    <meta name="description" content="${escapeHtml(description)}" />
    ${kw}
    <meta name="author" content="KEKE Manager" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${escapeHtml(canon)}" />
    <link rel="alternate" hreflang="ka" href="${SITE_URL}/?lang=ka" />
    <link rel="alternate" hreflang="en" href="${SITE_URL}/?lang=en" />
    <link rel="alternate" hreflang="ru" href="${SITE_URL}/?lang=ru" />
    <link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />
    <meta property="og:type" content="${escapeHtml(ogType)}" />
    <meta property="og:url" content="${escapeHtml(canon)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="KEKE Manager" />
    <meta property="og:locale" content="${lang === 'en' ? 'en_US' : lang === 'ru' ? 'ru_RU' : 'ka_GE'}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
    ${jsonLd}`.trim();
}

const PRERENDER_CSS = `
body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fff;color:#111;line-height:1.6}
a{color:#EF9F27}
.keke-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #eee;max-width:960px;margin:0 auto}
.keke-logo{font-weight:900;font-size:18px;color:#111;text-decoration:none}
.keke-nav a{margin-left:16px;color:#444;text-decoration:none;font-weight:600}
.keke-main{max-width:720px;margin:0 auto;padding:32px 24px 48px}
.keke-main h1{font-size:1.75rem;line-height:1.25;margin:0 0 16px}
.keke-main h2{font-size:1.25rem;margin:28px 0 12px}
.keke-main p,.keke-main li{margin:0 0 12px}
.keke-main ul{padding-left:1.25rem}
.keke-cta{margin-top:32px;padding:20px;background:#faf6ef;border-radius:12px;border:1px solid #f0e4cc}
.keke-cta a{display:inline-block;margin-top:8px;padding:12px 20px;background:#EF9F27;color:#111;font-weight:700;text-decoration:none;border-radius:8px}
.keke-footer{text-align:center;padding:24px;color:#888;font-size:14px;border-top:1px solid #eee;margin-top:48px}
`.trim();

export function buildStaticHtmlPage({ title, description, keywords, canonical, lang, bodyHtml, ogType, ogImage }) {
  const headMeta = buildHeadMeta({
    title,
    description,
    keywords,
    canonical,
    lang,
    ogType,
    ogImage,
  });

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${headMeta}
  <link rel="icon" href="/favicon.ico" />
  <style>${PRERENDER_CSS}</style>
</head>
<body>
  <header class="keke-header">
    <a class="keke-logo" href="/">KEKE Manager</a>
    <nav class="keke-nav" aria-label="Main">
      <a href="/blog">ბლოგი</a>
      <a href="/sign-in">შესვლა</a>
      <a href="/sign-up">რეგისტრაცია</a>
    </nav>
  </header>
  <main class="keke-main">
    ${bodyHtml}
    <div class="keke-cta">
      <strong>სცადეთ KEKE Manager უფასოდ</strong>
      <p style="margin:8px 0 0">ტურ კომპანიებისთვის — ჯავშნები, GPS, ვერიფიცირებული მძღოლები, ციფრული ვაუჩერი.</p>
      <a href="/sign-up">დაწყება →</a>
    </div>
  </main>
  <footer class="keke-footer">© KEKE Manager · B2B ტურისტული ტრანსპორტი · საქართველო</footer>
</body>
</html>`;
}

export function buildHomeNoscript() {
  return `<noscript>
  <main style="max-width:720px;margin:40px auto;padding:0 24px;font-family:system-ui,sans-serif">
    <h1>${escapeHtml(HOME_SEO.title)}</h1>
    <p>${escapeHtml(HOME_SEO.description)}</p>
    <p><a href="/sign-up">უფასო რეგისტრაცია</a> · <a href="/blog">ბლოგი</a> · <a href="/sign-in">შესვლა</a></p>
  </main>
</noscript>`;
}
