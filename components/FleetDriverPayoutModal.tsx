import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { parseDriverPayoutInput } from '../lib/bookingPayout';

type Props = {
  visible: boolean;
  driverName: string;
  tripTotalGel: number;
  onCancel: () => void;
  onConfirm: (payoutGel: number) => void;
};

export function FleetDriverPayoutModal({
  visible,
  driverName,
  tripTotalGel,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setValue('');
    setError(null);
  }, [visible, driverName, tripTotalGel]);

  function submit() {
    const parsed = parseDriverPayoutInput(value, tripTotalGel);
    if (!parsed.ok) {
      if (parsed.error === 'over_max') {
        setError(t('fleet.payoutOverMax', { max: tripTotalGel.toLocaleString('ka-GE') }));
      } else if (parsed.error === 'empty') {
        setError(t('fleet.payoutRequired'));
      } else {
        setError(t('fleet.payoutInvalid'));
      }
      return;
    }
    onConfirm(parsed.value);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{t('fleet.payoutModalTitle')}</Text>
          <Text style={styles.sub}>
            {t('fleet.payoutModalSub', {
              name: driverName,
              total: tripTotalGel.toLocaleString('ka-GE'),
            })}
          </Text>
          <TextInput
            value={value}
            onChangeText={(v) => {
              setValue(v);
              setError(null);
            }}
            keyboardType="decimal-pad"
            placeholder={t('fleet.payoutPlaceholder')}
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}>
              <Text style={styles.btnGhostText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable onPress={submit} style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}>
              <Text style={styles.btnGoldText}>{t('common.confirm')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  error: {
    color: COLORS.error,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  btnGhost: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnGhostText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  btnGold: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnGoldText: {
    color: '#000',
    fontWeight: '800',
  },
  pressed: { opacity: 0.88 },
});
