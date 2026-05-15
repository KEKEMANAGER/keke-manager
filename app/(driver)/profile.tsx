import { Ionicons } from '@expo/vector-icons';
import { useClerk, useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
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
import { StarRow } from '../../components/StarRow';
import { MOCK_RATING_BREAKDOWN } from '../../constants/driverMocks';
import { COLORS, SHADOWS, SPACING } from '../../constants/theme';
import { avatarObjectPath, uploadMediaObject } from '../../lib/mediaUpload';
import { supabase } from '../../lib/supabase';
import { fetchUserAvatarUrl, saveUserAvatarUrl } from '../../lib/userAvatar';

function RatingBar({ label, value }: { label: string; value: number }) {
  const pct = (value / 5) * 100;
  return (
    <View style={styles.barWrap}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>{value.toFixed(1)}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

export default function DriverProfileScreen() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const loadAvatar = useCallback(async () => {
    if (!isLoaded) return;
    if (!user?.id) {
      setPhotoUri(user?.imageUrl ?? null);
      setPhotoLoading(false);
      return;
    }
    setPhotoLoading(true);
    setPhotoError(null);
    const fromDb = await fetchUserAvatarUrl(user.id);
    setPhotoUri(fromDb ?? user?.imageUrl ?? null);
    setPhotoLoading(false);
  }, [isLoaded, user?.id, user?.imageUrl]);

  useEffect(() => {
    void loadAvatar();
  }, [loadAvatar]);

  const [name, setName] = useState([user?.firstName, user?.lastName].filter(Boolean).join(' ').trim());
  const [bio, setBio] = useState('');
  const [languages, setLanguages] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [vehicleModel, setVehicleModel] = useState('Mercedes Sprinter 316');
  const [vehiclePlate, setVehiclePlate] = useState('AA-123-BB');
  const [profileLoading, setProfileLoading] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadProfileFields = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    setSaveError(null);
    const { data, error } = await supabase
      .from('users')
      .select('full_name, bio, languages, experience_years')
      .eq('clerk_id', user.id)
      .maybeSingle();
    setProfileLoading(false);
    if (error || !data) return;
    const row = data as {
      full_name?: string | null;
      bio?: string | null;
      languages?: string[] | null;
      experience_years?: number | null;
    };
    if (typeof row.full_name === 'string' && row.full_name.trim()) {
      setName(row.full_name.trim());
    }
    setBio(row.bio?.trim() ?? '');
    setLanguages(row.languages?.length ? row.languages.join(', ') : '');
    setExperienceYears(
      row.experience_years != null && !Number.isNaN(Number(row.experience_years))
        ? String(row.experience_years)
        : '',
    );
  }, [user?.id]);

  useEffect(() => {
    void loadProfileFields();
  }, [loadProfileFields]);

  async function pickPhoto() {
    if (!user?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhotoError('ფოტოებზე წვდომა უარყოფილია.');
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
    router.replace('/sign-in');
  }

  async function onSaveProfile() {
    if (!user?.id) return;
    setSaveBusy(true);
    setSaveError(null);
    const years = parseInt(experienceYears.trim(), 10);
    const { error } = await supabase
      .from('users')
      .update({
        bio: bio.trim() || null,
        languages: languages.split(',').map((l) => l.trim()).filter(Boolean),
        experience_years: Number.isFinite(years) && years > 0 ? years : null,
      })
      .eq('clerk_id', user.id);
    setSaveBusy(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    void loadProfileFields();
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xl + 88 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>პროფილი</Text>

      <View style={styles.photoSection}>
        <Pressable onPress={pickPhoto} disabled={photoUploading} style={styles.photoRing}>
          {!isLoaded || photoLoading ? (
            <ActivityIndicator color={COLORS.gold} />
          ) : photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <Ionicons name="person" size={48} color={COLORS.gray} />
          )}
          {photoUploading ? (
            <View style={styles.photoBusy}>
              <ActivityIndicator color={COLORS.gold} />
            </View>
          ) : !photoLoading && isLoaded ? (
            <View style={styles.photoEdit}>
              <Ionicons name="camera" size={18} color="#000000" />
            </View>
          ) : null}
        </Pressable>
        <Text style={styles.photoHint}>შეეხეთ ფოტოს შესაცვლელად (Supabase: media/avatars/[clerk_id].jpg)</Text>
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>პირადი ინფორმაცია</Text>
        {profileLoading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.md }} />
        ) : null}
        <Field label="სახელი გვარი" value={name} onChangeText={setName} />
        <Field label="ბიო" value={bio} onChangeText={setBio} multiline />
        <Field
          label="ენები"
          value={languages}
          onChangeText={setLanguages}
          placeholder="ქართული, ინგლისური"
        />
        <Field
          label="გამოცდილება (წლები)"
          value={experienceYears}
          onChangeText={setExperienceYears}
          keyboardType="number-pad"
        />
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
        <Pressable
          onPress={() => void onSaveProfile()}
          disabled={saveBusy}
          style={({ pressed }) => [styles.saveBtn, (pressed || saveBusy) && styles.pressed]}
        >
          {saveBusy ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.saveBtnText}>შენახვა</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ავტომობილი</Text>
        <Field label="მოდელი" value={vehicleModel} onChangeText={setVehicleModel} />
        <Field label="სანომრე ნიშანი" value={vehiclePlate} onChangeText={setVehiclePlate} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>რეიტინგის დეტალები</Text>
        <View style={styles.overallRow}>
          <Text style={styles.overallLabel}>საერთო</Text>
          <StarRow value={4.8} />
        </View>
        <RatingBar label="დროულობა" value={MOCK_RATING_BREAKDOWN.punctuality} />
        <RatingBar label="სისუფთავე" value={MOCK_RATING_BREAKDOWN.cleanliness} />
        <RatingBar label="კომუნიკაცია" value={MOCK_RATING_BREAKDOWN.communication} />
        <RatingBar label="ძალისმიერი მართვა" value={MOCK_RATING_BREAKDOWN.driving} />
      </View>

      <Pressable
        onPress={onSignOut}
        style={({ pressed }) => [styles.signOut, SHADOWS.gold, pressed && styles.pressed]}
      >
        <Text style={styles.signOutText}>გასვლა</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        keyboardType={keyboardType}
        placeholderTextColor={COLORS.gray}
        style={[styles.input, multiline && styles.inputMulti]}
      />
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
  },
  title: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: SPACING.md,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  photoRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
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
  },
  photoBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,15,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cardTitle: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
  },
  field: {
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    color: COLORS.grayLight,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    color: COLORS.white,
    fontSize: 15,
  },
  inputMulti: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  overallRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  overallLabel: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  barWrap: {
    marginBottom: SPACING.md,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  barLabel: {
    color: COLORS.grayLight,
    fontSize: 14,
  },
  barValue: {
    color: COLORS.goldLight,
    fontWeight: '700',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.gold,
  },
  signOut: {
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  signOutText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.9,
  },
  saveBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  saveError: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: SPACING.sm,
  },
});
