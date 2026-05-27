import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { BlogSeoMeta } from '../../lib/blogSeoMeta';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string, hreflang?: string) {
  if (typeof document === 'undefined') return;
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    document.head.appendChild(el);
  }
  el.href = href;
}

function setJsonLd(id: string, data: object | null) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

type Props = {
  meta: BlogSeoMeta;
  schemas?: (object | null)[];
};

export function BlogSeoHead({ meta, schemas = [] }: Props) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    document.title = meta.title;
    setMeta('name', 'description', meta.description);
    setMeta('name', 'keywords', meta.keywords);
    setMeta('name', 'robots', 'index, follow');
    setLink('canonical', meta.canonical);

    setMeta('property', 'og:type', meta.ogType);
    setMeta('property', 'og:url', meta.canonical);
    setMeta('property', 'og:title', meta.title);
    setMeta('property', 'og:description', meta.description);
    setMeta('property', 'og:image', meta.ogImage);
    setMeta('property', 'og:site_name', 'KEKE Manager');

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', meta.title);
    setMeta('name', 'twitter:description', meta.description);
    setMeta('name', 'twitter:image', meta.ogImage);

    if (meta.publishedTime) {
      setMeta('property', 'article:published_time', meta.publishedTime);
    }
    if (meta.modifiedTime) {
      setMeta('property', 'article:modified_time', meta.modifiedTime);
    }
    setMeta('property', 'article:author', meta.author);

    setLink('alternate', meta.hreflang.ka, 'ka');
    setLink('alternate', meta.hreflang.en, 'en');
    setLink('alternate', meta.hreflang.ru, 'ru');
    setLink('alternate', meta.hreflang.ka, 'x-default');

    schemas.forEach((schema, i) => {
      setJsonLd(`blog-schema-${i}`, schema);
    });

    return () => {
      schemas.forEach((_, i) => setJsonLd(`blog-schema-${i}`, null));
    };
  }, [meta, schemas]);

  return null;
}
