import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ArticleHero } from '../../components/blog/ArticleHero';
import { AuthorBio } from '../../components/blog/AuthorBio';
import { BlogMarkdownBody } from '../../components/blog/BlogMarkdownBody';
import { BlogSeoHead } from '../../components/blog/BlogSeoHead';
import { BlogShell } from '../../components/blog/BlogShell';
import { FaqSection } from '../../components/blog/FaqSection';
import { NewsletterSignup } from '../../components/blog/NewsletterSignup';
import { RelatedPosts } from '../../components/blog/RelatedPosts';
import { ShareButtons } from '../../components/blog/ShareButtons';
import { TableOfContents } from '../../components/blog/TableOfContents';
import { TryKekeCta } from '../../components/blog/TryKekeCta';
import { getAllSlugs, getPostBySlug, getRelatedPosts } from '../../lib/blog';
import {
  blogArticleSeo,
  blogBreadcrumbSchema,
  blogFaqSchema,
  blogPostingSchema,
} from '../../lib/blogSeoMeta';
import { useBlogLang } from '../../lib/useBlogLang';
import { LANDING, landingFont, sx } from '../../components/landing/landingTheme';
import { useLandingBreakpoint } from '../../components/landing/useLandingBreakpoint';

const COPY = {
  ka: {
    home: 'მთავარი',
    blog: 'ბლოგი',
    toc: 'სარჩევი',
    faq: 'ხშირი კითხვები',
    related: 'მსგავსი სტატიები',
    share: { copy: 'ლინკის კოპირება', whatsapp: 'WhatsApp', email: 'ელფოსტა', copied: 'დაკოპირდა' },
    ctaTitle: 'სცადეთ KEKE Manager უფასოდ',
    ctaSub: 'ტურისტული კომპანიებისთვის — ჯავშნები, GPS, ვერიფიკაცია, რეიტინგი.',
    ctaBtn: 'დაწყება →',
    newsletterTitle: 'გამოიწერეთ ბლოგი',
    newsletterSub: 'ახალი სტატიები ტურისტული ტრანსპორტის შესახებ.',
    notFound: 'სტატია ვერ მოიძებნა',
  },
  en: {
    home: 'Home',
    blog: 'Blog',
    toc: 'Table of contents',
    faq: 'FAQ',
    related: 'Related articles',
    share: { copy: 'Copy link', whatsapp: 'WhatsApp', email: 'Email', copied: 'Copied' },
    ctaTitle: 'Try KEKE Manager free',
    ctaSub: 'For tour companies — bookings, GPS, verification, ratings.',
    ctaBtn: 'Get started →',
    newsletterTitle: 'Subscribe',
    newsletterSub: 'New articles on tourist transport in Georgia.',
    notFound: 'Article not found',
  },
};

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

function ReadingProgressBar() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setPct(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (Platform.OS !== 'web') return null;
  return (
    <div className="blog-progress-track">
      <div className="blog-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function BlogArticleScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug?: string }>();
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const lang = useBlogLang();
  const copy = COPY[lang === 'en' ? 'en' : 'ka'];
  const { isDesktop } = useLandingBreakpoint();

  const post = useMemo(() => (slug ? getPostBySlug(slug, lang) : null), [slug, lang]);
  const related = useMemo(
    () => (slug ? getRelatedPosts(slug, 4, lang) : []),
    [slug, lang],
  );

  const seo = post ? blogArticleSeo(post, lang) : null;
  const schemas = post
    ? [blogPostingSchema(post, lang), blogBreadcrumbSchema(post, lang), blogFaqSchema(post)]
    : [];

  if (!slug || !post) {
    return (
      <BlogShell>
        <Text style={styles.notFound}>{copy.notFound}</Text>
        <Link href="/blog" style={sx(styles.back)}>
          <Text>← {copy.blog}</Text>
        </Link>
      </BlogShell>
    );
  }

  const showSidebarToc = Platform.OS === 'web' && isDesktop && post.toc.length > 0;
  const showInlineToc = Platform.OS === 'web' && !isDesktop && post.toc.length > 0;
  const blogListHref = lang === 'ka' ? '/blog' : `/blog?lang=${lang}`;

  return (
    <BlogShell>
      {seo ? <BlogSeoHead meta={seo} schemas={schemas} /> : null}
      <ReadingProgressBar />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.breadcrumbs}>
          <Link href="/" style={sx(styles.crumb)}>
            <Text style={styles.crumbText}>{copy.home}</Text>
          </Link>
          <Text style={styles.crumbSep}> / </Text>
          <Link href={blogListHref} style={sx(styles.crumb)}>
            <Text style={styles.crumbText}>{copy.blog}</Text>
          </Link>
          <Text style={styles.crumbSep}> / </Text>
          <Text style={styles.crumbCurrent}>{post.categoryName}</Text>
        </View>

        <ArticleHero post={post} lang={lang} />

        <View style={sx(styles.layout, showSidebarToc ? styles.layoutDesktop : styles.layoutStack)}>
          <View style={sx(styles.main, showSidebarToc ? styles.mainWithSidebar : undefined)}>
            {showInlineToc ? (
              <TableOfContents items={post.toc} title={copy.toc} variant="inline" />
            ) : null}
            <BlogMarkdownBody html={post.html} />
            <FaqSection items={post.faq} title={copy.faq} />
            <ShareButtons slug={post.slug} title={post.title} labels={copy.share} />
            <AuthorBio lang={lang} />
            <TryKekeCta title={copy.ctaTitle} subtitle={copy.ctaSub} button={copy.ctaBtn} />
            <RelatedPosts posts={related} title={copy.related} lang={lang} />
            <NewsletterSignup title={copy.newsletterTitle} subtitle={copy.newsletterSub} lang={lang} />
          </View>
          {showSidebarToc ? (
            <View style={styles.aside}>
              <TableOfContents items={post.toc} title={copy.toc} variant="sidebar" />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </BlogShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: 24, paddingBottom: 48 },
  breadcrumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 16,
  },
  crumb: { textDecorationLine: 'none' },
  crumbText: {
    ...landingFont({ fontSize: 13, color: LANDING.accent, fontWeight: '600' }),
  },
  crumbSep: {
    ...landingFont({ fontSize: 13, color: LANDING.muted }),
  },
  crumbCurrent: {
    ...landingFont({ fontSize: 13, color: LANDING.muted }),
  },
  layout: {
    width: '100%',
    alignItems: 'stretch',
  },
  layoutStack: {
    flexDirection: 'column',
  },
  layoutDesktop: {
    flexDirection: 'row',
    gap: 32,
    alignItems: 'flex-start',
  },
  main: {
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
  mainWithSidebar: {
    maxWidth: 700,
  },
  aside: {
    width: 280,
    flexShrink: 0,
    ...Platform.select({
      web: { position: 'sticky' as const, top: 80, alignSelf: 'flex-start' },
      default: {},
    }),
  } as ViewStyle,
  notFound: {
    ...landingFont({ fontSize: 18, padding: 24 }),
  },
  back: { padding: 24, textDecorationLine: 'none' },
});
