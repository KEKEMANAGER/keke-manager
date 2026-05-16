import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useAuth } from '../contexts/AuthContext';
import { submitFeedback } from '../lib/feedback';
import { showErrorAlert } from '../lib/validation';

type Phase = 'idle' | 'form' | 'thanks';

export function ProfileFeedbackEntry() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const thanksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (thanksTimerRef.current !== null) {
        clearTimeout(thanksTimerRef.current);
      }
    };
  }, []);

  const closeAll = useCallback(() => {
    if (thanksTimerRef.current !== null) {
      clearTimeout(thanksTimerRef.current);
      thanksTimerRef.current = null;
    }
    setPhase('idle');
    setMessage('');
    setBusy(false);
  }, []);

  const openForm = () => {
    if (authLoading || !user?.id) return;
    setMessage('');
    setPhase('form');
  };

  const onSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed.length) {
      showErrorAlert(t('feedback.emptyMessage'), t('feedback.title'));
      return;
    }

    setBusy(true);
    const res = await submitFeedback(trimmed);
    setBusy(false);
    if (!res.ok) {
      const fallback =
        res.error?.message === 'empty'
          ? t('feedback.emptyMessage')
          : t('feedback.submitFailed');
      showErrorAlert(
        res.error && res.error.message !== 'empty' && res.error.message !== 'not_authenticated'
          ? res.error.message
          : fallback,
        t('system.errorTitle'),
      );
      return;
    }

    setPhase('thanks');
    if (thanksTimerRef.current !== null) clearTimeout(thanksTimerRef.current);
    thanksTimerRef.current = setTimeout(() => {
      thanksTimerRef.current = null;
      closeAll();
    }, 2600);
  };

  const onRequestClose = () => {
    if (busy) return;
    if (phase === 'thanks') closeAll();
    else if (phase === 'form') closeAll();
  };

  return (
    <>
      <Pressable
        onPress={openForm}
        disabled={authLoading || !user?.id}
        accessibilityRole="button"
        accessibilityLabel={t('feedback.button')}
        style={({ pressed }) => [
          styles.trigger,
          (authLoading || !user?.id) && styles.triggerDisabled,
          pressed && !(authLoading || !user?.id) && styles.triggerPressed,
        ]}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={20} color="#000000" />
        <Text style={styles.triggerText}>{t('feedback.button')}</Text>
      </Pressable>

      <Modal
        visible={phase !== 'idle'}
        transparent
        animationType="fade"
        onRequestClose={onRequestClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.backdrop} onPress={onRequestClose} disabled={busy} />
          <View
            style={[
              styles.sheet,
              { marginBottom: Math.max(insets.bottom, SPACING.md) },
              SHADOWS.card,
            ]}
          >
            {phase === 'form' ? (
              <>
                <Text style={styles.sheetTitle}>{t('feedback.title')}</Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t('feedback.placeholder')}
                  placeholderTextColor={COLORS.gray}
                  multiline
                  maxLength={4000}
                  editable={!busy}
                  style={styles.input}
                  textAlignVertical="top"
                />
                <View style={styles.row}>
                  <Pressable
                    onPress={closeAll}
                    disabled={busy}
                    style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryBtnText}>{t('feedback.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void onSubmit()}
                    disabled={busy}
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#000000" />
                    ) : (
                      <Text style={styles.primaryBtnText}>{t('feedback.send')}</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.thanksBox}>
                <Ionicons name="checkmark-circle" size={40} color={COLORS.success} />
                <Text style={styles.thanksText}>{t('feedback.thankYouToast')}</Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  triggerDisabled: {
    opacity: 0.45,
  },
  triggerPressed: {
    opacity: 0.9,
  },
  triggerText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    maxHeight: '80%',
  },
  sheetTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: SPACING.md,
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    padding: SPACING.md,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'flex-end',
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.button,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.88,
  },
  thanksBox: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.md,
  },
  thanksText: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.text,
    fontWeight: '600',
  },
});
