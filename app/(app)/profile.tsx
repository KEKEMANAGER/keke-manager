import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  mapSupabaseError,
  showErrorAlert,
  showValidationAlert,
  validateCompanyProfileForm,
  validateRequired,
} from '../../lib/validation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, persistLanguage, type AppLanguage } from '../../src/lib/i18n';
import { EditModeButtons } from '../../components/EditModeButtons';
import { ProfileFeedbackEntry } from '../../components/ProfileFeedbackEntry';
import { MOCK_COMPANY_SUBSCRIPTION } from '../../constants/companyMocks';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  addCompanyMember,
  deleteCompanyMember,
  fetchCompanyMembers,
  formatSupabaseError,
  type CompanyMember,
} from '../../lib/companyMembers';
import { avatarObjectPath, uploadMediaObject, withCacheBust } from '../../lib/mediaUpload';
import { supabase } from '../../lib/supabase';
import { fetchUserAvatarUrl, saveUserAvatarUrl } from '../../lib/userAvatar';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import type { User } from '@supabase/supabase-js';

function companyDisplayName(
  profile: Profile | null,
  user: User | null,
  defaultLabel: string,
) {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const cn = meta?.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  const fn = profile?.full_name?.trim();
  if (fn) return fn;
  return user?.email ?? defaultLabel;
}

export default function CompanyProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const defaultCompany = t('companyProfile.defaultCompany');
  const isAdmin = profile?.role === 'admin';

  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const displayName = companyName.trim() || companyDisplayName(profile, user, defaultCompany);

  const loadProfileFields = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    setSaveError(null);
    const { data, error } = await supabase
      .from('users')
      .select('full_name, email, phone, tax_id')
      .eq('id', user.id)
      .maybeSingle();
    setProfileLoading(false);
    if (error || !data) {
      const fallbackName = companyDisplayName(profile, user, defaultCompany);
      setCompanyName(fallbackName === defaultCompany ? '' : fallbackName);
      setEmail(profile?.email ?? user?.email ?? '');
      setPhone(profile?.phone ?? '');
      setTaxId('');
      return;
    }
    const row = data as {
      full_name?: string | null;
      email?: string | null;
      phone?: string | null;
      tax_id?: string | null;
    };
    if (typeof row.full_name === 'string' && row.full_name.trim()) {
      setCompanyName(row.full_name.trim());
    } else {
      const fallbackName = companyDisplayName(profile, user, defaultCompany);
      setCompanyName(fallbackName === defaultCompany ? '' : fallbackName);
    }
    setEmail(row.email?.trim() ?? profile?.email ?? user?.email ?? '');
    setPhone(row.phone?.trim() ?? profile?.phone ?? '');
    setTaxId(row.tax_id?.trim() ?? '');
  }, [user?.id, profile, user]);

  const loadMembers = useCallback(async () => {
    if (!user?.id) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    setMemberError(null);
    const { data, error } = await fetchCompanyMembers(user.id);
    setMembersLoading(false);
    if (error) {
      setMemberError(formatSupabaseError(error));
      setMembers([]);
      return;
    }
    setMembers(data);
  }, [user?.id]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadProfileFields(), loadMembers()]);
  }, [loadProfileFields, loadMembers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reloadAll();
    } finally {
      setRefreshing(false);
    }
  }, [reloadAll]);

  useFocusEffect(
    useCallback(() => {
      void reloadAll();
    }, [reloadAll]),
  );

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const loadAvatar = useCallback(async () => {
    if (authLoading) return;
    if (!user?.id) {
      setPhotoUri(null);
      setPhotoLoading(false);
      return;
    }
    setPhotoLoading(true);
    setPhotoError(null);
    const fromDb = await fetchUserAvatarUrl(user.id);
    setPhotoUri(withCacheBust(fromDb) ?? fromDb);
    setPhotoLoading(false);
  }, [authLoading, user?.id]);

  useEffect(() => {
    void loadAvatar();
  }, [loadAvatar]);

  async function pickLogo() {
    if (!user?.id || photoUploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const permMsg = t('profilePage.photoPermissionDenied');
      setPhotoError(permMsg);
      showErrorAlert(permMsg, t('profilePage.permissionTitle'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.88,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const mime = asset.mimeType ?? 'image/jpeg';
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const path = avatarObjectPath(user.id);
      const publicUrl = await uploadMediaObject(path, asset.uri, { contentType: mime });
      const { error } = await saveUserAvatarUrl(user.id, publicUrl);
      if (error) {
        throw new Error(error.message);
      }
      setPhotoUri(withCacheBust(publicUrl) ?? publicUrl);
    } catch (e: unknown) {
      const message = mapSupabaseError(e);
      setPhotoError(message);
      showErrorAlert(message);
    } finally {
      setPhotoUploading(false);
    }
  }

  function onStartEdit() {
    setIsEditing(true);
    setSaveError(null);
  }

  function onCancelEdit() {
    setIsEditing(false);
    setSaveError(null);
    void loadProfileFields();
  }

  async function onSaveProfile() {
    if (!user?.id) return;

    const validationError = validateCompanyProfileForm({
      companyName,
      email,
      phone,
    });
    if (validationError) {
      setSaveError(validationError);
      showValidationAlert(validationError);
      return;
    }

    setSaveBusy(true);
    setSaveError(null);
    const { error } = await supabase
      .from('users')
      .update({
        full_name: companyName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        tax_id: taxId.trim() || null,
      })
      .eq('id', user.id);
    setSaveBusy(false);
    if (error) {
      const message = mapSupabaseError(error);
      setSaveError(message);
      showErrorAlert(message);
      return;
    }
    setIsEditing(false);
    void loadProfileFields();
  }

  async function onAddMember() {
    if (!user?.id || memberBusy) return;

    const nameError = validateRequired(newMemberName, t('companyProfile.operatorNameRequired'));
    if (nameError) {
      setMemberError(nameError);
      showValidationAlert(nameError);
      return;
    }

    setMemberBusy(true);
    setMemberError(null);
    const { data, error } = await addCompanyMember(user.id, newMemberName);
    setMemberBusy(false);
    if (error) {
      const message = mapSupabaseError(error);
      setMemberError(message);
      showErrorAlert(message);
      return;
    }
    if (data) {
      setMembers((prev) => [...prev, data]);
      setNewMemberName('');
    } else {
      void loadMembers();
    }
  }

  async function onRemoveMember(member: CompanyMember) {
    if (!user?.id || memberBusy) return;
    setMemberBusy(true);
    setMemberError(null);
    const { error } = await deleteCompanyMember(member.id, user.id);
    setMemberBusy(false);
    if (error) {
      setMemberError(formatSupabaseError(error));
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl + 72 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor={COLORS.gold}
          colors={[COLORS.gold]}
        />
      }
    >
      <Text style={styles.screenTitle}>{t('companyProfile.screenTitle')}</Text>

      <View style={styles.photoSection}>
        <Pressable
          onPress={pickLogo}
          disabled={photoUploading}
          style={({ pressed }) => [styles.photoRing, pressed && !photoUploading && styles.photoRingPressed]}
        >
          {authLoading || photoLoading ? (
            <ActivityIndicator color={COLORS.gold} />
          ) : photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <Ionicons name="business" size={48} color={COLORS.gray} />
          )}
          {photoUploading ? (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator color={COLORS.gold} size="large" />
            </View>
          ) : !photoLoading && !authLoading ? (
            <View style={styles.photoEdit}>
              <Ionicons name="camera" size={18} color="#000000" />
            </View>
          ) : null}
        </Pressable>
        <Text style={styles.photoHint}>
          {t('companyProfile.logoHint')}
        </Text>
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
      </View>

      <View style={styles.nameBlock}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{email.trim() || '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('companyProfile.identity')}</Text>
        <Row label="User ID" value={user?.id ? `${user.id.slice(0, 12)}…` : '—'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('companyProfile.contact')}</Text>
        <EditModeButtons
          isEditing={isEditing}
          onEdit={onStartEdit}
          onSave={() => void onSaveProfile()}
          onCancel={onCancelEdit}
          saveBusy={saveBusy}
        />
        {profileLoading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.md }} />
        ) : null}
        {isEditing ? (
          <>
            <EditField label={t('companyProfile.companyName')} value={companyName} onChangeText={setCompanyName} />
            <EditField label={t('companyProfile.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <EditField
              label={t('companyProfile.email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <EditField label={t('companyProfile.taxId')} value={taxId} onChangeText={setTaxId} />
          </>
        ) : (
          <>
            <Row label={t('companyProfile.companyName')} value={displayName} />
            <Row label={t('companyProfile.phone')} value={phone.trim() || '—'} />
            <Row label={t('companyProfile.email')} value={email.trim() || '—'} />
            <Row label={t('companyProfile.taxId')} value={taxId.trim() || '—'} />
          </>
        )}
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{t('companyProfile.operators')}</Text>
          <Pressable
            onPress={() => void loadMembers()}
            disabled={membersLoading || memberBusy}
            hitSlop={8}
            style={({ pressed }) => [styles.reloadBtn, pressed && styles.reloadBtnPressed]}
          >
            <Ionicons name="refresh-outline" size={20} color={COLORS.gold} />
          </Pressable>
        </View>
        {membersLoading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.sm }} />
        ) : members.length === 0 ? (
          <Text style={styles.membersHint}>{t('companyProfile.operatorsHint')}</Text>
        ) : (
          <View style={styles.memberList}>
            {members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Pressable
                  onPress={() => void onRemoveMember(m)}
                  disabled={memberBusy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('companyProfile.deleteOperatorA11y', { name: m.name })}
                  style={({ pressed }) => [styles.memberDeleteBtn, pressed && styles.memberDeletePressed]}
                >
                  <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={styles.addMemberRow}>
          <TextInput
            value={newMemberName}
            onChangeText={setNewMemberName}
            placeholder={t('companyProfile.operatorPlaceholder')}
            placeholderTextColor={COLORS.gray}
            style={styles.addMemberInput}
            editable={!memberBusy}
          />
          <Pressable
            onPress={() => void onAddMember()}
            disabled={memberBusy || !newMemberName.trim()}
            style={({ pressed }) => [
              styles.addMemberBtn,
              (!newMemberName.trim() || memberBusy) && styles.addMemberBtnDisabled,
              pressed && !!newMemberName.trim() && !memberBusy && styles.addMemberBtnPressed,
            ]}
          >
            {memberBusy ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Text style={styles.addMemberBtnText}>{t('companyProfile.addMember')}</Text>
            )}
          </Pressable>
        </View>
        {memberError ? <Text style={styles.saveError}>{memberError}</Text> : null}
      </View>

      {isAdmin ? (
        <Pressable
          onPress={() => router.push('/(app)/admin-verify')}
          style={({ pressed }) => [styles.adminPanelBtn, pressed && styles.adminPanelBtnPressed]}
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.goldDark} />
          <Text style={styles.adminPanelBtnText}>{t('adminVerify.panelEntry')}</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </Pressable>
      ) : null}

      <ProfileFeedbackEntry />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('common.language')}</Text>
        <View style={styles.langRow}>
          {LANGUAGES.map((lang) => {
            const active = i18n.language === lang.code;
            return (
              <Pressable
                key={lang.code}
                onPress={() => void persistLanguage(lang.code as AppLanguage)}
                style={[styles.langPill, active && styles.langPillActive]}
              >
                <Text style={[styles.langPillText, active && styles.langPillTextActive]}>
                  {lang.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('companyProfile.subscription')}</Text>
        <View style={styles.subRow}>
          <View>
            <Text style={styles.subTier}>{MOCK_COMPANY_SUBSCRIPTION.tier}</Text>
            <Text style={styles.subMeta}>
              {t('companyProfile.monthlyLimit', {
                used: MOCK_COMPANY_SUBSCRIPTION.usedThisMonth,
                limit: MOCK_COMPANY_SUBSCRIPTION.monthlyLimit,
              })}
            </Text>
            <Text style={styles.subMeta}>
              {t('companyProfile.validUntil', { date: MOCK_COMPANY_SUBSCRIPTION.validUntil })}
            </Text>
          </View>
          <View style={styles.subBadge}>
            <Text style={styles.subBadgeText}>{t('companyProfile.subscriptionActive')}</Text>
          </View>
        </View>
      </View>

    </ScrollView>
  );
}

function EditField({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={COLORS.gray}
        style={styles.input}
      />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    flexGrow: 1,
  },
  screenTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  photoRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  photoRingPressed: {
    opacity: 0.92,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoEdit: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: {
    color: COLORS.gray,
    fontSize: 13,
    marginTop: SPACING.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  photoError: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: SPACING.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  nameBlock: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  name: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
  },
  email: {
    color: COLORS.grayLight,
    fontSize: 15,
    marginTop: 6,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  cardTitle: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '700',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  reloadBtn: {
    padding: 4,
  },
  reloadBtnPressed: {
    opacity: 0.7,
  },
  row: {
    marginBottom: SPACING.md,
  },
  rowLabel: {
    color: COLORS.gray,
    fontSize: 12,
    marginBottom: 4,
  },
  rowValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  saveError: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: SPACING.sm,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  subTier: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '800',
  },
  subMeta: {
    color: COLORS.grayLight,
    fontSize: 14,
    marginTop: 6,
  },
  subBadge: {
    backgroundColor: 'rgba(76,175,80,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  subBadgeText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '800',
  },
  membersHint: {
    color: COLORS.grayLight,
    fontSize: 14,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  memberList: {
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  memberName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  memberDeleteBtn: {
    padding: 6,
    marginLeft: SPACING.sm,
  },
  memberDeletePressed: {
    opacity: 0.7,
  },
  addMemberRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  addMemberInput: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  addMemberBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMemberBtnDisabled: {
    opacity: 0.5,
  },
  addMemberBtnPressed: {
    opacity: 0.9,
  },
  addMemberBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  langRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  langPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  langPillActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  langPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  langPillTextActive: {
    color: '#0f0f0f',
  },
  adminPanelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  adminPanelBtnPressed: {
    opacity: 0.92,
  },
  adminPanelBtnText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
