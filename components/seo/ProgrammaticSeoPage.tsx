import { Link } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dismissLcpShell } from '../../lib/lcpShell';
import { getSeoBlogLinkTitle } from '../../lib/seoRelatedBlog';
import {
  seoLandingBreadcrumbSchema,
  seoLandingLocalBusinessSchema,
  seoLandingMeta,
  seoLandingServiceSchema,
  seoLandingWebPageSchema,
} from '../../lib/seoLandingMeta';
import {
  SEO_DRIVER_COUNT,
  type SeoLandingLang,
  type SeoLandingPage,
} from '../../lib/seoLandingPages';
import { sx } from '../../lib/sx';
import { BlogSeoHead } from '../blog/BlogSeoHead';
import { SeoLandingShell } from './SeoLandingShell';
import { SEO_THEME, seoFont } from './seoTheme';

const UI = {
  ka: {
    badge: 'B2B პლატფორმა · ტრანსპორტს ჩვენ არ ვაწვდით',
    drivers: `დაუკავშირდით ${SEO_DRIVER_COUNT} ვერიფიცირებულ მძღოლს მთელ საქართველოში`,
    audiences: 'ვისთვისაა',
    platform: 'რას აკეთებს KEKE Manager',
    platformBullets: [
      'ტუროკომპანიები მართავენ ფლოტს, ჯავშნებს და GPS-ს ერთ დაფაზე',
      'სააგენტოები პოულობენ სანდო ტრანსპორტის პარტნიორებს ვერიფიცირებულ აუზში',
      'მძღოლები უერთდებიან პლატფორმას და იღებენ შეთავაზებებს კომპანიებისგან',
    ],
    related: 'სასარგებლო სტატიები',
    ctaTitle: 'დარეგისტრირდით KEKE Manager-ზე უფასოდ',
    ctaSub: 'ტუროკომპანიებისთვის უფასო — იპოვეთ მძღოლები, მართეთ ფლოტი, გაუშვით ჯავშნები.',
    ctaBtn: 'დაწყება →',
    signUp: 'რეგისტრაცია',
  },
  en: {
    badge: 'B2B platform · We do not provide transport directly',
    drivers: `Connect with ${SEO_DRIVER_COUNT} verified drivers across Georgia`,
    audiences: 'Who it is for',
    platform: 'What KEKE Manager does',
    platformBullets: [
      'Tour companies manage fleet, bookings, and GPS in one dashboard',
      'Agencies find reliable transport partners in a verified driver pool',
      'Drivers join the platform and receive trip offers from companies',
    ],
    related: 'Related guides',
    ctaTitle: 'Sign up on KEKE Manager — free for tour companies',
    ctaSub: 'Find verified drivers, manage your fleet, and run bookings on one B2B platform.',
    ctaBtn: 'Get started →',
    signUp: 'Sign up free',
  },
};

type Props = {
  page: SeoLandingPage;
  kind: 'location' | 'service';
  lang: SeoLandingLang;
  onToggleLang: () => void;
  siblingLinks: { href: string; label: string }[];
  siblingTitle: string;
};

export function ProgrammaticSeoPage({
  page,
  kind,
  lang,
  onToggleLang,
  siblingLinks,
  siblingTitle,
}: Props) {
  const ui = UI[lang];

  useEffect(() => {
    dismissLcpShell();
  }, []);

  const meta = seoLandingMeta(page, kind, lang);
  const h1 = page.h1[lang];
  const h1Alt = lang === 'ka' ? page.h1.en : page.h1.ka;
  const intro = page.intro[lang];
  const bullets = page.bullets[lang];
  const related = page.relatedBlog
    .map((slug) => {
      const title = getSeoBlogLinkTitle(slug, lang);
      return title ? { slug, title } : null;
    })
    .filter(Boolean) as { slug: string; title: string }[];

  const schemas = [
    seoLandingLocalBusinessSchema(),
    seoLandingServiceSchema(page, kind, lang),
    seoLandingWebPageSchema(page, kind, lang),
    seoLandingBreadcrumbSchema(page, kind, lang),
  ];

  return (
    <SeoLandingShell lang={lang} onToggleLang={onToggleLang}>
      <BlogSeoHead
        meta={{
          title: meta.title,
          description: meta.description,
          canonical: meta.canonical,
          ogImage: meta.ogImage,
          ogType: 'website',
          author: 'KEKE Manager',
          keywords: meta.keywords,
          hreflang: {
            ka: meta.hreflang.ka,
            en: meta.hreflang.en,
            ru: meta.hreflang.en,
            hy: meta.hreflang.en,
          },
        }}
        schemas={schemas}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.badge}>{ui.badge}</Text>
        <Text style={styles.h1}>{h1}</Text>
        <Text style={styles.h1Alt}>{h1Alt}</Text>
        <Text style={styles.drivers}>{ui.drivers}</Text>
        <Text style={styles.intro}>{intro}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ui.audiences}</Text>
          {bullets.map((b) => (
            <View key={b} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{ui.platform}</Text>
          {ui.platformBullets.map((b) => (
            <View key={b} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>

        {Platform.OS === 'web' ? (
          <Link href="/sign-up" style={sx(styles.heroCta)}>
            <Text style={styles.heroCtaText}>{ui.signUp}</Text>
          </Link>
        ) : (
          <Link href="/sign-up" asChild>
            <Pressable style={styles.heroCta}>
              <Text style={styles.heroCtaText}>{ui.signUp}</Text>
            </Pressable>
          </Link>
        )}

        <View style={styles.ctaBox}>
          <Text style={styles.ctaTitle}>{ui.ctaTitle}</Text>
          <Text style={styles.ctaSub}>{ui.ctaSub}</Text>
          {Platform.OS === 'web' ? (
            <Link href="/sign-up" style={sx(styles.ctaBtn)}>
              <Text style={styles.ctaBtnText}>{ui.ctaBtn}</Text>
            </Link>
          ) : (
            <Link href="/sign-up" asChild>
              <Pressable style={styles.ctaBtn}>
                <Text style={styles.ctaBtnText}>{ui.ctaBtn}</Text>
              </Pressable>
            </Link>
          )}
        </View>

        {related.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{ui.related}</Text>
            {related.map((r) => (
              <Link key={r.slug} href={`/blog/${r.slug}`} style={sx(styles.relatedLink)}>
                <Text style={styles.relatedText}>{r.title}</Text>
              </Link>
            ))}
          </View>
        ) : null}

        {siblingLinks.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{siblingTitle}</Text>
            <View style={styles.siblingGrid}>
              {siblingLinks.map((s) => (
                <Link key={s.href} href={s.href as '/'} style={sx(styles.siblingChip)}>
                  <Text style={styles.siblingText}>{s.label}</Text>
                </Link>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SeoLandingShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  badge: {
    ...seoFont({
      fontSize: 12,
      fontWeight: '700',
      color: SEO_THEME.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    }),
  },
  h1: {
    ...seoFont({ fontSize: 28, fontWeight: '800', color: SEO_THEME.text, lineHeight: 36 }),
    marginBottom: 6,
  },
  h1Alt: {
    ...seoFont({ fontSize: 16, fontWeight: '600', color: SEO_THEME.muted, lineHeight: 24 }),
    marginBottom: 12,
  },
  drivers: {
    ...seoFont({ fontSize: 15, fontWeight: '700', color: SEO_THEME.text, marginBottom: 14 }),
  },
  intro: {
    ...seoFont({ fontSize: 16, lineHeight: 26, color: SEO_THEME.text, marginBottom: 20 }),
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    ...seoFont({ fontSize: 17, fontWeight: '800', color: SEO_THEME.text, marginBottom: 10 }),
  },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bulletDot: { ...seoFont({ fontSize: 16, color: SEO_THEME.accent, lineHeight: 24 }) },
  bulletText: {
    ...seoFont({ flex: 1, fontSize: 15, lineHeight: 24, color: SEO_THEME.text }),
  },
  heroCta: {
    alignSelf: 'flex-start',
    backgroundColor: SEO_THEME.dark,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    marginBottom: 8,
    textDecorationLine: 'none',
  },
  heroCtaText: {
    ...seoFont({ fontSize: 15, fontWeight: '800', color: SEO_THEME.white }),
  },
  ctaBox: {
    backgroundColor: SEO_THEME.accentLight,
    borderWidth: 1,
    borderColor: SEO_THEME.accent,
    borderRadius: 16,
    padding: 20,
    marginVertical: 24,
  },
  ctaTitle: {
    ...seoFont({ fontSize: 18, fontWeight: '800', color: SEO_THEME.text }),
    marginBottom: 6,
  },
  ctaSub: {
    ...seoFont({ fontSize: 14, lineHeight: 20, color: SEO_THEME.muted }),
    marginBottom: 14,
  },
  ctaBtn: {
    alignSelf: 'flex-start',
    backgroundColor: SEO_THEME.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    textDecorationLine: 'none',
  },
  ctaBtnText: {
    ...seoFont({ fontSize: 15, fontWeight: '800', color: SEO_THEME.text }),
  },
  relatedLink: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: SEO_THEME.border,
    textDecorationLine: 'none',
  },
  relatedText: {
    ...seoFont({ fontSize: 15, fontWeight: '600', color: SEO_THEME.text }),
  },
  siblingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  siblingChip: {
    borderWidth: 1,
    borderColor: SEO_THEME.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: SEO_THEME.bgSoft,
    textDecorationLine: 'none',
  },
  siblingText: {
    ...seoFont({ fontSize: 13, fontWeight: '600', color: SEO_THEME.text }),
  },
});
