import { Link } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlogSeoHead } from '../blog/BlogSeoHead';
import { TryKekeCta } from '../blog/TryKekeCta';
import { LANDING, landingFont, sx } from '../landing/landingTheme';
import { getPostBySlug } from '../../lib/blog';
import {
  seoLandingBreadcrumbSchema,
  seoLandingLocalBusinessSchema,
  seoLandingMeta,
  seoLandingServiceSchema,
  seoLandingWebPageSchema,
} from '../../lib/seoLandingMeta';
import type { SeoLandingPage } from '../../lib/seoLandingPages';
import { SEO_DRIVER_COUNT } from '../../lib/seoLandingPages';
import type { SeoLandingLang } from '../../lib/seoLandingPages';
import { SeoLandingShell } from './SeoLandingShell';

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
    otherLocations: 'სხვა ლოკაციები',
    otherServices: 'სხვა გადაწყვეტილებები',
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
    otherLocations: 'Other locations',
    otherServices: 'Other solutions',
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
  const meta = seoLandingMeta(page, kind, lang);
  const h1 = page.h1[lang];
  const h1Alt = lang === 'ka' ? page.h1.en : page.h1.ka;
  const intro = page.intro[lang];
  const bullets = page.bullets[lang];
  const related = page.relatedBlog
    .map((slug) => {
      const post = getPostBySlug(slug);
      if (!post) return null;
      const title =
        lang === 'en' ? post.title_en || post.title : post.title;
      return { slug, title };
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
          hreflang: { ka: meta.hreflang.ka, en: meta.hreflang.en, ru: meta.hreflang.en },
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
        ) : null}

        <TryKekeCta title={ui.ctaTitle} subtitle={ui.ctaSub} button={ui.ctaBtn} />

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

const interFamily = Platform.select({
  web: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  default: 'System',
});

function seoFont(extra?: object) {
  return { fontFamily: interFamily, ...landingFont(extra) };
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  badge: {
    ...seoFont({
      fontSize: 12,
      fontWeight: '700',
      color: LANDING.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    }),
  },
  h1: {
    ...seoFont({ fontSize: 28, fontWeight: '800', color: LANDING.text, lineHeight: 36 }),
    marginBottom: 6,
  },
  h1Alt: {
    ...seoFont({ fontSize: 16, fontWeight: '600', color: LANDING.muted, lineHeight: 24 }),
    marginBottom: 12,
  },
  drivers: {
    ...seoFont({ fontSize: 15, fontWeight: '700', color: LANDING.text, marginBottom: 14 }),
  },
  intro: {
    ...seoFont({ fontSize: 16, lineHeight: 26, color: LANDING.text, marginBottom: 20 }),
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    ...seoFont({ fontSize: 17, fontWeight: '800', color: LANDING.text, marginBottom: 10 }),
  },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bulletDot: { ...seoFont({ fontSize: 16, color: LANDING.accent, lineHeight: 24 }) },
  bulletText: {
    ...seoFont({ flex: 1, fontSize: 15, lineHeight: 24, color: LANDING.text }),
  },
  heroCta: {
    alignSelf: 'flex-start',
    backgroundColor: LANDING.dark,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    marginBottom: 8,
    textDecorationLine: 'none',
  },
  heroCtaText: {
    ...seoFont({ fontSize: 15, fontWeight: '800', color: LANDING.white }),
  },
  relatedLink: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: LANDING.border,
    textDecorationLine: 'none',
  },
  relatedText: {
    ...seoFont({ fontSize: 15, fontWeight: '600', color: LANDING.text }),
  },
  siblingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  siblingChip: {
    borderWidth: 1,
    borderColor: LANDING.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: LANDING.bgSoft,
    textDecorationLine: 'none',
  },
  siblingText: {
    ...seoFont({ fontSize: 13, fontWeight: '600', color: LANDING.text }),
  },
});
