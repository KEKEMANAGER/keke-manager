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
import { useTranslation } from 'react-i18next';
import { EditModeButtons } from '../../components/EditModeButtons';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { uploadMediaObject, vehiclePhotoObjectPath, withCacheBust } from '../../lib/mediaUpload';
import type { VehiclePhotoKey, VehicleRow } from '../../lib/vehicles';
import {
  deleteVehicle,
  fetchVehiclesByDriver,
  insertVehicle,
  rowToUrlsWithCacheBust,
  saveVehicleDetails,
  saveVehiclePhotoUrl,
  setActiveVehicle,
} from '../../lib/vehicles';
import {
  normalizeVehicleClass as normalizeStoredVehicleClass,
  normalizeVehicleType as normalizeStoredVehicleType,
  VEHICLE_CLASSES,
  VEHICLE_TYPES,
  vehicleClassLabel,
  vehicleTypeLabel,
  type VehicleClassCode,
  type VehicleTypeCode,
} from '../../lib/vehicleCatalog';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import { showValidationAlert, validateVehicleSave } from '../../lib/validation';
import { useAuth } from '../../contexts/AuthContext';

const SLOTS: {
  angle: 'front' | 'left' | 'right' | 'interior' | 'rear';
  labelKey: 'photoFront' | 'photoLeft' | 'photoRight' | 'photoInterior' | 'photoRear';
  column: VehiclePhotoKey;
}[] = [
  { angle: 'front',    labelKey: 'photoFront',    column: 'photo_front' },
  { angle: 'left',     labelKey: 'photoLeft',     column: 'photo_left' },
  { angle: 'right',    labelKey: 'photoRight',    column: 'photo_right' },
  { angle: 'interior', labelKey: 'photoInterior', column: 'photo_interior' },
  { angle: 'rear',     labelKey: 'photoRear',     column: 'photo_rear' },
];

function hasPhotoUrl(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

const emptyWebFileRefs = (): Record<VehiclePhotoKey, HTMLInputElement | null> => ({
  photo_front: null, photo_left: null, photo_right: null,
  photo_interior: null, photo_rear: null,
});

type FormMode = 'view' | 'edit' | 'add';

export default function DriverVehiclePhotosScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id;

  // ── Vehicle list ─────────────────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // ── Photo state for selected vehicle ─────────────────────────────────────
  const [localUrls, setLocalUrls] = useState<Record<VehiclePhotoKey, string | null>>(
    rowToUrlsWithCacheBust(null),
  );
  const [uploadingKey, setUploadingKey] = useState<VehiclePhotoKey | null>(null);

  // ── Form (edit existing / add new) ────────────────────────────────────────
  const [formMode, setFormMode] = useState<FormMode>('view');
  const [editType, setEditType] = useState<VehicleTypeCode>(VEHICLE_TYPES[0]);
  const [editClass, setEditClass] = useState<VehicleClassCode>(VEHICLE_CLASSES[0]);
  const [editModel, setEditModel] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const localUrlsRef = useRef(localUrls);
  localUrlsRef.current = localUrls;
  const webFileInputRefs = useRef<Record<VehiclePhotoKey, HTMLInputElement | null>>(emptyWebFileRefs());

  const selectedVehicle = vehicles.find((v) => v.id === selectedId) ?? null;

  // ── Sync photo URLs when selected vehicle changes ─────────────────────────
  useEffect(() => {
    setLocalUrls(rowToUrlsWithCacheBust(selectedVehicle));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, vehicles]);

  // ── Load vehicles ─────────────────────────────────────────────────────────
  const loadVehicles = useCallback(async () => {
    if (authLoading) return;
    if (!userId) {
      setListLoading(false);
      return;
    }
    setListError(null);
    setListLoading(true);
    const { data, error } = await fetchVehiclesByDriver(userId);
    setListLoading(false);
    if (error) {
      setListError(error.message);
      return;
    }
    setVehicles(data);
    setSelectedId((prev) => {
      if (prev && data.some((v) => v.id === prev)) return prev;
      return data.find((v) => v.is_active)?.id ?? data[0]?.id ?? null;
    });
  }, [userId, authLoading]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  function populateFormFrom(v: VehicleRow) {
    setEditType(normalizeStoredVehicleType(v.type) ?? VEHICLE_TYPES[0]);
    setEditClass(normalizeStoredVehicleClass(v.class) ?? VEHICLE_CLASSES[0]);
    setEditModel(v.model?.trim() ?? '');
    setEditColor(v.color?.trim() ?? '');
    setEditYear(v.year != null ? String(v.year) : '');
    setEditPlate(v.plate?.trim() ?? '');
    setSaveError(null);
  }

  function startEdit() {
    if (selectedVehicle) populateFormFrom(selectedVehicle);
    setFormMode('edit');
  }

  function cancelEdit() {
    setFormMode('view');
    setSaveError(null);
  }

  function startAdd() {
    setEditType(VEHICLE_TYPES[0]);
    setEditClass(VEHICLE_CLASSES[0]);
    setEditModel('');
    setEditColor('');
    setEditYear('');
    setEditPlate('');
    setSaveError(null);
    setFormMode('add');
  }

  function cancelAdd() {
    setFormMode('view');
    setSaveError(null);
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  async function onSaveEdit() {
    if (!userId || !selectedId) return;
    const validationError = validateVehicleSave(editType, editClass);
    if (validationError) {
      setSaveError(validationError);
      showValidationAlert(validationError);
      return;
    }
    setSaveBusy(true);
    setSaveError(null);
    const yearNum = parseInt(editYear.trim(), 10);
    const { error } = await saveVehicleDetails(selectedId, userId, {
      type: editType,
      class: editClass,
      model: editModel.trim() || null,
      color: editColor.trim() || null,
      year: Number.isFinite(yearNum) && yearNum > 1900 ? yearNum : null,
      plate: editPlate.trim() || null,
    });
    setSaveBusy(false);
    if (error) {
      setSaveError(getSupabaseErrorMessage(error));
      return;
    }
    setFormMode('view');
    void loadVehicles();
  }

  // ── Save add (insert new vehicle) ─────────────────────────────────────────
  async function onSaveAdd() {
    if (!userId) return;
    const validationError = validateVehicleSave(editType, editClass);
    if (validationError) {
      setSaveError(validationError);
      showValidationAlert(validationError);
      return;
    }
    setSaveBusy(true);
    setSaveError(null);
    const yearNum = parseInt(editYear.trim(), 10);
    const { data: newV, error } = await insertVehicle(userId, {
      type: editType,
      class: editClass,
      model: editModel.trim() || null,
      color: editColor.trim() || null,
      year: Number.isFinite(yearNum) && yearNum > 1900 ? yearNum : null,
      plate: editPlate.trim() || null,
    });
    setSaveBusy(false);
    if (error || !newV) {
      setSaveError(getSupabaseErrorMessage(error ?? new Error('Failed to create vehicle')));
      return;
    }
    setFormMode('view');
    const { data } = await fetchVehiclesByDriver(userId);
    setVehicles(data);
    setSelectedId(newV.id);
  }

  // ── Set active ────────────────────────────────────────────────────────────
  async function onSetActive() {
    if (!userId || !selectedId) return;
    setSaveBusy(true);
    const { error } = await setActiveVehicle(userId, selectedId);
    setSaveBusy(false);
    if (!error) {
      setVehicles((prev) => prev.map((v) => ({ ...v, is_active: v.id === selectedId })));
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function onDeletePress() {
    if (!userId || !selectedId || !selectedVehicle) return;
    if (selectedVehicle.is_active) {
      Alert.alert(t('system.noticeTitle'), t('vehicleScreen.cannotDeleteActive'));
      return;
    }
    const doDelete = () => {
      void deleteVehicle(selectedId, userId).then(() => loadVehicles());
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('vehicleScreen.deleteConfirmMsg'))) doDelete();
      return;
    }
    Alert.alert(t('vehicleScreen.deleteVehicle'), t('vehicleScreen.deleteConfirmMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.yes'), style: 'destructive', onPress: doDelete },
    ]);
  }

  // ── Photo upload pipeline ─────────────────────────────────────────────────
  const runUploadPipeline = useCallback(
    async (
      column: VehiclePhotoKey,
      angle: string,
      label: string,
      localUri: string,
      mime: string,
      opts?: {
        skipApplyLocalPreview?: boolean;
        revokeObjectUrl?: string;
        webUploadFile?: File;
      },
    ) => {
      const uid = userIdRef.current;
      const vid = selectedIdRef.current;
      if (!uid || !vid) {
        if (opts?.revokeObjectUrl) URL.revokeObjectURL(opts.revokeObjectUrl);
        return;
      }
      const previous = localUrlsRef.current[column];
      if (!opts?.skipApplyLocalPreview) {
        setLocalUrls((prev) => ({ ...prev, [column]: localUri }));
      }
      setUploadingKey(column);

      try {
        // Photos stored at vehicles/{vehicleId}/{angle}.jpg (one dir per vehicle).
        const path = vehiclePhotoObjectPath(vid, angle);
        const uploadSource = opts?.webUploadFile ?? localUri;
        const publicUrl = await uploadMediaObject(path, uploadSource, { contentType: mime });
        const { error } = await saveVehiclePhotoUrl(vid, column, publicUrl);
        if (error) throw error;

        const busted = withCacheBust(publicUrl) ?? publicUrl;
        setLocalUrls((prev) => ({ ...prev, [column]: busted }));

        // Reload all vehicles so the updated photo URL appears in state.
        const { data: fresh } = await fetchVehiclesByDriver(uid);
        if (fresh) setVehicles(fresh);

        if (opts?.revokeObjectUrl) {
          const blob = opts.revokeObjectUrl;
          setTimeout(() => URL.revokeObjectURL(blob), 800);
        }
        Alert.alert(
          t('vehicleScreen.uploadSuccessTitle'),
          t('vehicleScreen.uploadSuccessBody', { label }),
        );
      } catch (e: unknown) {
        setLocalUrls((prev) => ({ ...prev, [column]: previous ?? null }));
        if (opts?.revokeObjectUrl) URL.revokeObjectURL(opts.revokeObjectUrl);
        Alert.alert(
          t('system.errorTitle'),
          e instanceof Error ? e.message : t('vehicleScreen.uploadFailed'),
        );
      } finally {
        setUploadingKey(null);
      }
    },
    [t],
  );

  const handleWebFileInputChange = useCallback(
    (column: VehiclePhotoKey, angle: string, label: string) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        const el = event.currentTarget;
        const file = el.files?.[0];
        el.value = '';
        if (!file || !userIdRef.current) return;
        const mime = file.type?.startsWith('image/') ? file.type : 'image/jpeg';
        const objectUrl = URL.createObjectURL(file);
        setLocalUrls((prev) => ({ ...prev, [column]: objectUrl }));
        void runUploadPipeline(column, angle, label, objectUrl, mime, {
          skipApplyLocalPreview: true,
          revokeObjectUrl: objectUrl,
          webUploadFile: file,
        });
      },
    [runUploadPipeline],
  );

  async function pickNativeAndUpload(column: VehiclePhotoKey, angle: string, label: string) {
    if (!userIdRef.current || !selectedIdRef.current) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('vehicleScreen.permissionTitle'), t('vehicleScreen.permissionBody'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.88,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    await runUploadPipeline(column, angle, label, asset.uri, asset.mimeType ?? 'image/jpeg');
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasAtLeastOnePhoto = useMemo(
    () => SLOTS.some((s) => hasPhotoUrl(localUrls[s.column])),
    [localUrls],
  );
  const missingPhotoLabels = useMemo(
    () => SLOTS.filter((s) => !hasPhotoUrl(localUrls[s.column])).map((s) => t(`vehicleScreen.${s.labelKey}`)),
    [localUrls, t],
  );

  function onSubmitPress() {
    if (!hasAtLeastOnePhoto) return;
    const extra =
      missingPhotoLabels.length > 0
        ? `\n\n${t('vehicleScreen.notUploadedYet', { labels: missingPhotoLabels.join(', ') })}`
        : '';
    const message = t('vehicleScreen.completeMessage', { extra });
    const goDashboard = () => router.replace('/(driver)/dashboard');
    if (Platform.OS === 'web') {
      window.alert(`${t('vehicleScreen.completeTitle')}\n\n${message}`);
      goDashboard();
      return;
    }
    Alert.alert(t('vehicleScreen.completeTitle'), message, [
      { text: t('common.confirm'), onPress: goDashboard },
    ]);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const bottomPad = insets.bottom + SPACING.xl + 96;

  const isFormOpen = formMode === 'edit' || formMode === 'add';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + SPACING.md, paddingBottom: bottomPad },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{t('vehicleScreen.title')}</Text>

      {/* ── Loading / Error ─────────────────────────────────────────────── */}
      {listLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : listError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{listError}</Text>
          <Pressable onPress={() => void loadVehicles()} style={styles.retry}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* ── Vehicle selector + add button ─────────────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.selectorScroll}
            contentContainerStyle={styles.selectorContent}
          >
            {vehicles.map((v, i) => {
              const active = v.id === selectedId;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => {
                    if (formMode !== 'add') {
                      setSelectedId(v.id);
                      if (formMode === 'edit') setFormMode('view');
                    }
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  {v.is_active ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={12}
                      color={active ? '#0f0f0f' : COLORS.success}
                    />
                  ) : null}
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {v.type
                      ? vehicleTypeLabel(normalizeStoredVehicleType(v.type) ?? VEHICLE_TYPES[0])
                      : t('vehicleScreen.vehicleN', { n: i + 1 })}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={startAdd}
              style={[styles.chip, styles.chipAdd, formMode === 'add' && styles.chipActive]}
            >
              <Ionicons
                name="add"
                size={14}
                color={formMode === 'add' ? '#0f0f0f' : COLORS.gold}
              />
              <Text style={[styles.chipText, styles.chipAddText, formMode === 'add' && styles.chipTextActive]}>
                {t('vehicleScreen.addVehicle')}
              </Text>
            </Pressable>
          </ScrollView>

          {/* ── No vehicles empty state ────────────────────────────────── */}
          {vehicles.length === 0 && formMode === 'view' ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="car-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>{t('vehicleScreen.noVehicles')}</Text>
              <Pressable onPress={startAdd} style={styles.addBtn}>
                <Ionicons name="add-circle-outline" size={18} color="#0f0f0f" />
                <Text style={styles.addBtnText}>{t('vehicleScreen.addVehicle')}</Text>
              </Pressable>
            </View>
          ) : null}

          {/* ── Vehicle detail card ────────────────────────────────────── */}
          {(selectedVehicle && formMode !== 'add') || formMode === 'add' ? (
            <View style={styles.metaCard}>
              {formMode === 'add' ? (
                <Text style={styles.metaCardTitle}>{t('vehicleScreen.addVehicle')}</Text>
              ) : (
                <Text style={styles.metaCardTitle}>{t('vehicleScreen.vehicleData')}</Text>
              )}

              {/* Edit / Add mode buttons */}
              {formMode === 'edit' ? (
                <EditModeButtons
                  isEditing
                  onEdit={() => {}}
                  onSave={() => void onSaveEdit()}
                  onCancel={cancelEdit}
                  saveBusy={saveBusy}
                />
              ) : formMode === 'add' ? (
                <EditModeButtons
                  isEditing
                  onEdit={() => {}}
                  onSave={() => void onSaveAdd()}
                  onCancel={cancelAdd}
                  saveBusy={saveBusy}
                />
              ) : (
                <EditModeButtons
                  isEditing={false}
                  onEdit={startEdit}
                  onSave={() => {}}
                  onCancel={() => {}}
                  saveBusy={false}
                />
              )}

              {isFormOpen ? (
                <>
                  <Text style={styles.sectionLabel}>{t('vehicleScreen.type')}</Text>
                  <View style={styles.chipRow}>
                    {VEHICLE_TYPES.map((vt) => (
                      <Pressable
                        key={vt}
                        onPress={() => setEditType(vt)}
                        style={[styles.typeChip, editType === vt && styles.typeChipActive]}
                      >
                        <Text style={[styles.typeChipText, editType === vt && styles.typeChipTextActive]}>
                          {vehicleTypeLabel(vt)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.sectionLabel}>{t('vehicleScreen.class')}</Text>
                  <View style={styles.chipRow}>
                    {VEHICLE_CLASSES.map((vc) => (
                      <Pressable
                        key={vc}
                        onPress={() => setEditClass(vc)}
                        style={[styles.typeChip, editClass === vc && styles.typeChipActive]}
                      >
                        <Text style={[styles.typeChipText, editClass === vc && styles.typeChipTextActive]}>
                          {vehicleClassLabel(vc)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <VehicleField label={t('vehicleScreen.model')} value={editModel} onChangeText={setEditModel} />
                  <VehicleField label={t('vehicleScreen.color')} value={editColor} onChangeText={setEditColor} />
                  <VehicleField label={t('vehicleScreen.year')} value={editYear} onChangeText={setEditYear} keyboardType="number-pad" />
                  <VehicleField label={t('vehicleScreen.plateLabel')} value={editPlate} onChangeText={setEditPlate} />
                </>
              ) : selectedVehicle ? (
                <>
                  <MetaRow label={t('vehicleScreen.type')} value={vehicleTypeLabel(normalizeStoredVehicleType(selectedVehicle.type) ?? VEHICLE_TYPES[0])} />
                  <MetaRow label={t('vehicleScreen.class')} value={vehicleClassLabel(normalizeStoredVehicleClass(selectedVehicle.class) ?? VEHICLE_CLASSES[0])} />
                  <MetaRow label={t('vehicleScreen.model')} value={selectedVehicle.model || '—'} />
                  <MetaRow label={t('vehicleScreen.color')} value={selectedVehicle.color || '—'} />
                  <MetaRow label={t('vehicleScreen.year')} value={selectedVehicle.year != null ? String(selectedVehicle.year) : '—'} />
                  <MetaRow label={t('vehicleScreen.plateLabel')} value={selectedVehicle.plate || '—'} />
                </>
              ) : null}

              {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
            </View>
          ) : null}

          {/* ── Active / Delete action row ─────────────────────────────── */}
          {selectedVehicle && formMode === 'view' ? (
            <View style={styles.actionRow}>
              {selectedVehicle.is_active ? (
                <View style={styles.activeBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                  <Text style={styles.activeBadgeText}>{t('vehicleScreen.activeBadge')}</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => void onSetActive()}
                  disabled={saveBusy}
                  style={({ pressed }) => [styles.setActiveBtn, pressed && styles.pressed]}
                >
                  {saveBusy ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.white} />
                      <Text style={styles.setActiveBtnText}>{t('vehicleScreen.setActive')}</Text>
                    </>
                  )}
                </Pressable>
              )}
              {!selectedVehicle.is_active ? (
                <Pressable onPress={onDeletePress} style={styles.deleteBtn} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* ── Photo slots (only when a vehicle is selected, not in add mode) ── */}
          {selectedVehicle && formMode !== 'add' ? (
            <>
              <Text style={styles.photosSectionTitle}>
                {t('vehicleScreen.photos')}
              </Text>
              <Text style={styles.sub}>
                {t('vehicleScreen.photosSubtitle', {
                  webHint: Platform.OS === 'web' ? t('vehicleScreen.photosWebHint') : '',
                })}
              </Text>

              {SLOTS.map((slot) => {
                const uri = localUrls[slot.column];
                const busy = uploadingKey === slot.column;
                const showImage = hasPhotoUrl(uri);
                const label = t(`vehicleScreen.${slot.labelKey}`);
                return (
                  <View key={slot.column} style={styles.slot}>
                    <Text style={styles.slotLabel}>{label}</Text>
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
                            flex: 1, position: 'relative', display: 'flex',
                            flexDirection: 'row', alignItems: 'center',
                            justifyContent: 'center', gap: SPACING.sm,
                            backgroundColor: COLORS.gold, borderRadius: 14,
                            paddingTop: 14, paddingBottom: 14,
                            cursor: busy || !selectedId ? 'not-allowed' : 'pointer',
                            opacity: busy || !selectedId ? 0.7 : 1,
                            boxShadow: '0 2px 8px rgba(245, 166, 35, 0.35)',
                            overflow: 'hidden',
                          }}
                        >
                          <input
                            ref={(node) => { webFileInputRefs.current[slot.column] = node; }}
                            type="file"
                            accept="image/*"
                            disabled={busy || !selectedId}
                            onChange={handleWebFileInputChange(slot.column, slot.angle, label)}
                            style={{
                              position: 'absolute', inset: 0, width: '100%', height: '100%',
                              opacity: 0, cursor: busy ? 'not-allowed' : 'pointer',
                              zIndex: 1, fontSize: 0,
                            }}
                          />
                          <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                            <Ionicons name="camera" size={18} color="#000000" />
                            <Text style={styles.uploadBtnText}>
                              {showImage ? t('vehicleScreen.reupload') : t('vehicleScreen.upload')}
                            </Text>
                          </View>
                        </label>
                      ) : (
                        <Pressable
                          onPress={() => void pickNativeAndUpload(slot.column, slot.angle, label)}
                          disabled={busy || !selectedId}
                          style={({ pressed }) => [
                            styles.uploadBtn,
                            SHADOWS.button,
                            pressed && styles.pressed,
                            busy && styles.btnDisabled,
                          ]}
                        >
                          <Ionicons name="camera" size={18} color="#000000" />
                          <Text style={styles.uploadBtnText}>
                            {showImage ? t('vehicleScreen.reupload') : t('vehicleScreen.upload')}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}

              <Pressable
                onPress={onSubmitPress}
                disabled={!hasAtLeastOnePhoto}
                style={({ pressed }) => [
                  styles.submit,
                  !hasAtLeastOnePhoto && styles.submitDisabled,
                  pressed && hasAtLeastOnePhoto && styles.pressed,
                ]}
              >
                <Text style={[styles.submitText, !hasAtLeastOnePhoto && styles.submitTextDisabled]}>
                  {t('vehicleScreen.finish')}
                </Text>
              </Pressable>
              {!hasAtLeastOnePhoto ? (
                <Text style={styles.submitHint}>{t('vehicleScreen.finishHint')}</Text>
              ) : missingPhotoLabels.length > 0 ? (
                <Text style={styles.submitHint}>
                  {t('vehicleScreen.missingOptional', { labels: missingPhotoLabels.join(', ') })}
                </Text>
              ) : null}
            </>
          ) : null}
        </>
      )}
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
  screen:  { flex: 1, backgroundColor: COLORS.background },
  scroll:  { paddingHorizontal: SPACING.lg },
  title:   { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: SPACING.sm },
  sub:     { color: COLORS.grayLight, fontSize: 14, lineHeight: 20, marginBottom: SPACING.md },
  center:  { paddingVertical: SPACING.xl * 2, alignItems: 'center' },

  // ── Vehicle selector ──────────────────────────────────────────────────────
  selectorScroll:  { marginBottom: SPACING.md },
  selectorContent: { flexDirection: 'row', gap: SPACING.sm, paddingRight: SPACING.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12,
    backgroundColor: COLORS.white,
  },
  chipActive:    { borderColor: COLORS.gold, backgroundColor: COLORS.gold },
  chipAdd:       { borderColor: COLORS.gold, borderStyle: 'dashed' },
  chipText:      { color: COLORS.grayLight, fontSize: 13, fontWeight: '600' },
  chipTextActive:{ color: '#0f0f0f' },
  chipAddText:   { color: COLORS.gold },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center', paddingVertical: SPACING.xl * 2,
    gap: SPACING.md,
  },
  emptyText: {
    color: COLORS.textSecondary, fontSize: 15, textAlign: 'center',
    lineHeight: 22, paddingHorizontal: SPACING.lg,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.gold, borderRadius: RADIUS.button,
    paddingVertical: 12, paddingHorizontal: SPACING.lg,
  },
  addBtnText: { color: '#0f0f0f', fontWeight: '800', fontSize: 15 },

  // ── Meta card ─────────────────────────────────────────────────────────────
  metaCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.card,
  },
  metaCardTitle: {
    color: COLORS.gold, fontSize: 13, fontWeight: '700',
    letterSpacing: 0.8, marginBottom: SPACING.sm, textTransform: 'uppercase',
  },
  metaRow:   { marginBottom: SPACING.md },
  metaLabel: { color: COLORS.grayLight, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  metaValue: { color: COLORS.text, fontSize: 15, fontWeight: '600' },

  // ── Form fields ───────────────────────────────────────────────────────────
  sectionLabel: {
    color: COLORS.goldLight, fontSize: 13, fontWeight: '700',
    marginBottom: SPACING.sm, marginTop: SPACING.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  typeChip: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12, backgroundColor: COLORS.white,
  },
  typeChipActive:     { borderColor: COLORS.gold, backgroundColor: 'rgba(245,166,35,0.15)' },
  typeChipText:       { color: COLORS.grayLight, fontSize: 13, fontWeight: '600' },
  typeChipTextActive: { color: COLORS.gold },
  field:       { marginBottom: SPACING.md },
  fieldLabel:  { color: COLORS.grayLight, fontSize: 13, fontWeight: '600', marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.input, paddingHorizontal: SPACING.md,
    paddingVertical: 12, color: COLORS.text, fontSize: 15,
  },
  saveError: { color: COLORS.error, fontSize: 13, marginTop: SPACING.sm },

  // ── Active / Delete row ───────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  activeBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)', borderRadius: RADIUS.button,
    paddingVertical: 10, paddingHorizontal: SPACING.md,
  },
  activeBadgeText: { color: COLORS.success, fontWeight: '700', fontSize: 14 },
  setActiveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.gold, borderRadius: RADIUS.button,
    paddingVertical: 10, paddingHorizontal: SPACING.md,
  },
  setActiveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  deleteBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)', alignItems: 'center', justifyContent: 'center',
  },

  // ── Photos section ────────────────────────────────────────────────────────
  photosSectionTitle: {
    color: COLORS.gold, fontSize: 13, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm,
  },
  slot: {
    marginBottom: SPACING.lg, backgroundColor: COLORS.white,
    borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, ...SHADOWS.card,
  },
  slotLabel: { color: COLORS.goldLight, fontSize: 15, fontWeight: '700', marginBottom: SPACING.md },
  slotBody:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  preview: {
    width: 100, height: 100, borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    borderStyle: 'dashed', overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  previewImg: { width: '100%', height: '100%' },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  uploadBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 14,
  },
  uploadBtnText: { color: '#000000', fontWeight: '800', fontSize: 15 },
  btnDisabled: { opacity: 0.7 },

  // ── Finish ────────────────────────────────────────────────────────────────
  submit: {
    marginTop: SPACING.md, backgroundColor: COLORS.gold,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  submitDisabled:     { backgroundColor: COLORS.border },
  submitText:         { color: '#000000', fontSize: 16, fontWeight: '800' },
  submitTextDisabled: { color: COLORS.gray },
  submitHint: {
    color: COLORS.gray, fontSize: 13, textAlign: 'center',
    marginTop: SPACING.sm, marginBottom: SPACING.md,
  },

  // ── Error ─────────────────────────────────────────────────────────────────
  errorBox: {
    padding: SPACING.md, borderRadius: 12, backgroundColor: 'rgba(244,67,54,0.1)',
    borderWidth: 1, borderColor: COLORS.error, marginBottom: SPACING.md,
  },
  errorText: { color: COLORS.error, marginBottom: SPACING.sm },
  retry:     { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: COLORS.surface, borderRadius: 8 },
  retryText: { color: COLORS.gold, fontWeight: '700' },

  pressed: { opacity: 0.9 },
});
