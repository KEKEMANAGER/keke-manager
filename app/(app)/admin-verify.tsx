/**
 * Admin: review driver verification documents.
 *
 * Admin access: `public.users.role` = `admin` (set in Supabase).
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

function isAdminUser(role: string | null | undefined): boolean {
  return role === 'admin';
}

type SubmittedUser = {
  id: string;
  full_name: string | null;
  license_photo: string | null;
  id_photo: string | null;
  vehicle_registration_photo: string | null;
  verification_status: string | null;
};

export default function AdminVerifyScreen() {
  const { t } = useTranslation();
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const admin = isAdminUser(profile?.role ?? null);

  const [rows, setRows] = useState<SubmittedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const rejectResolveRef = useRef<((value: string | null) => void) | null>(null);

  const load = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('users')
      .select('id, full_name, license_photo, id_photo, vehicle_registration_photo, verification_status')
      .eq('verification_status', 'submitted');
    setLoading(false);
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as SubmittedUser[]);
  }, [admin]);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) return;
    void load();
  }, [authLoading, admin, load]);

  function promptRejectReason(): Promise<string | null> {
    if (Platform.OS === 'web') {
      const v =
        typeof window !== 'undefined' ? window.prompt(t('adminVerify.rejectReasonWeb'), '') : null;
      const trimmed = v?.trim();
      return Promise.resolve(trimmed && trimmed.length > 0 ? trimmed : null);
    }
    if (Platform.OS === 'ios') {
      return new Promise((resolve) => {
        Alert.prompt(
          t('adminVerify.rejectTitle'),
          t('adminVerify.rejectPrompt'),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
            {
              text: t('adminVerify.confirmYes'),
              onPress: (text?: string) => {
                const r = (text ?? '').trim();
                resolve(r.length > 0 ? r : null);
              },
            },
          ],
          'plain-text',
        );
      });
    }
    setRejectReason('');
    setRejectModalOpen(true);
    return new Promise((resolve) => {
      rejectResolveRef.current = resolve;
    });
  }

  function confirmRejectModal() {
    const r = rejectReason.trim();
    rejectResolveRef.current?.(r.length > 0 ? r : null);
    rejectResolveRef.current = null;
    setRejectModalOpen(false);
    setRejectReason('');
  }

  function cancelRejectModal() {
    rejectResolveRef.current?.(null);
    rejectResolveRef.current = null;
    setRejectModalOpen(false);
    setRejectReason('');
  }

  async function onApprove(targetUserId: string) {
    setActingId(targetUserId);
    const { error: err } = await supabase
      .from('users')
      .update({
        is_verified: true,
        verification_status: 'approved',
      })
      .eq('id', targetUserId);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    await load();
  }

  async function onReject(targetUserId: string) {
    const reason = await promptRejectReason();
    if (reason == null) return;
    setActingId(targetUserId);
    const { error: err } = await supabase
      .from('users')
      .update({
        verification_status: 'rejected',
        rejection_reason: reason,
      })
      .eq('id', targetUserId);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    await load();
  }

  if (authLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + SPACING.xl }]}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (!admin) {
    return (
      <View
        style={[
          styles.center,
          { paddingTop: insets.top + SPACING.xl, paddingHorizontal: SPACING.lg },
        ]}
      >
        <Text style={styles.forbidden}>{t('adminVerify.forbidden')}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
        ]}
      >
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>← {t('common.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('adminVerify.screenTitle')}</Text>
        </View>

        {error ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retry}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} size="large" />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>{t('adminVerify.emptyPending')}</Text>
        ) : (
          rows.map((u) => (
            <View key={u.id} style={styles.card}>
              <Text style={styles.name}>
                {u.full_name?.trim() || '—'}{' '}
                <Text style={styles.mono}>({u.id.length > 14 ? `${u.id.slice(0, 14)}…` : u.id})</Text>
              </Text>
              <View style={styles.imgRow}>
                {u.license_photo ? (
                  <Image source={{ uri: u.license_photo }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbPh]} />
                )}
                {u.id_photo ? (
                  <Image source={{ uri: u.id_photo }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbPh]} />
                )}
                {u.vehicle_registration_photo ? (
                  <Image
                    source={{ uri: u.vehicle_registration_photo }}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbPh]} />
                )}
              </View>
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => void onApprove(u.id)}
                  disabled={actingId === u.id}
                  style={({ pressed }) => [
                    styles.approve,
                    (pressed || actingId === u.id) && styles.approvePressed,
                  ]}
                >
                  {actingId === u.id ? (
                    <ActivityIndicator color="#0f0f0f" />
                  ) : (
                    <Text style={styles.approveText}>{t('adminVerify.approveAction')}</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => void onReject(u.id)}
                  disabled={actingId === u.id}
                  style={({ pressed }) => [
                    styles.reject,
                    (pressed || actingId === u.id) && styles.rejectPressed,
                  ]}
                >
                  <Text style={styles.rejectText}>{t('adminVerify.rejectAction')}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={rejectModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('adminVerify.modalTitle')}</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={t('adminVerify.modalPlaceholder')}
              placeholderTextColor={COLORS.gray}
              style={styles.modalInput}
              multiline
            />
            <View style={styles.modalBtns}>
              <Pressable onPress={cancelRejectModal} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={confirmRejectModal} style={styles.modalOk}>
                <Text style={styles.modalOkText}>{t('verificationScreen.submit')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    paddingHorizontal: SPACING.lg,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forbidden: {
    color: COLORS.error,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBtnText: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  topRow: {
    marginBottom: SPACING.lg,
  },
  backLink: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  backLinkText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  errBox: {
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.error,
    marginBottom: SPACING.md,
  },
  errText: { color: COLORS.error, fontSize: 14, marginBottom: SPACING.sm },
  retry: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  retryText: { color: COLORS.gold, fontWeight: '700' },
  empty: {
    color: COLORS.gray,
    fontSize: 15,
    marginTop: SPACING.xl,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  name: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  mono: {
    color: COLORS.gray,
    fontWeight: '500',
    fontSize: 12,
  },
  imgRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.md,
  },
  thumb: {
    width: 100,
    height: 70,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceHigh,
  },
  thumbPh: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  approve: {
    flex: 1,
    minWidth: 140,
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  approvePressed: { opacity: 0.88 },
  approveText: {
    color: '#0f0f0f',
    fontWeight: '800',
    fontSize: 14,
  },
  reject: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  rejectPressed: { opacity: 0.88 },
  rejectText: {
    color: COLORS.error,
    fontWeight: '800',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: SPACING.md,
    color: COLORS.text,
    minHeight: 88,
    textAlignVertical: 'top',
    marginBottom: SPACING.md,
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelText: { color: COLORS.grayLight, fontWeight: '600' },
  modalOk: {
    backgroundColor: COLORS.gold,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalOkText: { color: '#0f0f0f', fontWeight: '800' },
});
