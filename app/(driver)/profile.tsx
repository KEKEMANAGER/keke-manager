import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  bioMaxLength,
  mapSupabaseError,
  showErrorAlert,
  showValidationAlert,
  validateBioLength,
  validateDriverProfileForm,
  validateDriverProfilePhoneOnly,
} from '../../lib/validation';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, persistLanguage, type AppLanguage } from '../../src/lib/i18n';
import { EditModeButtons } from '../../components/EditModeButtons';
import { NameWithVerifiedBadge } from '../../components/NameWithVerifiedBadge';
import { LegalSettingsLinks } from '../../components/LegalSettingsLinks';
import { ProfileFeedbackEntry } from '../../components/ProfileFeedbackEntry';
import { LanguageMultiSelect } from '../../components/LanguageMultiSelect';
import { SearchableCitySelect } from '../../components/SearchableCitySelect';
import { isValidGeorgianCity } from '../../lib/georgianCities';
import { OptionChips } from '../../components/OptionChips';
import { StarRow } from '../../components/StarRow';
import { fetchDriverAverageRating } from '../../lib/ratings';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { avatarObjectPath, uploadMediaObject, withCacheBust } from '../../lib/mediaUpload';
import {
  fetchDriverProfile,
  saveDriverLanguages,
  saveDriverVehiclePreferences,
  type DriverVehiclePreferences,
} from '../../lib/profiles';
import { formatSpokenLanguagesList } from '../../lib/spokenLanguages';
import { supabase } from '../../lib/supabase';
import { fetchVehicleByDriver } from '../../lib/vehicles';
import {
  fetchHiredDriverStatus,
  updateHiredDriverJobBoardProfile,
  type HiredDriverStatus,
} from '../../lib/jobBoard';
import { isHiredDriver } from '../../lib/role';
import { fetchUserAvatarUrl, saveUserAvatarUrl } from '../../lib/userAvatar';
import {
  vehicleClassLabel,
  vehicleClassUiOptions,
  vehicleTypeLabel,
  vehicleTypeUiOptions,
  type VehicleClassCode,
  type VehicleTypeCode,
} from '../../lib/vehicleCatalog';
import { useAuth } from '../../contexts/AuthContext';

export default function DriverProfileScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const vehicleTypeOptions = useMemo(
    () => vehicleTypeUiOptions(),
    [i18n.language, i18n.resolvedLanguage],
  );
  const vehicleClassOptions = useMemo(
    () => vehicleClassUiOptions(),
    [i18n.language, i18n.resolvedLanguage],
  );
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
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleTypeCode | null>(null);
  const [vehicleClass, setVehicleClass] = useState<VehicleClassCode | null>(null);
  const [ratingAverage, setRatingAverage] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [availableForHire, setAvailableForHire] = useState(true);
  const [hiredStatus, setHiredStatus] = useState<HiredDriverStatus>('looking');
  const [employerName, setEmployerName] = useState<string | null>(null);
  const [hireStatusBusy, setHireStatusBusy] = useState(false);

  const isHired = isHiredDriver(profile);
  const displayName = name.trim() || profile?.full_name?.trim() || '';

  const hiredStatusLabel = useMemo(() => {
    if (hiredStatus === 'employed') return t('jobBoard.statusEmployed');
    if (hiredStatus === 'not_looking') return t('jobBoard.statusNotLooking');
    return t('jobBoard.statusLookingForWork');
  }, [hiredStatus, t]);

  const loadProfileFields = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    setSaveError(null);
    const { data, error } = await supabase
      .from('users')
      .select('full_name, phone, city, bio, languages, experience_years, available_for_hire')
      .eq('id', user.id)
      .maybeSingle();
    setProfileLoading(false);
    if (error || !data) return;
    const row = data as {
      full_name?: string | null;
      phone?: string | null;
      city?: string | null;
      bio?: string | null;
      languages?: string[] | null;
      experience_years?: number | null;
      available_for_hire?: boolean | null;
    };
    if (typeof row.full_name === 'string' && row.full_name.trim()) {
      setName(row.full_name.trim());
    }
    setPhone(row.phone?.trim() ?? profile?.phone?.trim() ?? '');
    const cityVal = row.city?.trim();
    setCity(cityVal && isValidGeorgianCity(cityVal) ? cityVal : null);
    setBio(row.bio?.trim() ?? '');
    setSpokenLanguages(
      Array.isArray(row.languages)
        ? row.languages.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [],
    );
    setExperienceYears(
      row.experience_years != null && !Number.isNaN(Number(row.experience_years))
        ? String(row.experience_years)
        : '',
    );
    setAvailableForHire(row.available_for_hire !== false);
  }, [user?.id]);

  const loadHiredStatus = useCallback(async () => {
    if (!user?.id || !isHired) return;
    const { status, hostName, error } = await fetchHiredDriverStatus(user.id);
    if (error && __DEV__) {
      console.warn('[DriverProfile] fetchHiredDriverStatus', error.message);
    }
    setHiredStatus(status);
    setEmployerName(hostName);
    setAvailableForHire(status === 'looking');
  }, [user?.id, isHired]);

  useEffect(() => {
    void loadProfileFields();
  }, [loadProfileFields]);

  useEffect(() => {
    void loadHiredStatus();
  }, [loadHiredStatus]);

  const loadVehiclePreferences = useCallback(async () => {
    if (!user?.id) return;
    const [{ data, error }, { data: vehicleRow }] = await Promise.all([
      fetchDriverProfile(user.id),
      fetchVehicleByDriver(user.id),
    ]);
    if (error && __DEV__) {
      console.warn('[DriverProfile] fetchDriverProfile', error.message);
    }
    if (data?.vehicle_type) setVehicleType(data.vehicle_type);
    if (data?.vehicle_class) setVehicleClass(data.vehicle_class);
    setVehicleModel(vehicleRow?.model?.trim() ?? '');
    setVehiclePlate(vehicleRow?.plate?.trim() ?? '');
  }, [user?.id]);

  useEffect(() => {
    void loadVehiclePreferences();
  }, [loadVehiclePreferences]);

  const loadRating = useCallback(async () => {
    if (!user?.id) return;
    const { average, count } = await fetchDriverAverageRating(user.id);
    setRatingAverage(average);
    setRatingCount(count);
  }, [user?.id]);

  useEffect(() => {
    void loadRating();
  }, [loadRating]);

  async function pickPhoto() {
    if (!user?.id) return;
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
    if (!vehicleType) setVehicleType('sedan');
    if (!vehicleClass) setVehicleClass('comfort');
  }

  function onCancelEdit() {
    setIsEditing(false);
    setSaveError(null);
    void loadProfileFields();
    if (isHired) void loadHiredStatus();
    else void loadVehiclePreferences();
  }

  async function onSelectHiredAvailability(looking: boolean) {
    if (!user?.id || hireStatusBusy || hiredStatus === 'employed') return;
    const nextStatus: HiredDriverStatus = looking ? 'looking' : 'not_looking';
    setHiredStatus(nextStatus);
    setAvailableForHire(looking);
    setHireStatusBusy(true);
    const { error } = await updateHiredDriverJobBoardProfile(user.id, {
      available_for_hire: looking,
    });
    setHireStatusBusy(false);
    if (error) {
      void loadHiredStatus();
      showErrorAlert(error.message);
    }
  }

  async function onSaveProfile() {
    if (!user?.id) return;

    const validationError = isHired
      ? (validateDriverProfilePhoneOnly({ name, phone }) ?? validateBioLength(bio))
      : (validateDriverProfileForm({
          name,
          phone,
          vehicleType,
          vehicleClass,
          experienceYears,
        }) ?? validateBioLength(bio));
    if (validationError) {
      setSaveError(validationError);
      showValidationAlert(validationError);
      return;
    }
    if (!city || !isValidGeorgianCity(city)) {
      const msg = t('validation.cityRequired');
      setSaveError(msg);
      showValidationAlert(msg);
      return;
    }

    setSaveBusy(true);
    setSaveError(null);
    const years = parseInt(experienceYears.trim(), 10);
    const userPatch = {
      full_name: name.trim() || null,
      phone: phone.trim() || null,
      city,
      bio: bio.trim() || null,
      experience_years: Number.isFinite(years) && years > 0 ? years : null,
      ...(isHired ? { available_for_hire: availableForHire } : {}),
    };

    if (isHired) {
      const [usersRes, langRes] = await Promise.all([
        supabase.from('users').update(userPatch).eq('id', user.id),
        saveDriverLanguages(user.id, spokenLanguages),
      ]);
      setSaveBusy(false);
      if (usersRes.error) {
        const message = mapSupabaseError(usersRes.error);
        setSaveError(message);
        showErrorAlert(message);
        return;
      }
      if (!langRes.ok) {
        const message = langRes.error?.message ?? 'Languages save failed';
        setSaveError(message);
        showErrorAlert(message);
        return;
      }
    } else {
      const prefs: DriverVehiclePreferences = {
        vehicle_type: vehicleType!,
        vehicle_class: vehicleClass!,
      };
      const [usersRes, profilesRes, langRes] = await Promise.all([
        supabase.from('users').update(userPatch).eq('id', user.id),
        saveDriverVehiclePreferences(user.id, prefs),
        saveDriverLanguages(user.id, spokenLanguages),
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
          profilesRes.error ?? new Error(t('profilePage.vehicleSaveFailed')),
        );
        setSaveError(message);
        showErrorAlert(message);
        return;
      }
      if (!langRes.ok) {
        const message = langRes.error?.message ?? 'Languages save failed';
        setSaveError(message);
        showErrorAlert(message);
        return;
      }
    }
    setIsEditing(false);
    void loadProfileFields();
    if (isHired) void loadHiredStatus();
    else void loadVehiclePreferences();
    Alert.alert(t('profilePage.savedTitle'), t('profilePage.savedMessage'));
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
      <Text style={styles.title}>{t('profilePage.title')}</Text>

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
        <Text style={styles.photoHint}>{t('profilePage.photoHint')}</Text>
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
      </View>

      {displayName ? (
        <View style={styles.nameBlock}>
          <NameWithVerifiedBadge
            name={displayName}
            verified={profile?.is_verified}
            isGuide={profile?.is_guide_driver}
            textStyle={styles.displayName}
          />
        </View>
      ) : null}

      {isHired ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('jobBoard.profileCardTitle')}</Text>
          <Text style={styles.hireHint}>{t('jobBoard.profileCardHint')}</Text>

          <View
            style={[
              styles.statusBadge,
              hiredStatus === 'employed' && styles.statusBadgeEmployed,
              hiredStatus === 'looking' && styles.statusBadgeLooking,
              hiredStatus === 'not_looking' && styles.statusBadgeNotLooking,
            ]}
          >
            <Ionicons
              name={
                hiredStatus === 'employed'
                  ? 'briefcase-outline'
                  : hiredStatus === 'looking'
                    ? 'search-outline'
                    : 'pause-circle-outline'
              }
              size={18}
              color={
                hiredStatus === 'employed'
                  ? COLORS.success
                  : hiredStatus === 'looking'
                    ? COLORS.goldDark
                    : COLORS.textMuted
              }
            />
            <Text
              style={[
                styles.statusBadgeText,
                hiredStatus === 'employed' && styles.statusBadgeTextEmployed,
                hiredStatus === 'looking' && styles.statusBadgeTextLooking,
                hiredStatus === 'not_looking' && styles.statusBadgeTextNotLooking,
              ]}
            >
              {hiredStatusLabel}
            </Text>
          </View>

          {hiredStatus === 'employed' && employerName ? (
            <Text style={styles.employerLine}>
              {t('jobBoard.employedUnder', { host: employerName })}
            </Text>
          ) : null}

          {hiredStatus !== 'employed' ? (
            <View style={styles.statusChoices}>
              <Pressable
                onPress={() => void onSelectHiredAvailability(true)}
                disabled={hireStatusBusy || hiredStatus === 'looking'}
                style={({ pressed }) => [
                  styles.statusChip,
                  hiredStatus === 'looking' && styles.statusChipActive,
                  pressed && styles.statusChipPressed,
                  hireStatusBusy && styles.statusChipDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    hiredStatus === 'looking' && styles.statusChipTextActive,
                  ]}
                >
                  {t('jobBoard.statusLookingForWork')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void onSelectHiredAvailability(false)}
                disabled={hireStatusBusy || hiredStatus === 'not_looking'}
                style={({ pressed }) => [
                  styles.statusChip,
                  hiredStatus === 'not_looking' && styles.statusChipActiveMuted,
                  pressed && styles.statusChipPressed,
                  hireStatusBusy && styles.statusChipDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    hiredStatus === 'not_looking' && styles.statusChipTextActiveMuted,
                  ]}
                >
                  {t('jobBoard.statusNotLooking')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.employedHint}>{t('jobBoard.employedHint')}</Text>
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profilePage.personalInfo')}</Text>
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
            <Field label={t('profilePage.fullName')} value={name} onChangeText={setName} />
            <Field
              label={t('profilePage.phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <SearchableCitySelect
              label={t('profilePage.city')}
              value={city}
              onChange={setCity}
              disabled={saveBusy}
            />
            <Field label={t('profilePage.bio')} value={bio} onChangeText={setBio} multiline />
            <Text style={styles.charCount}>
              {bio.length}/{bioMaxLength()}
            </Text>
            <LanguageMultiSelect
              label={t('profilePage.languages')}
              hint={t('profilePage.languagesHint')}
              value={spokenLanguages}
              onChange={setSpokenLanguages}
              disabled={saveBusy}
            />
            <Field
              label={t('profilePage.experience')}
              value={experienceYears}
              onChangeText={setExperienceYears}
              keyboardType="number-pad"
            />
            {!isHired ? (
              <>
                <OptionChips
                  label={t('profilePage.vehicleTypeLabel')}
                  options={vehicleTypeOptions}
                  value={vehicleType}
                  onChange={setVehicleType}
                  disabled={saveBusy}
                />
                <OptionChips
                  label={t('profilePage.vehicleClassLabel')}
                  options={vehicleClassOptions}
                  value={vehicleClass}
                  onChange={setVehicleClass}
                  disabled={saveBusy}
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <ViewField label={t('profilePage.fullName')} value={name || '—'} />
            {phone.trim() ? (
              <Pressable onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}>
                <View style={styles.phoneViewRow}>
                  <Text style={styles.fieldLabel}>{t('profilePage.phone')}</Text>
                  <Text style={styles.phoneLink}>📞 {phone}</Text>
                </View>
              </Pressable>
            ) : (
              <ViewField label={t('profilePage.phone')} value="—" />
            )}
            <ViewField label={t('profilePage.city')} value={city || '—'} />
            <ViewField label={t('profilePage.bio')} value={bio || '—'} />
            <ViewField
              label={t('profilePage.languages')}
              value={formatSpokenLanguagesList(spokenLanguages) || '—'}
            />
            {!isHired ? (
              <>
                <ViewField label={t('profilePage.experience')} value={experienceYears || '—'} />
                <ViewField
                  label={t('profilePage.vehicleTypeLabel')}
                  value={vehicleType ? vehicleTypeLabel(vehicleType) : '—'}
                />
                <ViewField
                  label={t('profilePage.vehicleClassLabel')}
                  value={vehicleClass ? vehicleClassLabel(vehicleClass) : '—'}
                />
              </>
            ) : (
              <ViewField label={t('jobBoard.statusLabel')} value={hiredStatusLabel} />
            )}
          </>
        )}
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
      </View>

      {!isHired ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('profilePage.vehicleCard')}</Text>
          <ViewField label={t('vehicleScreen.model')} value={vehicleModel || '—'} />
          <ViewField label={t('profilePage.plate')} value={vehiclePlate || '—'} />
        </View>
      ) : null}

      <ProfileFeedbackEntry />

      <LegalSettingsLinks />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profilePage.availability')}</Text>
        <Text style={styles.availabilityHint}>{t('profilePage.availabilityHint')}</Text>
        <Pressable
          onPress={() => router.push('/(driver)/calendar')}
          style={({ pressed }) => [styles.calendarLink, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.calendarLinkText}>{t('profilePage.calendarLink')}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profilePage.ratingDetails')}</Text>
        <View style={styles.overallRow}>
          <View>
            <Text style={styles.overallLabel}>{t('profilePage.overall')}</Text>
            <Text style={styles.ratingMeta}>
              {ratingCount > 0
                ? `${ratingAverage.toFixed(1)} · ${ratingCount} ${t('common.rating')}`
                : '—'}
            </Text>
          </View>
          <StarRow value={ratingAverage} />
        </View>
      </View>

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
  nameBlock: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  displayName: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
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
  availabilityHint: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  calendarLink: {
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  calendarLinkText: {
    color: COLORS.goldDark,
    fontWeight: '800',
    fontSize: 14,
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
  phoneViewRow: {
    marginBottom: SPACING.md,
  },
  phoneLink: {
    color: COLORS.goldDark,
    fontSize: 15,
    fontWeight: '700',
  },
  charCount: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: -SPACING.sm,
    marginBottom: SPACING.sm,
  },
  hireHint: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: SPACING.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  statusBadgeLooking: {
    backgroundColor: COLORS.goldTint,
    borderColor: COLORS.gold,
  },
  statusBadgeEmployed: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: COLORS.success,
  },
  statusBadgeNotLooking: {
    backgroundColor: COLORS.surfaceAlt,
    borderColor: COLORS.border,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  statusBadgeTextLooking: { color: COLORS.goldDark },
  statusBadgeTextEmployed: { color: COLORS.success },
  statusBadgeTextNotLooking: { color: COLORS.textMuted },
  employerLine: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  employedHint: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  statusChoices: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  statusChip: {
    flex: 1,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingVertical: 12,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  statusChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  statusChipActiveMuted: {
    borderColor: COLORS.textMuted,
    backgroundColor: COLORS.surfaceAlt,
  },
  statusChipPressed: { opacity: 0.9 },
  statusChipDisabled: { opacity: 0.55 },
  statusChipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusChipTextActive: { color: COLORS.goldDark },
  statusChipTextActiveMuted: { color: COLORS.text },
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
  ratingMeta: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
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
