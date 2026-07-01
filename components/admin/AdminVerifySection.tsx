import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { setAdminUserVerified } from '../../lib/adminPanel';
import {
  documentUrlFor,
  fetchAdminVerificationQueue,
  verificationDocSlotsForAdmin,
  type AdminDocumentKey,
  type AdminVerificationUser,
} from '../../lib/adminVerification';
import { supabase } from '../../lib/supabase';
import { adminStyles } from './adminStyles';

type DocSlot = { key: AdminDocumentKey; labelKey: string };

function idDocSlotsForUser(u: AdminVerificationUser): DocSlot[] {
  return verificationDocSlotsForAdmin(u).map((key) => ({
    key,
    labelKey: `verificationScreen.${key}`,
  }));
}

export function AdminVerifySection({
  searchQuery = '',
  onQueueCountChange,
}: {
  searchQuery?: string;
  onQueueCountChange?: (count: number) => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminVerificationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const rejectResolveRef = useRef<((value: string | null) => void) | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await fetchAdminVerificationQueue();
      if (err) {
        setError(err.message);
        setRows([]);
        onQueueCountChange?.(0);
        return;
      }
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      onQueueCountChange?.(list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setRows([]);
      onQueueCountChange?.(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onQueueCountChange, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => {
      const name = (u.full_name ?? '').trim().toLowerCase();
      const email = (u.email ?? '').trim().toLowerCase();
      const companyEmail = (u.company_email ?? '').trim().toLowerCase();
      return name.includes(q) || email.includes(q) || companyEmail.includes(q);
    });
  }, [rows, searchQuery]);

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
    const { error: err } = await setAdminUserVerified(targetUserId, true);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== targetUserId));
    Alert.alert(t('common.success'), t('adminVerify.approveSuccess'));
    void load(true);
  }

  async function onReject(targetUserId: string) {
    const reason = await promptRejectReason();
    if (reason == null) return;
    setActingId(targetUserId);
    const { error: verifyErr } = await setAdminUserVerified(targetUserId, false);
    if (!verifyErr && reason.trim()) {
      await supabase
        .from('users')
        .update({ rejection_reason: reason.trim() })
        .eq('id', targetUserId);
    }
    setActingId(null);
    if (verifyErr) {
      Alert.alert(t('system.errorTitle'), verifyErr.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== targetUserId));
    Alert.alert(t('common.success'), t('adminVerify.rejectSuccess'));
    void load(true);
  }

  function roleLabel(role: string | null): string {
    if (role === 'driver') return t('authScreen.roleFreelanceDriver');
    if (role === 'company') return t('authScreen.roleCompany');
    if (role === 'admin') return t('common.admin');
    return role ?? '—';
  }

  function statusLabel(status: string | null): string {
    if (status === 'pending') return t('adminVerify.statusPending');
    if (status === 'submitted') return t('adminVerify.statusSubmitted');
    return status ?? '—';
  }

  function renderCompanyInfo(user: AdminVerificationUser) {
    const fields: { labelKey: string; value: string | null | undefined }[] = [
      { labelKey: 'authScreen.companyEmail', value: user.company_email ?? user.email },
      { labelKey: 'authScreen.companyPhone', value: user.company_phone },
      { labelKey: 'authScreen.companyIdCode', value: user.company_id_code },
      { labelKey: 'authScreen.companyDirector', value: user.company_director },
    ];
    return (
      <View style={styles.companyInfoBlock}>
        {fields.map((field) => (
          <View key={field.labelKey} style={styles.companyRow}>
            <Text style={styles.companyLabel}>{t(field.labelKey)}</Text>
            <Text style={styles.companyValue}>{field.value?.trim() || '—'}</Text>
          </View>
        ))}
      </View>
    );
  }

  function renderDocButton(user: AdminVerificationUser, slot: DocSlot) {
    const url = documentUrlFor(user, slot.key);
    return (
      <Pressable
        key={slot.key}
        disabled={!url}
        onPress={() => url && setPreview({ url, title: t(slot.labelKey) })}
        style={({ pressed }) => [
          styles.docBtn,
          !url && styles.docBtnDisabled,
          pressed && url && styles.docBtnPressed,
        ]}
      >
        <Text style={[styles.docBtnText, !url && styles.docBtnTextDisabled]} numberOfLines={1}>
          {t(slot.labelKey)}
        </Text>
        <Text style={[styles.docBtnHint, !url && styles.docBtnTextDisabled]}>
          {url ? t('adminVerify.viewDocument') : t('adminVerify.noDocument')}
        </Text>
      </Pressable>
    );
  }

  if (loading) {
    return <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} size="large" />;
  }

  return (
    <>
      <View>
        {error ? (
          <View style={adminStyles.errBox}>
            <Text style={adminStyles.errText}>{error}</Text>
            <Pressable onPress={() => void load()} style={adminStyles.retry}>
              <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
        {rows.length === 0 ? (
          <Text style={adminStyles.empty}>{t('adminVerify.emptyPending')}</Text>
        ) : (
          filteredRows.map((u) => (
            <View key={u.id} style={adminStyles.card}>
              <Text style={adminStyles.cardTitle}>{u.full_name?.trim() || u.email || '—'}</Text>
              <Text style={adminStyles.cardMeta}>
                {t('adminVerify.role')}: {roleLabel(u.role)}
              </Text>
              <Text style={adminStyles.cardMeta}>
                {t('adminVerify.status')}: {statusLabel(u.verification_status)}
              </Text>
              {u.role === 'company' ? (
                <>
                  <Text style={styles.sectionLabel}>{t('adminVerify.companyInfoSection')}</Text>
                  {renderCompanyInfo(u)}
                </>
              ) : u.role === 'driver' ? (
                <>
                  <Text style={styles.sectionLabel}>{t('adminVerify.documentsSection')}</Text>
                  <View style={styles.docGrid}>
                    {idDocSlotsForUser(u).map((slot) => renderDocButton(u, slot))}
                  </View>
                </>
              ) : null}
              <View style={adminStyles.btnRow}>
                <Pressable
                  onPress={() => void onApprove(u.id)}
                  disabled={actingId === u.id}
                  style={({ pressed }) => [
                    styles.approve,
                    (pressed || actingId === u.id) && { opacity: 0.88 },
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
                    (pressed || actingId === u.id) && { opacity: 0.88 },
                  ]}
                >
                  <Text style={styles.rejectText}>{t('adminVerify.rejectAction')}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreview(null)}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{preview?.title}</Text>
            {preview?.url ? (
              <Image
                source={{ uri: preview.url }}
                style={styles.previewImage}
                resizeMode="contain"
                onError={() => setPreview(null)}
              />
            ) : null}
            <Pressable onPress={() => setPreview(null)} style={styles.previewClose}>
              <Text style={styles.previewCloseText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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
  sectionLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  companyInfoBlock: {
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  companyRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
  },
  companyLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  companyValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  docGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  docBtn: {
    minWidth: '30%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: COLORS.surface,
  },
  docBtnDisabled: { opacity: 0.5 },
  docBtnPressed: { opacity: 0.88, borderColor: COLORS.gold },
  docBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  docBtnHint: { color: COLORS.gold, fontSize: 11, fontWeight: '600' },
  docBtnTextDisabled: { color: COLORS.textMuted },
  approve: {
    flex: 1,
    minWidth: 140,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  approveText: { color: '#0f0f0f', fontWeight: '800', fontSize: 14 },
  reject: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  rejectText: { color: COLORS.error, fontWeight: '800', fontSize: 14 },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    maxHeight: '90%',
  },
  previewTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  previewImage: {
    width: '100%',
    height: 360,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  previewClose: {
    marginTop: SPACING.md,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
  },
  previewCloseText: { color: '#0f0f0f', fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
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
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { color: COLORS.grayLight, fontWeight: '600' },
  modalOk: {
    backgroundColor: COLORS.gold,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalOkText: { color: '#0f0f0f', fontWeight: '800' },
});
