import type { BlogLang } from './blogTypes';
import type { LandingLangCode } from './landingLanguages';

/** Blog UI + SEO langs (article HTML may still fall back to en/ka). */
export type BlogUiLang = BlogLang;

export const BLOG_UI_COPY = {
  ka: {
    hero: 'KEKE Manager Blog',
    sub: 'ტურისტული ტრანსპორტის ინსაითები ტუროპერატორებისთვის, მძღოლებისთვის და ფლოტის მფლობელებისთვის საქართველოში.',
    search: 'ძებნა სტატიებში...',
    shown: 'ნაჩვენებია',
    newsletterTitle: 'გამოიწერეთ ახალი სტატიები',
    newsletterSub: 'იღებთ პრაქტიკულ რჩევებს ტურისტული ტრანსპორტის შესახებ.',
    ctaTitle: 'სცადეთ KEKE Manager უფასოდ',
    ctaSub: 'ტურისტული კომპანიებისთვის უფასო — ჯავშნები, GPS, რეიტინგი.',
    ctaBtn: 'დაწყება →',
    prev: 'წინა',
    next: 'შემდეგი',
  },
  en: {
    hero: 'KEKE Manager Blog',
    sub: 'Tourism transport insights for tour operators, drivers, and fleet owners in Georgia.',
    search: 'Search articles...',
    shown: 'Showing',
    newsletterTitle: 'Subscribe to new articles',
    newsletterSub: 'Practical guides on tourist transport and B2B platforms.',
    ctaTitle: 'Try KEKE Manager free',
    ctaSub: 'Free for tour companies — bookings, GPS, ratings.',
    ctaBtn: 'Get started →',
    prev: 'Previous',
    next: 'Next',
  },
  ru: {
    hero: 'KEKE Manager Blog',
    sub: 'Инсайты туристического транспорта для туроператоров, водителей и владельцев автопарка в Грузии.',
    search: 'Поиск статей...',
    shown: 'Показано',
    newsletterTitle: 'Подписка на новые статьи',
    newsletterSub: 'Практические советы по туристическому транспорту и B2B-платформам.',
    ctaTitle: 'Попробуйте KEKE Manager бесплатно',
    ctaSub: 'Бесплатно для туркомпаний — бронирования, GPS, рейтинги.',
    ctaBtn: 'Начать →',
    prev: 'Назад',
    next: 'Далее',
  },
  hy: {
    hero: 'KEKE Manager Blog',
    sub: 'Տուրիստական տրանսպորտի ինսայթներ տուրոպերատորների, վարորդների և ֆլոտի սեփականատերերի համար։',
    search: 'Որոնել հոդվածներում…',
    shown: 'Ցուցադրված',
    newsletterTitle: 'Բաժանորդագրվել նոր հոդվածներին',
    newsletterSub: 'Պրակտիկ խորհուրդներ տուրիստական տրանսպորտի և B2B հարթակների մասին։',
    ctaTitle: 'Փորձեք KEKE Manager-ը անվճար',
    ctaSub: 'Անվճար տուրիստական ընկերությունների համար — ամրագրումներ, GPS, վարկանիշներ։',
    ctaBtn: 'Սկսել →',
    prev: 'Նախորդ',
    next: 'Հաջորդ',
  },
} as const satisfies Record<BlogUiLang, Record<string, string>>;

export function blogUiLangFromLanding(code: LandingLangCode): BlogUiLang {
  if (code === 'ka' || code === 'en' || code === 'ru' || code === 'hy') return code;
  return 'en';
}

/** Which manifest HTML field to use for article body. */
export function blogContentLang(code: LandingLangCode): 'ka' | 'en' | 'ru' {
  if (code === 'ka') return 'ka';
  if (code === 'ru') return 'ru';
  return 'en';
}

export function getBlogUiCopy(code: LandingLangCode) {
  return BLOG_UI_COPY[blogUiLangFromLanding(code)];
}

export const BLOG_ARTICLE_UI = {
  ka: {
    home: 'მთავარი',
    blog: 'ბლოგი',
    toc: 'სარჩევი',
    faq: 'ხშირი კითხვები',
    related: 'მსგავსი სტატიები',
    share: { copy: 'ლინკის კოპირება', whatsapp: 'WhatsApp', email: 'ელფოსტა', copied: 'დაკოპირდა' },
    notFound: 'სტატია ვერ მოიძებნა',
  },
  en: {
    home: 'Home',
    blog: 'Blog',
    toc: 'Table of contents',
    faq: 'FAQ',
    related: 'Related articles',
    share: { copy: 'Copy link', whatsapp: 'WhatsApp', email: 'Email', copied: 'Copied' },
    notFound: 'Article not found',
  },
  ru: {
    home: 'Главная',
    blog: 'Блог',
    toc: 'Содержание',
    faq: 'FAQ',
    related: 'Похожие статьи',
    share: { copy: 'Копировать ссылку', whatsapp: 'WhatsApp', email: 'Email', copied: 'Скопировано' },
    notFound: 'Статья не найдена',
  },
  hy: {
    home: 'Գլխավոր',
    blog: 'Բլոգ',
    toc: 'Բովանդակություն',
    faq: 'Հաճախակի հարցեր',
    related: 'Նման հոդվածներ',
    share: { copy: 'Պատճենել հղումը', whatsapp: 'WhatsApp', email: 'Email', copied: 'Պատճենվեց' },
    notFound: 'Հոդվածը չի գտնվել',
  },
} as const satisfies Record<BlogUiLang, Record<string, unknown>>;

export function getBlogArticleUi(lang: BlogUiLang) {
  const base = BLOG_UI_COPY[lang];
  const article = BLOG_ARTICLE_UI[lang];
  return { ...base, ...article };
}
