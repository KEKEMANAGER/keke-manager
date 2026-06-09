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

export const HOME_FAQ = [
  {
    question: 'რა არის KEKE Manager?',
    answer:
      'KEKE Manager არის B2B პლატფორმა ტურ ოპერატორებისა და პროფესიონალური მძღოლებისთვის საქართველოში. ჯავშნები, GPS ტრეკინგი, ციფრული ვაუჩერი და ფლოტის მართვა ერთ სისტემაში.',
  },
  {
    question: 'ვისთვისაა განკუთვნილი?',
    answer:
      'ტურისტული კომპანიებისთვის, გიდ-მძღოლებისთვის, ფლოტის მფლობელებისთვის (ჰოსტები) და მძღოლებისთვის, ვისაც სამსახური ეძებს. ტრანსფერები, ერთდღიანი და მრავალდღიანი ტურები.',
  },
  {
    question: 'უფასოა თუ არა ტურ კომპანიებისთვის?',
    answer: 'დიახ — ტურისტული კომპანიებისთვის რეგისტრაცია და ჯავშნების მართვა უფასოა.',
  },
  {
    question: 'რა ფუნქციები აქვს?',
    answer:
      'რეალურ დროში GPS, PDF ვაუჩერი, სამმხრივი ჩატი, მძღოლების რეიტინგი, ვერიფიკაცია, 33 ენა და ოდომეტრის ფოტო ტურის დასაწყისსა და დასასრულს.',
  },
];

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

export const SCHEMA_WEBSITE = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'KEKE Manager',
  url: SITE_URL,
  inLanguage: ['ka', 'en', 'ru'],
  publisher: { '@type': 'Organization', name: 'KEKE Manager', url: SITE_URL },
};

export function buildFaqSchema(faqItems) {
  if (!faqItems?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function buildBlogPostingSchema(post) {
  const canonical = `${SITE_URL}/blog/${post.slug}`;
  const ogImage = post.featuredImage?.startsWith('http')
    ? post.featuredImage
    : `${SITE_URL}${post.featuredImage || '/og-image.jpg'}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    image: [ogImage],
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Person', name: post.author || 'KEKE Manager', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'KEKE Manager',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
    },
    description: post.description || post.excerpt || '',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: 'ka',
    keywords: (post.keywords ?? []).join(', '),
  };
}

export function buildBlogBreadcrumbSchema(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'ბლოგი', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/blog/${post.slug}` },
    ],
  };
}

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
  includeDefaultSchemas = true,
  includeHomeHreflang = false,
  articlePublished,
  articleModified,
}) {
  const canon = canonical || SITE_URL;
  const kw = keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}" />` : '';
  const baseSchemas = includeDefaultSchemas ? [SCHEMA_ORGANIZATION] : [];
  if (includeDefaultSchemas && ogType === 'website' && canon.replace(/\/$/, '') === SITE_URL) {
    baseSchemas.push(SCHEMA_SOFTWARE_APPLICATION);
  }
  const schemas = [...baseSchemas, ...extraJsonLd].filter(Boolean);
  const jsonLd = schemas
    .map((s, i) => `<script type="application/ld+json" id="keke-schema-${i}">${JSON.stringify(s)}</script>`)
    .join('\n    ');

  const hreflang = includeHomeHreflang
    ? `
    <link rel="alternate" hreflang="ka" href="${SITE_URL}/?lang=ka" />
    <link rel="alternate" hreflang="en" href="${SITE_URL}/?lang=en" />
    <link rel="alternate" hreflang="ru" href="${SITE_URL}/?lang=ru" />
    <link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />`
    : '';

  const articleMeta =
    ogType === 'article'
      ? `
    <meta property="article:published_time" content="${escapeHtml(articlePublished || '')}" />
    <meta property="article:modified_time" content="${escapeHtml(articleModified || articlePublished || '')}" />`
      : '';

  return `
    <meta name="description" content="${escapeHtml(description)}" />
    ${kw}
    <meta name="author" content="KEKE Manager" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${escapeHtml(canon)}" />${hreflang}
    <meta property="og:type" content="${escapeHtml(ogType)}" />
    <meta property="og:url" content="${escapeHtml(canon)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="KEKE Manager" />
    <meta property="og:locale" content="${lang === 'en' ? 'en_US' : lang === 'ru' ? 'ru_RU' : 'ka_GE'}" />${articleMeta}
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
.keke-main h3{font-size:1.05rem;margin:20px 0 8px}
.keke-main p,.keke-main li{margin:0 0 12px}
.keke-main ul{padding-left:1.25rem}
.keke-post-list{list-style:none;padding:0;margin:24px 0}
.keke-post-list li{margin:0 0 16px;padding-bottom:16px;border-bottom:1px solid #eee}
.keke-post-list a{font-weight:700;color:#111;text-decoration:none}
.keke-post-list a:hover{color:#EF9F27}
.keke-cta{margin-top:32px;padding:20px;background:#faf6ef;border-radius:12px;border:1px solid #f0e4cc}
.keke-cta a{display:inline-block;margin-top:8px;padding:12px 20px;background:#EF9F27;color:#111;font-weight:700;text-decoration:none;border-radius:8px}
.keke-footer{text-align:center;padding:24px;color:#888;font-size:14px;border-top:1px solid #eee;margin-top:48px}
.keke-faq dt{font-weight:700;margin-top:16px}
.keke-faq dd{margin:4px 0 0;padding:0}
`.trim();

export function buildStaticHtmlPage({
  title,
  description,
  keywords,
  canonical,
  lang,
  bodyHtml,
  ogType,
  ogImage,
  extraJsonLd = [],
  includeDefaultSchemas = true,
  articlePublished,
  articleModified,
}) {
  const headMeta = buildHeadMeta({
    title,
    description,
    keywords,
    canonical,
    lang,
    ogType,
    ogImage,
    extraJsonLd,
    includeDefaultSchemas,
    articlePublished,
    articleModified,
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

export function buildHomeStaticBodyHtml() {
  const faqHtml = HOME_FAQ.map(
    (item) => `<dt>${escapeHtml(item.question)}</dt><dd>${escapeHtml(item.answer)}</dd>`,
  ).join('');

  return `
    <h1>${escapeHtml(HOME_SEO.title)}</h1>
    <p>${escapeHtml(HOME_SEO.description)}</p>
    <h2>ერთი პლატფორმა, უსაზღვრო შესაძებლობები</h2>
    <p>ტურისტული კომპანიები, გიდ-მძღოლები, ფლოტის მფლობელები და მძღოლები — ერთ B2B ეკოსისტემაში საქართველოში.</p>
    <h2>4 როლი, ერთი პლატფორმა</h2>
    <ul>
      <li><strong>ტურისტული კომპანია</strong> — ჯავშნები, მძღოლის არჩევა, GPS, ვაუჩერი, ჩატი</li>
      <li><strong>გიდ-მძღოლი</strong> — საკუთარი ავტომობილი + გიდი, ენები, ტურები</li>
      <li><strong>ჰოსტი</strong> — საკუთარი ფლოტი და მძღოლების მართვა</li>
      <li><strong>მძღოლი</strong> — სამსახურის ძიება ჰოსტებთან</li>
    </ul>
    <h2>სერვისები</h2>
    <ul>
      <li><strong>ტრანსფერი</strong> — აეროპორტი, სასტუმრო, ფიქსირებული ფასი</li>
      <li><strong>ერთდღიანი ტური</strong> — გაჩერებები, გიდ-მძღოლი, ვაუჩერი</li>
      <li><strong>მრავალდღიანი ტური</strong> — კალენდარი, სასტუმროები, სრული მარშრუტი</li>
    </ul>
    <h2>ფუნქციები</h2>
    <ul>
      <li>Real-time GPS ტრეკინგი</li>
      <li>PDF / ციფრული ვაუჩერი</li>
      <li>სამმხრივი ჩატი (კომპანია, ჰოსტი, მძღოლი)</li>
      <li>ვერიფიცირებული მძღოლები და რეიტინგი</li>
      <li>33 ენა</li>
    </ul>
    <h2>ხშირი კითხვები</h2>
    <dl class="keke-faq">${faqHtml}</dl>
    <p>
      <a href="/sign-up">უფასო რეგისტრაცია</a> ·
      <a href="/blog">ბლოგი</a> ·
      <a href="/services/airport-transfer">აეროპორტის ტრანსფერი</a> ·
      <a href="/locations/tbilisi">მძღოლები თბილისში</a>
    </p>`;
}

export function buildHomeNoscript() {
  return `<noscript>${buildHomeStaticBodyHtml().replace(/class="keke-faq"/g, '')}</noscript>`;
}
