import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';

type Props = {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

/**
 * Google Play–required prominent disclosure shown before BACKGROUND_LOCATION is requested.
 * Must not be dismissable except via Accept / Decline.
 */
export function BackgroundLocationDisclosureModal({ visible, onAccept, onDecline }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.root}>
        <View
          style={[
            styles.sheet,
            {
              marginTop: insets.top + SPACING.lg,
              marginBottom: Math.max(insets.bottom, SPACING.lg),
            },
            SHADOWS.card,
          ]}
        >
          <View style={styles.iconRow}>
            <Ionicons name="location" size={28} color={COLORS.goldDark} />
          </View>
          <Text style={styles.title}>{t('gpsScreen.bgDisclosure.title')}</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>{t('gpsScreen.bgDisclosure.whyLabel')}</Text>
            <Text style={styles.body}>{t('gpsScreen.bgDisclosure.why')}</Text>

            <Text style={styles.sectionLabel}>{t('gpsScreen.bgDisclosure.dataLabel')}</Text>
            <Text style={styles.body}>{t('gpsScreen.bgDisclosure.dataCollected')}</Text>

            <Text style={styles.sectionLabel}>{t('gpsScreen.bgDisclosure.usageLabel')}</Text>
            <Text style={styles.body}>{t('gpsScreen.bgDisclosure.dataUsage')}</Text>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={onDecline}
              style={({ pressed }) => [styles.btnDecline, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('gpsScreen.bgDisclosure.decline')}
            >
              <Text style={styles.btnDeclineText}>{t('gpsScreen.bgDisclosure.decline')}</Text>
            </Pressable>
            <Pressable
              onPress={onAccept}
              style={({ pressed }) => [styles.btnAccept, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('gpsScreen.bgDisclosure.accept')}
            >
              <Text style={styles.btnAcceptText}>{t('gpsScreen.bgDisclosure.accept')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    maxHeight: '88%',
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  scroll: {
    flexGrow: 0,
    maxHeight: 340,
  },
  scrollContent: {
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.goldDark,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: SPACING.xs,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  btnDecline: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  btnDeclineText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  btnAccept: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    backgroundColor: COLORS.gold,
  },
  btnAcceptText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.black,
  },
  pressed: {
    opacity: 0.88,
  },
});
