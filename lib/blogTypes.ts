export type BlogLang = 'ka' | 'en' | 'ru';

export type BlogCategoryId =
  | 'tour-operators'
  | 'drivers'
  | 'hosts'
  | 'routes'
  | 'tourism-trends';

export type BlogFaqItem = {
  question: string;
  answer: string;
};

export type BlogPostFrontmatter = {
  slug: string;
  title: string;
  title_en: string;
  title_ru?: string;
  description: string;
  description_en: string;
  description_ru?: string;
  keywords: string[];
  date: string;
  author: string;
  category: BlogCategoryId;
  categoryName: string;
  readingTime: number;
  featuredImage: string;
  language: BlogLang;
  faq: BlogFaqItem[];
  related: string[];
};

export type BlogTocItem = {
  id: string;
  level: 2 | 3;
  text: string;
};

export type BlogPost = BlogPostFrontmatter & {
  excerpt: string;
  excerpt_en: string;
  html: string;
  toc: BlogTocItem[];
  wordCount: number;
};

export type BlogCategory = {
  id: BlogCategoryId;
  name: string;
  nameKa: string;
};

export const BLOG_CATEGORIES: BlogCategory[] = [
  { id: 'tour-operators', name: 'Tour Operators', nameKa: 'ტუროპერატორები' },
  { id: 'drivers', name: 'Drivers', nameKa: 'მძღოლები' },
  { id: 'hosts', name: 'Hosts & Fleet', nameKa: 'ჰოსტები და ფლოტი' },
  { id: 'routes', name: 'Routes & Destinations', nameKa: 'მარშრუტები' },
  { id: 'tourism-trends', name: 'Tourism Trends', nameKa: 'ტურიზმის ტენდენციები' },
];

export const BLOG_AUTHOR = {
  name: 'Akaki Kachibaia',
  title: 'Founder, KEKE Manager',
  bio: 'Akaki Kachibaia is the founder of KEKE Manager — a B2B platform connecting tour companies, guide-drivers, and fleet owners across Georgia.',
  bioKa:
    'აკაკი კაჩიბაია არის KEKE Manager-ის დამფუძნებელი — B2B პლატფორმა, რომელიც აერთიანებს ტურისტულ კომპანიებს, გიდ-მძღოლებსა და ფლოტის მფლობელებს საქართველოში.',
};
