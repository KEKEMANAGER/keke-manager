import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import type { LegalDocSlug } from '../lib/legalDocs';

function LegalLinkRow({
  label,
  slug,
  onPress,
}: {
  label: string;
  slug: LegalDocSlug;
  onPress: (slug: LegalDocSlug) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(slug)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Ionicons name="document-text-outline" size={20} color={COLORS.goldDark} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
    </Pressable>
  );
}

export function LegalSettingsLinks() {
  const { t } = useTranslation();
  const router = useRouter();

  const open = (slug: LegalDocSlug) => {
    router.push({ pathname: '/legal/[slug]', params: { slug } });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('legal.settingsTitle')}</Text>
      <LegalLinkRow
        label={t('legal.termsOfService')}
        slug="terms-of-service"
        onPress={open}
      />
      <LegalLinkRow
        label={t('legal.privacyPolicy')}
        slug="privacy-policy"
        onPress={open}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  cardTitle: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowLabel: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
