import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DeleteAccountModal } from './DeleteAccountModal';
import { LegalSettingsLinks } from './LegalSettingsLinks';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { APP_HEADER_BODY_HEIGHT } from '../constants/layout';
import { useAuth } from '../contexts/AuthContext';
import { LANGUAGES, persistLanguage, type AppLanguage } from '../src/lib/i18n';
type Props = {
  profileRoute: '/(app)/profile' | '/(driver)/profile';
};

export function SettingsScreen({ profileRoute }: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { menuRole } = useAuth();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + APP_HEADER_BODY_HEIGHT + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('menu.settings')}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('common.language')}</Text>
        <View style={styles.langRow}>
          {LANGUAGES.map((lang) => {
            const active = i18n.language === lang.code;
            return (
              <Pressable
                key={lang.code}
                onPress={() => void persistLanguage(lang.code as AppLanguage)}
                style={[styles.langPill, active && styles.langPillActive]}
              >
                <Text style={[styles.langPillText, active && styles.langPillTextActive]}>
                  {lang.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <LegalSettingsLinks />

      <Pressable
        onPress={() => router.push(profileRoute)}
        style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
      >
        <Text style={styles.linkLabel}>
          {menuRole === 'company' ? t('menu.companyProfile') : t('menu.myProfile')}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setDeleteModalVisible(true)}
        style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={t('settings.deleteAccount')}
      >
        <Text style={styles.deleteBtnText}>{t('settings.deleteAccount')}</Text>
      </Pressable>

      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        onDeleted={() => {
          setDeleteModalVisible(false);
          router.replace('/sign-in');
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  langRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  langPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  langPillActive: {
    backgroundColor: COLORS.goldTint,
    borderColor: COLORS.gold,
  },
  langPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  langPillTextActive: {
    color: COLORS.goldDark,
  },
  linkRow: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.button,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  linkRowPressed: { opacity: 0.88 },
  linkLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.goldDark,
  },
  deleteBtn: {
    marginTop: SPACING.lg,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.error,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  deleteBtnPressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.error,
  },
});
