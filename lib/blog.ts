import { Platform } from 'react-native';
import bundledManifest from './generated/blogManifest.json';
import type { BlogCategory, BlogLang, BlogPost } from './blogTypes';
import { BLOG_CATEGORIES, categoryLabel } from './blogTypes';

type Manifest = {
  generatedAt: string;
  posts: BlogPost[];
};

let manifestData = bundledManifest as Manifest;

function allPostsRaw(): BlogPost[] {
  return manifestData.posts ?? [];
}

/** On web, load /blogManifest.json so new posts work without rebundling the JS entry. */
export async function hydrateBlogManifestFromWeb(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof fetch === 'undefined') return false;

  try {
    const res = await fetch('/blogManifest.json', { cache: 'no-store' });
    if (!res.ok) return false;

    const remote = (await res.json()) as Manifest;
    if (!Array.isArray(remote.posts) || remote.posts.length === 0) return false;

    const bundledAt = manifestData.generatedAt ?? '';
    const remoteAt = remote.generatedAt ?? '';
    const bundledCount = allPostsRaw().length;
    const shouldUseRemote =
      remote.posts.length > bundledCount ||
      (remoteAt && (!bundledAt || remoteAt >= bundledAt));

    if (!shouldUseRemote) return false;

    manifestData = remote;
    return true;
  } catch {
    return false;
  }
}

function localizedHtml(post: BlogPost, lang: BlogLang): string {
  if (lang === 'en' && post.html_en?.trim()) return post.html_en;
  if ((lang === 'ru' || lang === 'hy') && post.html_en?.trim()) return post.html_en;
  return post.html;
}

function localizedToc(post: BlogPost, lang: BlogLang): BlogPost['toc'] {
  if (lang === 'en' && post.toc_en?.length) return post.toc_en;
  if ((lang === 'ru' || lang === 'hy') && post.toc_en?.length) return post.toc_en;
  return post.toc;
}

function postLang(post: BlogPost, lang?: BlogLang): BlogPost {
  if (!lang || lang === 'ka') {
    return {
      ...post,
      categoryName: categoryLabel(post.category, 'ka'),
    };
  }
  if (lang === 'en' || lang === 'hy') {
    return {
      ...post,
      title: post.title_en || post.title,
      description: post.description_en || post.description,
      excerpt: post.excerpt_en || post.excerpt,
      html: localizedHtml(post, lang),
      toc: localizedToc(post, lang),
      categoryName: categoryLabel(post.category, lang),
    };
  }
  return {
    ...post,
    title: post.title_ru || post.title_en || post.title,
    description: post.description_ru || post.description_en || post.description,
    excerpt: post.excerpt_en || post.excerpt,
    html: localizedHtml(post, 'ru'),
    toc: localizedToc(post, 'ru'),
    categoryName: categoryLabel(post.category, 'ru'),
  };
}

export function getAllPosts(language?: BlogLang): BlogPost[] {
  return allPostsRaw().map((p) => postLang(p, language));
}

export function getPostBySlug(slug: string, language?: BlogLang): BlogPost | null {
  const post = allPostsRaw().find((p) => p.slug === slug);
  return post ? postLang(post, language) : null;
}

export function getRelatedPosts(slug: string, limit = 4, language?: BlogLang): BlogPost[] {
  const posts = allPostsRaw();
  const current = posts.find((p) => p.slug === slug);
  if (!current) return getAllPosts(language).slice(0, limit);

  const relatedSlugs = new Set(current.related ?? []);
  const picked: BlogPost[] = [];

  for (const s of relatedSlugs) {
    const p = posts.find((x) => x.slug === s);
    if (p) picked.push(postLang(p, language));
    if (picked.length >= limit) return picked;
  }

  for (const p of posts) {
    if (p.slug === slug) continue;
    if (p.category === current.category) {
      picked.push(postLang(p, language));
    }
    if (picked.length >= limit) break;
  }

  return picked.slice(0, limit);
}

export function getPostsByCategory(category: string, language?: BlogLang): BlogPost[] {
  return getAllPosts(language).filter((p) => p.category === category);
}

export function getCategories(): BlogCategory[] {
  return BLOG_CATEGORIES;
}

export function searchPosts(query: string, language?: BlogLang): BlogPost[] {
  const q = query.trim().toLowerCase();
  if (!q) return getAllPosts(language);
  return getAllPosts(language).filter((p) => {
    const hay = [
      p.title,
      p.title_en,
      p.description,
      p.description_en,
      p.excerpt,
      ...(p.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function getAllSlugs(): string[] {
  return allPostsRaw().map((p) => p.slug);
}

export function paginatePosts(
  posts: BlogPost[],
  page: number,
  perPage: number,
): { items: BlogPost[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    items: posts.slice(start, start + perPage),
    totalPages,
    page: safePage,
  };
}

export { categoryLabel } from './blogTypes';
