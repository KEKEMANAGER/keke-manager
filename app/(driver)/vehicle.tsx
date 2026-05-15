import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditModeButtons } from '../../components/EditModeButtons';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { uploadMediaObject, vehiclePhotoObjectPath, withCacheBust } from '../../lib/mediaUpload';
import type { VehiclePhotoKey } from '../../lib/vehicles';
import {
  fetchVehicleByDriver,
  rowToUrlsWithCacheBust,
  saveVehicleDetails,
  saveVehiclePhotoUrl,
} from '../../lib/vehicles';
import { useAuth } from '../../contexts/AuthContext';

const VEHICLE_TYPES = [
  'სედანი',
  'მინივენი',
  'SUV',
  'მიკროავტობუსი',
  'ავტობუსი',
  'სპეც. ტრანსპორტი',
] as const;

const VEHICLE_CLASSES = ['ეკონომი', 'კომფორტი', 'ბიზნეს', 'პრემიუმ', 'VIP'] as const;

function normalizeVehicleType(raw: string | null | undefined): string {
  if (!raw) return VEHICLE_TYPES[0];
  if ((VEHICLE_TYPES as readonly string[]).includes(raw)) return raw;
  if (raw === 'sedan') return 'სედანი';
  return VEHICLE_TYPES[0];
}

function normalizeVehicleClass(raw: string | null | undefined): string {
  if (!raw) return VEHICLE_CLASSES[0];
  if ((VEHICLE_CLASSES as readonly string[]).includes(raw)) return raw;
  return VEHICLE_CLASSES[0];
}

const SLOTS: {
  angle: 'front' | 'left' | 'right' | 'interior' | 'rear';
  label: string;
  column: VehiclePhotoKey;
}[] = [
  { angle: 'front', label: 'წინა', column: 'photo_front' },
  { angle: 'left', label: 'მარცხენა', column: 'photo_left' },
  { angle: 'right', label: 'მარჯვენა', column: 'photo_right' },
  { angle: 'interior', label: 'სალონი', column: 'photo_interior' },
  { angle: 'rear', label: 'უკანა', column: 'photo_rear' },
];

function hasPhotoUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

const emptyWebFileRefs = (): Record<VehiclePhotoKey, HTMLInputElement | null> => ({
  photo_front: null,
  photo_left: null,
  photo_right: null,
  photo_interior: null,
  photo_rear: null,
});

export default function DriverVehiclePhotosScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id;

  const [urls, setUrls] = useState<Record<VehiclePhotoKey, string | null>>(() =>
    rowToUrlsWithCacheBust(null),
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<VehiclePhotoKey | null>(null);
  const [vehicleType, setVehicleType] = useState<string>(VEHICLE_TYPES[0]);
  const [vehicleClass, setVehicleClass] = useState<string>(VEHICLE_CLASSES[0]);
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const vehicleTypeRef = useRef(vehicleType);
  vehicleTypeRef.current = vehicleType;
  /** One real `<input type="file">` per slot on web (reliable file picker + label hit target). */
  const webFileInputRefs = useRef<Record<VehiclePhotoKey, HTMLInputElement | null>>(emptyWebFileRefs());

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!userId) {
      setUrls(rowToUrlsWithCacheBust(null));
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    const { data, error } = await fetchVehicleByDriver(userId);
    setLoading(false);
    if (error) {
      setLoadError(error.message);
      setUrls(rowToUrlsWithCacheBust(null));
      return;
    }
    setUrls(rowToUrlsWithCacheBust(data));
    if (data) {
      setVehicleType(normalizeVehicleType(data.type));
      setVehicleClass(normalizeVehicleClass(data.class));
      setModel(data.model?.trim() ?? '');
      setColor(data.color?.trim() ?? '');
      setYear(data.year != null && !Number.isNaN(Number(data.year)) ? String(data.year) : '');
      setPlate(data.plate?.trim() ?? '');
    } else {
      setVehicleType(VEHICLE_TYPES[0]);
      setVehicleClass(VEHICLE_CLASSES[0]);
      setModel('');
      setColor('');
      setYear('');
      setPlate('');
    }
  }, [userId, authLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  function onStartEdit() {
    setIsEditing(true);
    setSaveError(null);
  }

  function onCancelEdit() {
    setIsEditing(false);
    setSaveError(null);
    void load();
  }

  async function onSaveVehicle() {
    if (!userId) return;
    setSaveBusy(true);
    setSaveError(null);
    const yearNum = parseInt(year.trim(), 10);
    const { error } = await saveVehicleDetails(userId, {
      type: vehicleType,
      class: vehicleClass,
      model: model.trim() || null,
      color: color.trim() || null,
      year: Number.isFinite(yearNum) && yearNum > 1900 ? yearNum : null,
      plate: plate.trim() || null,
    });
    setSaveBusy(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setIsEditing(false);
    void load();
  }

  const hasAtLeastOnePhoto = useMemo(
    () => SLOTS.some((s) => hasPhotoUrl(urls[s.column])),
    [urls],
  );

  /** Labels for slots still empty (informational under the button). */
  const missingPhotoLabels = useMemo(
    () => SLOTS.filter((s) => !hasPhotoUrl(urls[s.column])).map((s) => s.label),
    [urls],
  );

  const runUploadPipeline = useCallback(
    async (
      column: VehiclePhotoKey,
      angle: string,
      label: string,
      localUri: string,
      mime: string,
      opts?: {
        /** Web file input: preview URI already applied synchronously */
        skipApplyLocalPreview?: boolean;
        /** Blob URL to revoke after public URL is shown (deferred), or immediately on failure */
        revokeObjectUrl?: string;
        /** Web: pass the real `File` to Storage (not the blob preview URI) */
        webUploadFile?: File;
      },
    ) => {
      const cid = userIdRef.current;
      if (!cid) {
        if (opts?.revokeObjectUrl) URL.revokeObjectURL(opts.revokeObjectUrl);
        return;
      }
      const previous = urlsRef.current[column];
      if (!opts?.skipApplyLocalPreview) {
        setUrls((prev) => ({ ...prev, [column]: localUri }));
      }
      setUploadingKey(column);
      setLoadError(null);

      try {
        const path = vehiclePhotoObjectPath(cid, angle);
        const uploadSource = opts?.webUploadFile ?? localUri;
        const publicUrl = await uploadMediaObject(path, uploadSource, { contentType: mime });
        const { error } = await saveVehiclePhotoUrl(
          cid,
          column,
          publicUrl,
          vehicleTypeRef.current || 'sedan',
        );
        if (error) {
          throw error;
        }
        const busted = withCacheBust(publicUrl) ?? publicUrl;
        setUrls((prev) => ({ ...prev, [column]: busted }));
        const { data: fresh } = await fetchVehicleByDriver(cid);
        if (fresh) {
          setUrls(rowToUrlsWithCacheBust(fresh));
        }
        if (opts?.revokeObjectUrl) {
          const blob = opts.revokeObjectUrl;
          setTimeout(() => URL.revokeObjectURL(blob), 800);
        }
        Alert.alert('შენახულია', `„${label}“ — ფოტო ატვირთულია Supabase Storage-ში და URL შენახულია.`);
      } catch (e: unknown) {
        setUrls((prev) => ({ ...prev, [column]: previous ?? null }));
        if (opts?.revokeObjectUrl) URL.revokeObjectURL(opts.revokeObjectUrl);
        Alert.alert('შეცდომა', e instanceof Error ? e.message : 'ატვირთვა ვერ მოხერხდა');
      } finally {
        setUploadingKey(null);
      }
    },
    [],
  );

  const handleWebFileInputChange = useCallback(
    (column: VehiclePhotoKey, angle: string, label: string) => (event: ChangeEvent<HTMLInputElement>) => {
      const el = event.currentTarget;
      const file = el.files?.[0];
      el.value = '';
      if (!file || !userIdRef.current) return;

      const mime = file.type?.startsWith('image/') ? file.type : 'image/jpeg';
      const objectUrl = URL.createObjectURL(file);
      setUrls((prev) => ({ ...prev, [column]: objectUrl }));

      void runUploadPipeline(column, angle, label, objectUrl, mime, {
        skipApplyLocalPreview: true,
        revokeObjectUrl: objectUrl,
        webUploadFile: file,
      });
    },
    [runUploadPipeline],
  );

  async function pickNativeAndUpload(column: VehiclePhotoKey, angle: string, label: string) {
    const cid = userIdRef.current;
    if (!cid) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('წვდომა', 'ფოტოების წვდომა საჭიროა ატვირთვისთვის.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.88,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const mime = asset.mimeType ?? 'image/jpeg';
    await runUploadPipeline(column, angle, label, asset.uri, mime);
  }

  function onSubmitPress() {
    console.log('[vehicle] დასრულება pressed', {
      hasAtLeastOnePhoto,
      userId: !!userId,
      missing: missingPhotoLabels,
    });

    if (!hasAtLeastOnePhoto) {
      console.log('[vehicle] დასრულება: early return (no photos in state)');
      return;
    }

    const missing = missingPhotoLabels;
    const extra =
      missing.length > 0
        ? `\n\nჯერ არ არის ატვირთული: ${missing.join(', ')}.`
        : '';
    const message = `ფოტო(ები) Supabase-შია (vehicles + bucket media).${extra}`;

    const goDashboard = () => {
      router.replace('/(driver)/dashboard');
    };

    // react-native-web: Alert.alert is often a no-op — use window.alert so the user sees feedback.
    if (Platform.OS === 'web') {
      window.alert(`დასრულებულია\n\n${message}`);
      goDashboard();
      return;
    }

    Alert.alert('დასრულებულია', message, [{ text: 'კარგი', onPress: goDashboard }]);
  }

  const bottomPad = insets.bottom + SPACING.xl + 96;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + SPACING.md, paddingBottom: bottomPad },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>ავტომობილის ფოტოები</Text>
      <Text style={styles.sub}>
        ატვირთეთ სასურველი ხედები (ერთი ან მეტი). ბილიკი: media → vehicles/[user_id]/[კუთხე].jpg
        {Platform.OS === 'web' ? ' · ვებზე: თითო ღილაკი უკავშირდება ფაილის არჩევას.' : ''}
      </Text>

      <View style={styles.metaCard}>
        <Text style={styles.metaCardTitle}>ავტომობილის მონაცემები</Text>
        <EditModeButtons
          isEditing={isEditing}
          onEdit={onStartEdit}
          onSave={() => void onSaveVehicle()}
          onCancel={onCancelEdit}
          saveBusy={saveBusy}
        />
        {isEditing ? (
          <>
            <Text style={styles.sectionLabel}>ტიპი</Text>
            <View style={styles.chipRow}>
              {VEHICLE_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setVehicleType(t)}
                  style={[styles.chip, vehicleType === t && styles.chipActive]}
                >
                  <Text style={[styles.chipText, vehicleType === t && styles.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sectionLabel}>კლასი</Text>
            <View style={styles.chipRow}>
              {VEHICLE_CLASSES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setVehicleClass(c)}
                  style={[styles.chip, vehicleClass === c && styles.chipActive]}
                >
                  <Text style={[styles.chipText, vehicleClass === c && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <VehicleField label="მოდელი" value={model} onChangeText={setModel} />
            <VehicleField label="ფერი" value={color} onChangeText={setColor} />
            <VehicleField label="წელი" value={year} onChangeText={setYear} keyboardType="number-pad" />
            <VehicleField label="სანომრე ნიშანი" value={plate} onChangeText={setPlate} />
          </>
        ) : (
          <>
            <MetaRow label="ტიპი" value={vehicleType} />
            <MetaRow label="კლასი" value={vehicleClass} />
            <MetaRow label="მოდელი" value={model || '—'} />
            <MetaRow label="ფერი" value={color || '—'} />
            <MetaRow label="წელი" value={year || '—'} />
            <MetaRow label="სანომრე ნიშანი" value={plate || '—'} />
          </>
        )}
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
      </View>

      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable onPress={() => void load()} style={styles.retry}>
            <Text style={styles.retryText}>ხელახლა</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : (
        SLOTS.map((slot) => {
          const uri = urls[slot.column];
          const busy = uploadingKey === slot.column;
          const showImage = hasPhotoUrl(uri);
          return (
            <View key={slot.column} style={styles.slot}>
              <Text style={styles.slotLabel}>{slot.label}</Text>
              <View style={styles.slotBody}>
                <View style={styles.preview}>
                  {showImage ? (
                    <Image
                      key={uri}
                      source={{ uri: uri! }}
                      style={styles.previewImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons name="image-outline" size={40} color={COLORS.gray} />
                  )}
                  {busy ? (
                    <View style={styles.busyOverlay}>
                      <ActivityIndicator color={COLORS.gold} />
                    </View>
                  ) : null}
                </View>
                {Platform.OS === 'web' ? (
                  <label
                    style={{
                      flex: 1,
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: SPACING.sm,
                      backgroundColor: COLORS.gold,
                      borderRadius: 14,
                      paddingTop: 14,
                      paddingBottom: 14,
                      cursor: busy || !userId ? 'not-allowed' : 'pointer',
                      opacity: busy || !userId ? 0.7 : 1,
                      boxShadow: '0 2px 8px rgba(245, 166, 35, 0.35)',
                      overflow: 'hidden',
                    }}
                  >
                    <input
                      ref={(node) => {
                        webFileInputRefs.current[slot.column] = node;
                      }}
                      type="file"
                      accept="image/*"
                      disabled={busy || !userId}
                      onChange={handleWebFileInputChange(slot.column, slot.angle, slot.label)}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        cursor: busy || !userId ? 'not-allowed' : 'pointer',
                        zIndex: 1,
                        fontSize: 0,
                      }}
                    />
                    <View
                      pointerEvents="none"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: SPACING.sm,
                      }}
                    >
                      <Ionicons name="camera" size={18} color="#000000" />
                      <Text style={styles.uploadBtnText}>{showImage ? 'თავიდან' : 'ატვირთვა'}</Text>
                    </View>
                  </label>
                ) : (
                  <Pressable
                    onPress={() => void pickNativeAndUpload(slot.column, slot.angle, slot.label)}
                    disabled={busy || !userId}
                    style={({ pressed }) => [
                      styles.uploadBtn,
                      SHADOWS.button,
                      pressed && styles.pressed,
                      busy && styles.btnDisabled,
                    ]}
                  >
                    <Ionicons name="camera" size={18} color="#000000" />
                    <Text style={styles.uploadBtnText}>{showImage ? 'თავიდან' : 'ატვირთვა'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })
      )}

      <Pressable
        onPress={onSubmitPress}
        disabled={!hasAtLeastOnePhoto}
        style={({ pressed }) => [
          styles.submit,
          !hasAtLeastOnePhoto && styles.submitDisabled,
          pressed && hasAtLeastOnePhoto && styles.pressed,
        ]}
        accessibilityState={{ disabled: !hasAtLeastOnePhoto }}
      >
        <Text style={[styles.submitText, !hasAtLeastOnePhoto && styles.submitTextDisabled]}>დასრულება</Text>
      </Pressable>
      {!hasAtLeastOnePhoto && !loading ? (
        <Text style={styles.submitHint}>დასრულება ჩაირთვება, როცა მინიმუმ ერთ ხედზე ფოტო აიტვირთება.</Text>
      ) : hasAtLeastOnePhoto && missingPhotoLabels.length > 0 ? (
        <Text style={styles.submitHint}>
          სურვილისამებრ: ჯერ არ არის — {missingPhotoLabels.join(', ')}.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function VehicleField({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={COLORS.gray}
        style={styles.input}
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
    fontSize: 22,
    fontWeight: '800',
    marginBottom: SPACING.sm,
  },
  sub: {
    color: COLORS.grayLight,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  metaCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  metaCardTitle: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  metaRow: {
    marginBottom: SPACING.md,
  },
  metaLabel: {
    color: COLORS.grayLight,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  metaValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
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
  saveError: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: SPACING.sm,
  },
  sectionLabel: {
    color: COLORS.goldLight,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
  },
  chipActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245, 166, 35, 0.15)',
  },
  chipText: {
    color: COLORS.grayLight,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.gold,
  },
  errorBox: {
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderWidth: 1,
    borderColor: COLORS.error,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    marginBottom: SPACING.sm,
  },
  retry: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  retryText: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  center: {
    paddingVertical: SPACING.xl * 2,
    alignItems: 'center',
  },
  slot: {
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOWS.card,
  },
  slotLabel: {
    color: COLORS.goldLight,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  slotBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  preview: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImg: {
    width: '100%',
    height: '100%',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 14,
  },
  uploadBtnText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  submit: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: COLORS.border,
  },
  submitText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  submitTextDisabled: {
    color: COLORS.gray,
  },
  submitHint: {
    color: COLORS.gray,
    fontSize: 13,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  pressed: {
    opacity: 0.9,
  },
});
