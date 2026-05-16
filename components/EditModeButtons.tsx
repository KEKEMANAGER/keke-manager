import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

type Props = {
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  saveBusy?: boolean;
};

export function EditModeButtons({ isEditing, onEdit, onSave, onCancel, saveBusy }: Props) {
  const { t } = useTranslation();

  if (!isEditing) {
    return (
      <Pressable
        onPress={onEdit}
        style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
      >
        <Text style={styles.editBtnText}>{t('common.edit')}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onSave}
        disabled={saveBusy}
        style={({ pressed }) => [
          styles.saveBtn,
          (pressed || saveBusy) && styles.pressed,
          saveBusy && styles.saveBtnDisabled,
        ]}
      >
        {saveBusy ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <Text style={styles.saveBtnText}>{t('common.save')}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={onCancel}
        disabled={saveBusy}
        style={({ pressed }) => [styles.cancelBtn, (pressed || saveBusy) && styles.pressed]}
      >
        <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
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
    justifyContent: 'center',
    minHeight: 44,
  },
  saveBtnDisabled: {
    opacity: 0.85,
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
