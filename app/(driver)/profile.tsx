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
import {
  mapSupabaseError,
  showErrorAlert,
  showValidationAlert,
  validateDriverProfileForm,
} from '../../lib/validation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditModeButtons } from '../../components/EditModeButtons';
import { OptionChips } from '../../components/OptionChips';
import { StarRow } from '../../components/StarRow';
import { MOCK_RATING_BREAKDOWN } from '../../constants/driverMocks';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { avatarObjectPath, uploadMediaObject, withCacheBust } from '../../lib/mediaUpload';
import {
  fetchDriverProfile,
  saveDriverVehiclePreferences,
  type DriverVehiclePreferences,
} from '../../lib/profiles';
import { supabase } from '../../lib/supabase';
import { fetchUserAvatarUrl, saveUserAvatarUrl } from '../../lib/userAvatar';
import {
  VEHICLE_CLASSES,
  VEHICLE_TYPES,
  vehicleClassLabel,
  vehicleTypeLabel,
  type VehicleClassCode,
  type VehicleTypeCode,
} from '../../lib/vehicleCatalog';
import { useAuth } from '../../contexts/AuthContext';

const VEHICLE_TYPE_OPTIONS = VEHICLE_TYPES.map((value) => ({
  value,
  label: vehicleTypeLabel(value),
}));

const VEHICLE_CLASS_OPTIONS = VEHICLE_CLASSES.map((value) => ({
  value,
  label: vehicleClassLabel(value),
}));

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
  const { user, profile, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
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

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [languages, setLanguages] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const vehicleModel = 'Mercedes Sprinter 316';
  const vehiclePlate = 'AA-123-BB';
  const [vehicleType, setVehicleType] = useState<VehicleTypeCode | null>(null);
  const [vehicleClass, setVehicleClass] = useState<VehicleClassCode | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadProfileFields = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    setSaveError(null);
    const { data, error } = await supabase
      .from('users')
      .select('full_name, bio, languages, experience_years')
      .eq('id', user.id)
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

  const loadVehiclePreferences = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await fetchDriverProfile(user.id);
    if (error && __DEV__) {
      console.warn('[DriverProfile] fetchDriverProfile', error.message);
    }
    if (data?.vehicle_type) setVehicleType(data.vehicle_type);
    if (data?.vehicle_class) setVehicleClass(data.vehicle_class);
  }, [user?.id]);

  useEffect(() => {
    void loadVehiclePreferences();
  }, [loadVehiclePreferences]);

  async function pickPhoto() {
    if (!user?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const permMsg = 'ფოტოებზე წვდომა უარყოფილია.';
      setPhotoError(permMsg);
      showErrorAlert(permMsg, 'წვდომა');
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
    if (!vehicleType) setVehicleType('sedan');
    if (!vehicleClass) setVehicleClass('comfort');
  }

  function onCancelEdit() {
    setIsEditing(false);
    setSaveError(null);
    void loadProfileFields();
    void loadVehiclePreferences();
  }

  async function onSaveProfile() {
    if (!user?.id) return;

    const validationError = validateDriverProfileForm({
      name,
      vehicleType,
      vehicleClass,
      experienceYears,
    });
    if (validationError) {
      setSaveError(validationError);
      showValidationAlert(validationError);
      return;
    }

    setSaveBusy(true);
    setSaveError(null);
    const years = parseInt(experienceYears.trim(), 10);
    const prefs: DriverVehiclePreferences = {
      vehicle_type: vehicleType!,
      vehicle_class: vehicleClass!,
    };
    const [usersRes, profilesRes] = await Promise.all([
      supabase
        .from('users')
        .update({
          full_name: name.trim() || null,
          bio: bio.trim() || null,
          languages: languages.split(',').map((l) => l.trim()).filter(Boolean),
          experience_years: Number.isFinite(years) && years > 0 ? years : null,
        })
        .eq('id', user.id),
      saveDriverVehiclePreferences(user.id, prefs),
    ]);
    setSaveBusy(false);
    if (usersRes.error) {
      const message = mapSupabaseError(usersRes.error);
      setSaveError(message);
      showErrorAlert(message);
      return;
    }
    if (!profilesRes.ok) {
      const message = mapSupabaseError(
        profilesRes.error ?? new Error('ავტომობილის პარამეტრები ვერ შეინახა'),
      );
      setSaveError(message);
      showErrorAlert(message);
      return;
    }
    setIsEditing(false);
    void loadProfileFields();
    void loadVehiclePreferences();
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
          {authLoading || photoLoading ? (
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
          ) : !photoLoading && !authLoading ? (
            <View style={styles.photoEdit}>
              <Ionicons name="camera" size={18} color="#000000" />
            </View>
          ) : null}
        </Pressable>
        <Text style={styles.photoHint}>შეეხეთ ფოტოს შესაცვლელად (Supabase: media/avatars/[user_id].jpg)</Text>
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>პირადი ინფორმაცია</Text>
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
            <OptionChips
              label="ავტომობილის ტიპი"
              options={VEHICLE_TYPE_OPTIONS}
              value={vehicleType}
              onChange={setVehicleType}
              disabled={saveBusy}
            />
            <OptionChips
              label="ავტომობილის კლასი"
              options={VEHICLE_CLASS_OPTIONS}
              value={vehicleClass}
              onChange={setVehicleClass}
              disabled={saveBusy}
            />
          </>
        ) : (
          <>
            <ViewField label="სახელი გვარი" value={name || '—'} />
            <ViewField label="ბიო" value={bio || '—'} />
            <ViewField label="ენები" value={languages || '—'} />
            <ViewField label="გამოცდილება (წლები)" value={experienceYears || '—'} />
            <ViewField
              label="ავტომობილის ტიპი"
              value={vehicleType ? vehicleTypeLabel(vehicleType) : '—'}
            />
            <ViewField
              label="ავტომობილის კლასი"
              value={vehicleClass ? vehicleClassLabel(vehicleClass) : '—'}
            />
          </>
        )}
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ავტომობილი</Text>
        <ViewField label="მოდელი" value={vehicleModel} />
        <ViewField label="სანომრე ნიშანი" value={vehiclePlate} />
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

    </ScrollView>
  );
}

function ViewField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.viewValue}>{value}</Text>
    </View>
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
    color: COLORS.text,
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
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    ...SHADOWS.card,
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
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
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
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    color: COLORS.text,
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
    color: COLORS.text,
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
    borderRadius: RADIUS.button,
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
  viewValue: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
  },
  saveError: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: SPACING.sm,
  },
});
