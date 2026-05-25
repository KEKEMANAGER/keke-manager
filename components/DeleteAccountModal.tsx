import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { deleteUserAccount } from '../lib/accountDeletion';
import { showErrorAlert } from '../lib/validation';

type Props = {
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteAccountModal({ visible, onClose, onDeleted }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const confirmWord = t('settings.deleteAccountConfirm');
  const canDelete = useMemo(
    () => confirmText.trim() === confirmWord,
    [confirmText, confirmWord],
  );

  const reset = () => {
    setConfirmText('');
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleDelete = async () => {
    if (!canDelete || busy) return;
    setBusy(true);
    const res = await deleteUserAccount();
    setBusy(false);
    if (!res.ok) {
      showErrorAlert(t('settings.deleteAccountError'), t('settings.deleteAccountTitle'));
      return;
    }
    reset();
    onDeleted();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} disabled={busy} />
        <View
          style={[
            styles.sheet,
            { marginBottom: Math.max(insets.bottom, SPACING.md) },
            SHADOWS.card,
          ]}
        >
          <View style={styles.titleRow}>
            <Ionicons name="warning" size={22} color={COLORS.error} />
            <Text style={styles.sheetTitle}>{t('settings.deleteAccountTitle')}</Text>
          </View>

          <Text style={styles.warningLead}>{t('settings.deleteAccountWarning')}</Text>
          <Text style={styles.effects}>{t('settings.deleteAccountEffects')}</Text>

          <Text style={styles.inputLabel}>{t('settings.deleteAccountInputLabel')}</Text>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={confirmWord}
            placeholderTextColor={COLORS.gray}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
          />

          <View style={styles.row}>
            <Pressable
              onPress={handleClose}
              disabled={busy}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryBtnText}>{t('settings.deleteAccountDismiss')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleDelete()}
              disabled={!canDelete || busy}
              style={({ pressed }) => [
                styles.dangerBtn,
                (!canDelete || busy) && styles.dangerBtnDisabled,
                pressed && canDelete && !busy && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.dangerBtnText}>{t('settings.deleteAccountConfirm')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    padding: SPACING.lg,
    marginHorizontal: SPACING.sm,
    gap: SPACING.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  warningLead: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  effects: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  dangerBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    backgroundColor: COLORS.error,
  },
  dangerBtnDisabled: {
    opacity: 0.45,
  },
  dangerBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.88,
  },
});
