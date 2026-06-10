import { Link, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArticleCard } from '../../components/blog/ArticleCard';
import { BlogSeoHead } from '../../components/blog/BlogSeoHead';
import { BlogShell } from '../../components/blog/BlogShell';
import { CategoryFilter } from '../../components/blog/CategoryFilter';
import { NewsletterSignup } from '../../components/blog/NewsletterSignup';
import { TryKekeCta } from '../../components/blog/TryKekeCta';
import { getAllPosts, paginatePosts, searchPosts } from '../../lib/blog';
import { useBlogManifestReady } from '../../lib/BlogManifestProvider';
import { blogIndexSeo } from '../../lib/blogSeoMeta';
import type { BlogCategoryId } from '../../lib/blogTypes';
import { useBlogLang } from '../../lib/useBlogLang';
import { LANDING, landingFont, sx } from '../../components/landing/landingTheme';

const PER_PAGE = 12;

const COPY = {
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
};

export default function BlogIndexScreen() {
  const params = useLocalSearchParams<{ category?: string; page?: string }>();
  const lang = useBlogLang();
  const copy = lang === 'en' ? COPY.en : COPY.ka;
  const { version: manifestVersion } = useBlogManifestReady();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<BlogCategoryId | 'all'>(
    (params.category as BlogCategoryId) || 'all',
  );
  const page = Math.max(1, Number(params.page) || 1);

  const filtered = useMemo(() => {
    let posts = getAllPosts(lang);
    if (category !== 'all') posts = posts.filter((p) => p.category === category);
    if (query.trim()) posts = searchPosts(query, lang).filter((p) => category === 'all' || p.category === category);
    return posts;
  }, [lang, category, query, manifestVersion]);

  const { items, totalPages, page: safePage } = paginatePosts(filtered, page, PER_PAGE);
  const seo = blogIndexSeo(lang);

  return (
    <BlogShell>
      <BlogSeoHead meta={seo} />
      <View style={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{copy.hero}</Text>
          <Text style={styles.heroSub}>{copy.sub}</Text>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={copy.search}
          placeholderTextColor={LANDING.muted}
          style={styles.search}
        />

        <CategoryFilter active={category} onChange={setCategory} lang={lang} />

        <Text style={styles.count}>
          {copy.shown} {items.length} / {filtered.length}
        </Text>

        <View style={styles.grid}>
          {items.map((post) => (
            <View key={post.slug} style={styles.cell}>
              <ArticleCard post={post} lang={lang} />
            </View>
          ))}
        </View>

        {totalPages > 1 ? (
          <View style={styles.pager}>
            {safePage > 1 ? (
              <Link href={`/blog?page=${safePage - 1}`} style={sx(styles.pageBtn)}>
                <Text>{copy.prev}</Text>
              </Link>
            ) : null}
            <Text style={styles.pageNum}>
              {safePage} / {totalPages}
            </Text>
            {safePage < totalPages ? (
              <Link href={`/blog?page=${safePage + 1}`} style={sx(styles.pageBtn)}>
                <Text>{copy.next}</Text>
              </Link>
            ) : null}
          </View>
        ) : null}

        <TryKekeCta title={copy.ctaTitle} subtitle={copy.ctaSub} button={copy.ctaBtn} />
        <NewsletterSignup title={copy.newsletterTitle} subtitle={copy.newsletterSub} lang={lang} />
      </View>
    </BlogShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: 24, paddingBottom: 48 },
  hero: { marginBottom: 24 },
  heroTitle: {
    ...landingFont({ fontSize: 36, fontWeight: '800', color: LANDING.text }),
    marginBottom: 8,
  },
  heroSub: {
    ...landingFont({ fontSize: 16, lineHeight: 24, color: LANDING.muted }),
    maxWidth: 720,
  },
  search: {
    borderWidth: 1,
    borderColor: LANDING.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    ...landingFont({ fontSize: 16, color: LANDING.text }),
    minHeight: 48,
  },
  count: {
    ...landingFont({ fontSize: 13, color: LANDING.muted }),
    marginVertical: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  cell: {
    flexBasis: Platform.OS === 'web' ? 320 : '100%',
    flexGrow: 1,
    maxWidth: '100%',
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 24,
  },
  pageBtn: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: LANDING.border,
    textDecorationLine: 'none',
  },
  pageNum: {
    ...landingFont({ fontSize: 14, fontWeight: '600' }),
  },
});
