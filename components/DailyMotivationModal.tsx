import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';

type Props = {
  visible: boolean;
  message: string;
  onClose: () => void;
};

/** Once-per-day admin-published motivational popup, shown to company and driver users. */
export function DailyMotivationModal({ visible, message, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!message.trim()) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
            <Ionicons name="sunny" size={28} color={COLORS.goldDark} />
          </View>
          <Text style={styles.title}>{t('dailyMotivation.title')}</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.body}>{message.trim()}</Text>
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.btnClose, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Text style={styles.btnCloseText}>{t('common.close')}</Text>
          </Pressable>
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
    maxHeight: '70%',
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
    maxHeight: 260,
  },
  scrollContent: {
    paddingBottom: SPACING.sm,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  btnClose: {
    paddingVertical: 14,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    marginTop: SPACING.lg,
  },
  btnCloseText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.black,
  },
  pressed: {
    opacity: 0.88,
  },
});
