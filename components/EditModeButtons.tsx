import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

type Props = {
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  saveBusy?: boolean;
};

export function EditModeButtons({ isEditing, onEdit, onSave, onCancel, saveBusy }: Props) {
  if (!isEditing) {
    return (
      <Pressable
        onPress={onEdit}
        style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
      >
        <Text style={styles.editBtnText}>რედაქტირება</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onSave}
        disabled={saveBusy}
        style={({ pressed }) => [styles.saveBtn, (pressed || saveBusy) && styles.pressed]}
      >
        {saveBusy ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.saveBtnText}>შენახვა</Text>
        )}
      </Pressable>
      <Pressable
        onPress={onCancel}
        disabled={saveBusy}
        style={({ pressed }) => [styles.cancelBtn, (pressed || saveBusy) && styles.pressed]}
      >
        <Text style={styles.cancelBtnText}>გაუქმება</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  editBtn: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
  },
  editBtnText: {
    color: COLORS.gold,
    fontWeight: '700',
    fontSize: 15,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 15,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.88,
  },
});
