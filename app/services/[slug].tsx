import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Platform, Text, View } from 'react-native';
import { ProgrammaticSeoPage } from '../../components/seo/ProgrammaticSeoPage';
import { getAllServiceSlugs, getServicePage, SEO_SERVICE_PAGES } from '../../lib/seoLandingPages';
import { useSeoLandingLang } from '../../lib/useSeoLandingLang';

export function generateStaticParams() {
  return getAllServiceSlugs().map((slug) => ({ slug }));
}

export default function ServiceSeoScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const lang = useSeoLandingLang();
  const page = getServicePage(Array.isArray(slug) ? slug[0] : slug ?? '');

  const onToggleLang = useCallback(() => {
    const next = lang === 'ka' ? 'en' : 'ka';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (next === 'en') url.searchParams.set('lang', 'en');
      else url.searchParams.delete('lang');
      window.history.replaceState({}, '', url.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    router.setParams({ lang: next === 'en' ? 'en' : undefined });
  }, [lang, router]);

  const siblingLinks = useMemo(() => {
    return SEO_SERVICE_PAGES.filter((p) => p.slug !== page?.slug).map((p) => ({
      href: `/services/${p.slug}${lang === 'en' ? '?lang=en' : ''}`,
      label: lang === 'ka' ? p.serviceName?.ka ?? p.slug : p.serviceName?.en ?? p.slug,
    }));
  }, [lang, page?.slug]);

  if (!page) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Not found</Text>
      </View>
    );
  }

  return (
    <ProgrammaticSeoPage
      page={page}
      kind="service"
      lang={lang}
      onToggleLang={onToggleLang}
      siblingLinks={siblingLinks}
      siblingTitle={lang === 'ka' ? 'სხვა გადაწყვეტილებები' : 'Other solutions'}
    />
  );
}
