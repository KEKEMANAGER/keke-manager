import { OG_IMAGE_URL, SITE_URL, type SeoLang } from './seoMeta';
import type { BlogPost } from './blogTypes';

export type BlogSeoMeta = {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  ogType: 'article' | 'website';
  publishedTime?: string;
  modifiedTime?: string;
  author: string;
  keywords: string;
  hreflang: Record<SeoLang, string>;
};

export function blogIndexSeo(lang: SeoLang = 'ka'): BlogSeoMeta {
  const titles: Record<SeoLang, string> = {
    ka: 'KEKE Manager Blog — ტურისტული ტრანსპორტის ინსაითები',
    en: 'KEKE Manager Blog — Tourism Transport Insights',
    ru: 'KEKE Manager Blog — Туристический транспорт',
    hy: 'KEKE Manager Blog — Տուրիստական տրանսպորտ',
  };
  const descriptions: Record<SeoLang, string> = {
    ka: 'სტატიები ტუროპერატორებისთვის, მძღოლებისთვის და ფლოტის მფლობელებისთვის საქართველოში — ტრანსფერი, ფასები, B2B პლატფორმები.',
    en: 'Guides for tour operators, drivers, and fleet owners in Georgia — transfers, pricing, B2B transport software.',
    ru: 'Статьи для туроператоров, водителей и владельцев автопарка в Грузии.',
    hy: 'Հոդվածներ տուրոպերատորների, վարորդների և ֆլոտի սեփականատերերի համար։',
  };
  return {
    title: titles[lang],
    description: descriptions[lang],
    canonical: `${SITE_URL}/blog`,
    ogImage: OG_IMAGE_URL,
    ogType: 'website',
    author: 'KEKE Manager',
    keywords:
      'ტურისტული ტრანსპორტი, tour transport Georgia, B2B platform, airport transfer Tbilisi',
    hreflang: {
      ka: `${SITE_URL}/blog`,
      en: `${SITE_URL}/blog?lang=en`,
      ru: `${SITE_URL}/blog?lang=ru`,
      hy: `${SITE_URL}/blog?lang=hy`,
    },
  };
}

export function blogArticleSeo(post: BlogPost, lang: SeoLang = 'ka'): BlogSeoMeta {
  const title =
    lang === 'en'
      ? post.title_en || post.title
      : lang === 'ru'
        ? post.title_ru || post.title_en
        : lang === 'hy'
          ? post.title_en || post.title
          : post.title;
  const description =
    lang === 'en'
      ? post.description_en || post.description
      : lang === 'ru'
        ? post.description_ru || post.description_en
        : lang === 'hy'
          ? post.description_en || post.description
          : post.description;

  const canonical = `${SITE_URL}/blog/${post.slug}`;
  const ogImage = post.featuredImage.startsWith('http')
    ? post.featuredImage
    : `${SITE_URL}${post.featuredImage}`;

  return {
    title: `${title} | KEKE Manager Blog`,
    description,
    canonical,
    ogImage,
    ogType: 'article',
    publishedTime: post.date,
    modifiedTime: post.date,
    author: post.author,
    keywords: (post.keywords ?? []).join(', '),
    hreflang: {
      ka: `${SITE_URL}/blog/${post.slug}`,
      en: `${SITE_URL}/blog/${post.slug}?lang=en`,
      ru: `${SITE_URL}/blog/${post.slug}?lang=ru`,
      hy: `${SITE_URL}/blog/${post.slug}?lang=hy`,
    },
  };
}

export function blogPostingSchema(post: BlogPost, lang: SeoLang = 'ka') {
  const seo = blogArticleSeo(post, lang);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: seo.title.replace(' | KEKE Manager Blog', ''),
    image: [seo.ogImage],
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Person',
      name: post.author,
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'KEKE Manager',
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
      },
    },
    description: seo.description,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': seo.canonical,
    },
    inLanguage: lang,
    keywords: post.keywords?.join(', '),
  };
}

export function blogBreadcrumbSchema(post: BlogPost, lang: SeoLang = 'ka') {
  const title =
    lang === 'en' ? post.title_en || post.title : lang === 'ru' ? post.title_ru || post.title_en : post.title;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.categoryName,
        item: `${SITE_URL}/blog?category=${post.category}`,
      },
      { '@type': 'ListItem', position: 4, name: title, item: `${SITE_URL}/blog/${post.slug}` },
    ],
  };
}

export function blogFaqSchema(post: BlogPost) {
  if (!post.faq?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
