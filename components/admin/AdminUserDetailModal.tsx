import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { AdminUserDetailView } from './AdminUserDetailView';

type Props = {
  userId: string | null;
  onClose: () => void;
  onOpenUser: (userId: string) => void;
};

export function AdminUserDetailModal({ userId, onClose, onOpenUser }: Props) {
  if (!userId) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <AdminUserDetailView userId={userId} onClose={onClose} onOpenUser={onOpenUser} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: SPACING.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 920 : '100%',
    maxHeight: Platform.OS === 'web' ? ('92vh' as unknown as number) : '92%',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 1,
  },
});
