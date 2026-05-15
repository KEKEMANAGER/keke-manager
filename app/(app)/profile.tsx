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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_COMPANY_LEGAL_ID, MOCK_COMPANY_SUBSCRIPTION } from '../../constants/companyMocks';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { avatarObjectPath, uploadMediaObject } from '../../lib/mediaUpload';
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
  const name = companyDisplayName(profile, user);
  const email = profile?.email ?? user?.email ?? '—';
  const phone =
    profile?.phone ??
    (typeof user?.user_metadata === 'object' &&
    user?.user_metadata &&
    'phone' in user.user_metadata &&
    typeof (user.user_metadata as { phone?: unknown }).phone === 'string'
      ? (user.user_metadata as { phone: string }).phone
      : '+995 555 00 00 00');

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
    setPhotoUri(fromDb);
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
      setPhotoUri(publicUrl);
    } catch (e: unknown) {
      setPhotoError(e instanceof Error ? e.message : 'ატვირთვა ვერ მოხერხდა');
    } finally {
      setPhotoUploading(false);
    }
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
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>იდენტიფიკაცია</Text>
        <Row label="საიდენტიფიკაციო ნომერი" value={MOCK_COMPANY_LEGAL_ID} />
        <Row label="User ID" value={user?.id ? `${user.id.slice(0, 12)}…` : '—'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>კონტაქტი</Text>
        <Row label="ტელეფონი" value={phone} />
        <Row label="ელფოსტა" value={email} />
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
