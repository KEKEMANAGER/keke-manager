import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { NameWithVerifiedBadge } from '../NameWithVerifiedBadge';
import { UserAvatar } from '../UserAvatar';
import { APP_HEADER_BODY_HEIGHT, Z_INDEX } from '../../constants/layout';
import { COLORS, SPACING } from '../../constants/theme';
import { useAppMenu } from '../../contexts/AppMenuContext';

type Props = {
  otherName: string;
  otherAvatarUrl: string | null;
  otherVerified: boolean;
};

export function ChatScreenHeader({ otherName, otherAvatarUrl, otherVerified }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { openDrawer } = useAppMenu();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, minHeight: insets.top + APP_HEADER_BODY_HEIGHT }]}>
      <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
      </Pressable>
      <UserAvatar name={otherName} uri={otherAvatarUrl} size={40} />
      <NameWithVerifiedBadge
        name={otherName}
        verified={otherVerified}
        style={styles.nameWrap}
        textStyle={styles.name}
        numberOfLines={1}
      />
      <Pressable
        onPress={openDrawer}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('menu.open')}
        style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
      >
        <Ionicons name="menu-outline" size={22} color={COLORS.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
    zIndex: Z_INDEX.header,
  },
  backBtn: {
    padding: SPACING.xs,
  },
  nameWrap: {
    flex: 1,
  },
  name: {
    flexShrink: 1,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.xs,
  },
  menuBtnPressed: {
    opacity: 0.85,
    backgroundColor: COLORS.surfaceAlt,
  },
});
