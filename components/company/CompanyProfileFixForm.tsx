import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../AppLogo';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { profileFixMissing, saveCompanyName, type ProfileFixRequest } from '../../lib/companyProfileFix';
import { avatarObjectPath, uploadMediaObject, withCacheBust } from '../../lib/mediaUpload';
import { ensureMediaPermission } from '../../lib/mediaPermissions';
import { resolveProfileAvatarUrl } from '../../lib/profileAvatar';
import { saveUserAvatarUrl } from '../../lib/userAvatar';
import { mapSupabaseError, showErrorAlert } from '../../lib/validation';

type Props = {
  fix: ProfileFixRequest;
  /** Called after each save, so the guard re-reads the account (the server may have let it in). */
  onSaved: () => Promise<void> | void;
};

/**
 * What a company held by KEKE Manager sees instead of the app: the one or two
 * things it was asked to correct — its real company name, its logo — and
 * nothing else. The server lets it back in by itself once both are in place.
 */
export function CompanyProfileFixForm({ fix, onSaved }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const userId = user?.id ?? '';
  const needName = fix.fields.includes('company_name');
  const needLogo = fix.fields.includes('logo');

  const [name, setName] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The logo the server checks is users.avatar_url (the profile's own row),
  // so that is the one shown and checked here — not a copy kept elsewhere.
  const storedLogo = profile?.avatar_url ?? null;
  const logoForCheck = uploadedUrl ?? storedLogo;
  const logoUrl = uploadedUrl
    ? (withCacheBust(uploadedUrl) ?? uploadedUrl)
    : resolveProfileAvatarUrl(null, storedLogo);

  async function pickLogo() {
    if (!userId || uploading) return;
    try {
      const perm = await ensureMediaPermission('library', t('profilePage.permissionTitle'));
      if (perm !== 'granted') {
        if (perm === 'denied') showErrorAlert(t('profilePage.photoPermissionDenied'), t('profilePage.permissionTitle'));
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.88 });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setUploading(true);
      setError(null);
      try {
        const publicUrl = await uploadMediaObject(avatarObjectPath(userId), asset.uri, { contentType: asset.mimeType ?? 'image/jpeg' });
        const { error: saveErr } = await saveUserAvatarUrl(userId, publicUrl);
        if (saveErr) throw new Error(saveErr.message);
        setUploadedUrl(publicUrl);
        await onSaved();
      } catch (e: unknown) {
        const message = mapSupabaseError(e);
        setError(message);
        showErrorAlert(message);
      } finally {
        setUploading(false);
      }
    } catch {
      showErrorAlert(t('profilePage.photoPermissionDenied'), t('profilePage.permissionTitle'));
    }
  }

  async function onSave() {
    if (!userId || saving) return;
    const missing = profileFixMissing(fix, needName ? name : profile?.full_name, logoForCheck);
    if (missing.length > 0) {
      setError(missing.map((m) => t(`companyProfileFix.missing.${m}`)).join('\n'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (needName) {
        const { error: saveErr } = await saveCompanyName(userId, name);
        if (saveErr) throw saveErr;
      }
      await onSaved();
    } catch (e: unknown) {
      const message = mapSupabaseError(e);
      setError(message);
      showErrorAlert(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <AppLogo size="auth" />
      <View style={styles.card} testID="company-profile-fix">
        <View style={styles.iconWrap}>
          <Ionicons name="create-outline" size={36} color={COLORS.goldDark} />
        </View>
        <Text style={styles.title}>{t('companyProfileFix.title')}</Text>
        <Text style={styles.subtitle}>{t('companyProfileFix.subtitle')}</Text>

        {needName ? (
          <View style={styles.block}>
            <Text style={styles.label}>{t('companyProfileFix.nameLabel')}</Text>
            <TextInput
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError(null);
              }}
              placeholder={t('companyProfileFix.namePlaceholder')}
              placeholderTextColor={COLORS.textSecondary}
              style={styles.input}
              autoCapitalize="words"
              testID="company-profile-fix-name"
            />
            {fix.nameWas ? <Text style={styles.hint}>{t('companyProfileFix.nameWas', { name: fix.nameWas })}</Text> : null}
          </View>
        ) : null}

        {needLogo ? (
          <View style={styles.block}>
            <Text style={styles.label}>{t('companyProfileFix.logoLabel')}</Text>
            <View style={styles.logoRow}>
              <View style={styles.logoBox}>
                {logoUrl ? (
                  <Image source={{ uri: logoUrl }} style={styles.logo} />
                ) : (
                  <Ionicons name="image-outline" size={28} color={COLORS.textSecondary} />
                )}
              </View>
              <Pressable
                onPress={() => void pickLogo()}
                disabled={uploading}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                testID="company-profile-fix-logo"
              >
                {uploading ? (
                  <ActivityIndicator color={COLORS.goldDark} size="small" />
                ) : (
                  <Text style={styles.secondaryBtnText}>
                    {logoUrl ? t('companyProfileFix.logoChange') : t('companyProfileFix.logoPick')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={() => void onSave()}
          disabled={saving || uploading}
          style={({ pressed }) => [styles.primaryBtn, SHADOWS.button, pressed && styles.pressed]}
          testID="company-profile-fix-save"
        >
          {saving ? (
            <ActivityIndicator color={COLORS.black} size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>{t('companyProfileFix.save')}</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>{t('companyVerificationGate.contactHint')}</Text>
        <Pressable onPress={() => void signOut()} style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}>
          <Text style={styles.linkText}>{t('common.logout')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.lg },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.goldLight,
  },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  block: { gap: SPACING.xs },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  hint: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: COLORS.background,
  },
  logo: { width: 72, height: 72 },
  secondaryBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  secondaryBtnText: { color: COLORS.goldDark, fontWeight: '600' },
  error: { color: COLORS.error, fontSize: 14, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  primaryBtnText: { color: COLORS.black, fontWeight: '700', fontSize: 16 },
  linkBtn: { alignSelf: 'center', padding: SPACING.sm },
  linkText: { color: COLORS.textSecondary, textDecorationLine: 'underline' },
  pressed: { opacity: 0.8 },
});
