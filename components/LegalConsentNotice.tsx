import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../constants/theme';

export function LegalConsentNotice() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        {t('legal.signUpConsentPrefix')}
        <Text
          style={styles.link}
          onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'terms-of-service' } })}
        >
          {t('legal.termsLink')}
        </Text>
        {t('legal.signUpConsentMiddle')}
        <Text
          style={styles.link}
          onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'privacy-policy' } })}
        >
          {t('legal.privacyLink')}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.md,
  },
  text: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  link: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.gold,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
