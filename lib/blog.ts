import manifest from './generated/blogManifest.json';
import type { BlogCategory, BlogCategoryId, BlogLang, BlogPost } from './blogTypes';
import { BLOG_CATEGORIES } from './blogTypes';

type Manifest = {
  generatedAt: string;
  posts: BlogPost[];
};

const data = manifest as Manifest;
const allPosts: BlogPost[] = data.posts ?? [];

function postLang(post: BlogPost, lang?: BlogLang): BlogPost {
  if (!lang || lang === 'ka') return post;
  if (lang === 'en') {
    return {
      ...post,
      title: post.title_en || post.title,
      description: post.description_en || post.description,
      excerpt: post.excerpt_en || post.excerpt,
    };
  }
  return {
    ...post,
    title: post.title_ru || post.title_en || post.title,
    description: post.description_ru || post.description_en || post.description,
    excerpt: post.excerpt_en || post.excerpt,
  };
}

export function getAllPosts(language?: BlogLang): BlogPost[] {
  return allPosts.map((p) => postLang(p, language));
}

export function getPostBySlug(slug: string, language?: BlogLang): BlogPost | null {
  const post = allPosts.find((p) => p.slug === slug);
  return post ? postLang(post, language) : null;
}

export function getRelatedPosts(slug: string, limit = 4, language?: BlogLang): BlogPost[] {
  const current = allPosts.find((p) => p.slug === slug);
  if (!current) return getAllPosts(language).slice(0, limit);

  const relatedSlugs = new Set(current.related ?? []);
  const picked: BlogPost[] = [];

  for (const s of relatedSlugs) {
    const p = allPosts.find((x) => x.slug === s);
    if (p) picked.push(postLang(p, language));
    if (picked.length >= limit) return picked;
  }

  for (const p of allPosts) {
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
  return allPosts.map((p) => p.slug);
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

export function categoryLabel(
  categoryId: BlogCategoryId,
  lang: BlogLang = 'ka',
): string {
  const cat = BLOG_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return categoryId;
  return lang === 'ka' ? cat.nameKa : cat.name;
}
