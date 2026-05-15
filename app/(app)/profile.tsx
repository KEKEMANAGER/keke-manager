import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditModeButtons } from '../../components/EditModeButtons';
import { MOCK_COMPANY_LEGAL_ID, MOCK_COMPANY_SUBSCRIPTION } from '../../constants/companyMocks';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { avatarObjectPath, uploadMediaObject, withCacheBust } from '../../lib/mediaUpload';
import { supabase } from '../../lib/supabase';
import { fetchUserAvatarUrl, saveUserAvatarUrl } from '../../lib/userAvatar';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import type { User } from '@supabase/supabase-js';

function companyDisplayName(profile: Profile | null, user: User | null) {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const cn = meta?.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  const fn = profile?.full_name?.trim();
  if (fn) return fn;
  return user?.email ?? 'კომპანია';
}

export default function CompanyProfileScreen() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const displayName = companyName.trim() || companyDisplayName(profile, user);

  const loadProfileFields = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    setSaveError(null);
    const { data, error } = await supabase
      .from('users')
      .select('full_name, email, phone')
      .eq('id', user.id)
      .maybeSingle();
    setProfileLoading(false);
    if (error || !data) {
      const fallbackName = companyDisplayName(profile, user);
      setCompanyName(fallbackName === 'კომპანია' ? '' : fallbackName);
      setEmail(profile?.email ?? user?.email ?? '');
      setPhone(profile?.phone ?? '');
      return;
    }
    const row = data as { full_name?: string | null; email?: string | null; phone?: string | null };
    if (typeof row.full_name === 'string' && row.full_name.trim()) {
      setCompanyName(row.full_name.trim());
    } else {
      const fallbackName = companyDisplayName(profile, user);
      setCompanyName(fallbackName === 'კომპანია' ? '' : fallbackName);
    }
    setEmail(row.email?.trim() ?? profile?.email ?? user?.email ?? '');
    setPhone(row.phone?.trim() ?? profile?.phone ?? '');
  }, [user?.id, profile, user]);

  useEffect(() => {
    void loadProfileFields();
  }, [loadProfileFields]);

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
      setPhotoError('წვდომა ფოტოებზე უარყოფილია.');
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
      setPhotoError(e instanceof Error ? e.message : 'ატვირთვა ვერ მოხერხდა');
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
    setSaveBusy(true);
    setSaveError(null);
    const { error } = await supabase
      .from('users')
      .update({
        full_name: companyName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      })
      .eq('id', user.id);
    setSaveBusy(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setIsEditing(false);
    void loadProfileFields();
  }

  async function onSignOut() {
    await signOut();
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
    >
      <Text style={styles.screenTitle}>კომპანიის პროფილი</Text>

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
          შეეხეთ ლოგოს შესაცვლელად (Supabase: bucket media → avatars/[user_id].jpg)
        </Text>
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
      </View>

      <View style={styles.nameBlock}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{email.trim() || '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>იდენტიფიკაცია</Text>
        <Row label="საიდენტიფიკაციო ნომერი" value={MOCK_COMPANY_LEGAL_ID} />
        <Row label="User ID" value={user?.id ? `${user.id.slice(0, 12)}…` : '—'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>კონტაქტი</Text>
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
            <EditField label="კომპანიის სახელი" value={companyName} onChangeText={setCompanyName} />
            <EditField label="ტელეფონი" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <EditField
              label="ელფოსტა"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </>
        ) : (
          <>
            <Row label="კომპანიის სახელი" value={displayName} />
            <Row label="ტელეფონი" value={phone.trim() || '—'} />
            <Row label="ელფოსტა" value={email.trim() || '—'} />
          </>
        )}
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>გამოწერა</Text>
        <View style={styles.subRow}>
          <View>
            <Text style={styles.subTier}>{MOCK_COMPANY_SUBSCRIPTION.tier}</Text>
            <Text style={styles.subMeta}>
              თვიური ლიმიტი: {MOCK_COMPANY_SUBSCRIPTION.usedThisMonth} /{' '}
              {MOCK_COMPANY_SUBSCRIPTION.monthlyLimit} ჯავშანი
            </Text>
            <Text style={styles.subMeta}>ვადა: {MOCK_COMPANY_SUBSCRIPTION.validUntil}</Text>
          </View>
          <View style={styles.subBadge}>
            <Text style={styles.subBadgeText}>აქტიური</Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={onSignOut}
        style={({ pressed }) => [styles.signOut, SHADOWS.button, pressed && styles.signOutPressed]}
      >
        <Text style={styles.signOutText}>გასვლა</Text>
      </Pressable>
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
    marginBottom: SPACING.md,
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
  signOut: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  signOutPressed: {
    opacity: 0.92,
  },
  signOutText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
});
