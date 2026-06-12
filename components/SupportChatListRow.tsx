import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from './UserAvatar';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';

type Props = {
  lastText?: string | null;
  lastAt?: string | null;
  unreadCount?: number;
  onPress: () => void;
  formatTime: (iso: string) => string;
};

export function SupportChatListRow({
  lastText,
  lastAt,
  unreadCount = 0,
  onPress,
  formatTime,
}: Props) {
  const { t } = useTranslation();
  const title = t('supportChat.title');
  const preview = lastText?.trim() || t('supportChat.listHint');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, styles.rowHighlight, pressed && styles.rowPressed]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="headset-outline" size={22} color="#0f0f0f" />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {title}
          </Text>
          {lastAt ? (
            <Text style={styles.rowTime}>{formatTime(lastAt)}</Text>
          ) : null}
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.rowLast} numberOfLines={1}>
            {preview}
          </Text>
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
    backgroundColor: COLORS.background,
    ...SHADOWS.card,
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowHighlight: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  rowPressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowName: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 15,
    flex: 1,
    marginRight: SPACING.sm,
  },
  rowTime: {
    color: COLORS.textMuted,
    fontSize: 12,
    flexShrink: 0,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLast: {
    color: COLORS.textSecondary,
    fontSize: 14,
    flex: 1,
    marginRight: SPACING.sm,
  },
  badge: {
    backgroundColor: COLORS.gold,
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  badgeText: {
    color: '#0f0f0f',
    fontSize: 11,
    fontWeight: '800',
  },
});
