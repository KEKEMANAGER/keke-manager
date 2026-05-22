import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LegalMarkdownView } from '../../components/LegalMarkdownView';
import { COLORS, SPACING } from '../../constants/theme';
import {
  LEGAL_DOC_SLUGS,
  getLegalMarkdown,
  legalDocTitleKey,
  type LegalDocSlug,
} from '../../lib/legalDocs';

function isLegalSlug(value: string): value is LegalDocSlug {
  return (LEGAL_DOC_SLUGS as readonly string[]).includes(value);
}

export default function LegalDocumentScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug?: string | string[] }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const slugParam = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const slug = slugParam && isLegalSlug(slugParam) ? slugParam : null;

  useEffect(() => {
    if (!slug) {
      router.replace('/sign-in');
    }
  }, [slug, router]);

  const markdown = useMemo(
    () => (slug ? getLegalMarkdown(slug, i18n.language) : ''),
    [slug, i18n.language],
  );

  const title = slug ? t(legalDocTitleKey(slug)) : '';

  if (!slug) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + SPACING.xl },
        ]}
      >
        <View style={styles.card}>
          <Text style={styles.docTitle}>{title}</Text>
          <LegalMarkdownView markdown={markdown} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  docTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
});
