import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
} from 'react';
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
import { VehicleTechPassportSection } from '../../components/driver/VehicleTechPassportSection';
import { EditModeButtons } from '../../components/EditModeButtons';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { uploadMediaObject, vehiclePhotoObjectPath, withCacheBust } from '../../lib/mediaUpload';
import type { VehiclePhotoKey, VehicleRow } from '../../lib/vehicles';
import {
  clearVehiclePhotoUrl,
  deleteVehicle,
  fetchVehiclesByDriver,
  insertVehicle,
  rowToUrlsWithCacheBust,
  saveVehicleDetails,
  saveVehiclePhotoUrl,
  toggleVehicleActive,
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
import {
  TYPE_TO_MAKE_CATEGORY,
  fetchVehicleMakeById,
  fetchVehicleModelById,
  type VehicleMakeRow,
  type VehicleModelRow,
} from '../../lib/vehicleData';
import {
  VehicleMakeSelect,
  VehicleModelSelect,
  VehiclePassengerCapacityInput,
  VehicleYearSelect,
} from '../../components/driver/VehicleCatalogSelect';
import { assignSubDriverToVehicle, resolveDriverUserId } from '../../lib/fleet';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import {
  parsePassengerCapacity,
  showValidationAlert,
  validatePassengerCapacity,
  validateVehicleSave,
} from '../../lib/validation';
import { useAuth } from '../../contexts/AuthContext';
import { vehicleIsApproved } from '../../lib/vehicleVerification';

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

type PhotoSlotDef = (typeof SLOTS)[number];

// ── Photos accordion (edit / add forms) ───────────────────────────────────────
function VehiclePhotosAccordion({
  vehicleId,
  localUrls,
  uploadingKey,
  expandedSlots,
  onToggleSlot,
  onDeletePhoto,
  onPickNative,
  webFileInputRefs,
  onWebFileChange,
  disabled,
}: {
  vehicleId: string | null;
  localUrls: Record<VehiclePhotoKey, string | null>;
  uploadingKey: VehiclePhotoKey | null;
  expandedSlots: Partial<Record<VehiclePhotoKey, boolean>>;
  onToggleSlot: (column: VehiclePhotoKey) => void;
  onDeletePhoto: (column: VehiclePhotoKey) => void;
  onPickNative: (slot: PhotoSlotDef) => void;
  webFileInputRefs: MutableRefObject<Record<VehiclePhotoKey, HTMLInputElement | null>>;
  onWebFileChange: (slot: PhotoSlotDef) => (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.photosAccordion}>
      <Text style={styles.photosAccordionTitle}>{t('vehicleScreen.photos')}</Text>
      {SLOTS.map((slot) => {
        const uri = localUrls[slot.column];
        const hasPhoto = hasPhotoUrl(uri);
        const expanded = !!expandedSlots[slot.column];
        const busy = uploadingKey === slot.column;
        const label = t(`vehicleScreen.${slot.labelKey}`);

        return (
          <View
            key={slot.column}
            style={styles.accordionItem}
          >
            <Pressable
              onPress={() => onToggleSlot(slot.column)}
              style={({ pressed }) => [styles.accordionHeader, pressed && styles.pressed]}
            >
              <Text style={styles.accordionHeaderLabel}>{label}</Text>
              <View style={styles.accordionHeaderRight}>
                {hasPhoto ? (
                  <Image source={{ uri: uri! }} style={styles.accordionHeaderThumb} resizeMode="cover" />
                ) : (
                  <View style={styles.accordionHeaderThumbEmpty}>
                    <Ionicons name="image-outline" size={14} color={COLORS.textMuted} />
                  </View>
                )}
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={COLORS.textSecondary}
                />
              </View>
            </Pressable>

            {expanded ? (
              <View style={styles.accordionBody}>
                {hasPhoto ? (
                  <View style={styles.accordionPreviewWrap}>
                    <Image source={{ uri: uri! }} style={styles.accordionPreview} resizeMode="cover" />
                    {busy ? (
                      <View style={styles.busyOverlay}>
                        <ActivityIndicator color={COLORS.gold} size="small" />
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.accordionActions}>
                  {hasPhoto ? (
                    <Pressable
                      onPress={() => onDeletePhoto(slot.column)}
                      disabled={busy || disabled}
                      style={({ pressed }) => [
                        styles.accordionBtnOutline,
                        (busy || disabled) && styles.btnDisabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="trash-outline" size={15} color={COLORS.error} />
                      <Text style={styles.accordionBtnOutlineText}>{t('vehicleScreen.deletePhoto')}</Text>
                    </Pressable>
                  ) : null}

                  {Platform.OS === 'web' ? (
                    <label
                      style={{
                        flex: hasPhoto ? 1 : undefined,
                        alignSelf: hasPhoto ? 'stretch' : 'flex-start',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        borderWidth: 1,
                        borderColor: COLORS.gold,
                        borderRadius: 10,
                        paddingTop: 10,
                        paddingBottom: 10,
                        paddingLeft: 14,
                        paddingRight: 14,
                        backgroundColor: COLORS.goldTint,
                        cursor: busy || disabled || !vehicleId ? 'not-allowed' : 'pointer',
                        opacity: busy || disabled || !vehicleId ? 0.55 : 1,
                      }}
                    >
                      <input
                        ref={(node) => {
                          webFileInputRefs.current[slot.column] = node;
                        }}
                        type="file"
                        accept="image/*"
                        disabled={busy || disabled || !vehicleId}
                        onChange={onWebFileChange(slot)}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          cursor: busy || disabled || !vehicleId ? 'not-allowed' : 'pointer',
                          fontSize: 0,
                        }}
                      />
                      <Ionicons name="cloud-upload-outline" size={16} color={COLORS.goldDark} />
                      <Text style={styles.accordionBtnUploadText}>{t('vehicleScreen.upload')}</Text>
                    </label>
                  ) : (
                    <Pressable
                      onPress={() => onPickNative(slot)}
                      disabled={busy || disabled || !vehicleId}
                      style={({ pressed }) => [
                        styles.accordionBtnUpload,
                        !hasPhoto && styles.accordionBtnUploadSolo,
                        (busy || disabled) && styles.btnDisabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={COLORS.goldDark} />
                      <Text style={styles.accordionBtnUploadText}>{t('vehicleScreen.upload')}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function vehicleRegistrationLabel(vehicle: VehicleRow, fallback: string): string {
  const model = typeof vehicle.model === 'string' ? vehicle.model.trim() : '';
  const plate = typeof vehicle.plate === 'string' ? vehicle.plate.trim() : '';
  const parts = [model, plate].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : fallback;
}

function VehicleRegistrationMediaBlock({
  vehicle,
  vehicleId,
  localUrls,
  uploadingKey,
  expandedSlots,
  onToggleSlot,
  onDeletePhoto,
  onPickNative,
  webFileInputRefs,
  onWebFileChange,
  driverId,
  disabled,
  onUpdated,
}: {
  vehicle: VehicleRow | null;
  vehicleId: string | null;
  localUrls: Record<VehiclePhotoKey, string | null>;
  uploadingKey: VehiclePhotoKey | null;
  expandedSlots: Partial<Record<VehiclePhotoKey, boolean>>;
  onToggleSlot: (column: VehiclePhotoKey) => void;
  onDeletePhoto: (column: VehiclePhotoKey) => void;
  onPickNative: (slot: PhotoSlotDef) => void;
  webFileInputRefs: MutableRefObject<Record<VehiclePhotoKey, HTMLInputElement | null>>;
  onWebFileChange: (slot: PhotoSlotDef) => (event: ChangeEvent<HTMLInputElement>) => void;
  driverId: string | undefined;
  disabled?: boolean;
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  if (!vehicle || !vehicleId) return null;

  return (
    <View style={styles.registrationMediaInForm}>
      <Text style={styles.registrationMediaTitle}>{t('vehicleScreen.registrationMedia')}</Text>
      <Text style={styles.registrationMediaSubtitle}>
        {vehicleRegistrationLabel(vehicle, t('vehicleScreen.vehicleN', { n: 1 }))}
      </Text>
      <Text style={styles.registrationMediaHint}>{t('vehicleScreen.registrationMediaHint')}</Text>

      <VehiclePhotosAccordion
        vehicleId={vehicleId}
        localUrls={localUrls}
        uploadingKey={uploadingKey}
        expandedSlots={expandedSlots}
        onToggleSlot={onToggleSlot}
        onDeletePhoto={onDeletePhoto}
        onPickNative={onPickNative}
        webFileInputRefs={webFileInputRefs}
        onWebFileChange={onWebFileChange}
        disabled={disabled}
      />

      <VehicleTechPassportSection
        vehicle={vehicle}
        driverId={driverId}
        disabled={disabled}
        embedded
        onUpdated={onUpdated}
      />
    </View>
  );
}

// ── Vehicle list card ─────────────────────────────────────────────────────────
function VehicleListCard({
  vehicle,
  index,
  isSelected,
  isEditTarget,
  saveBusy,
  onSelect,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  vehicle: VehicleRow;
  index: number;
  isSelected: boolean;
  isEditTarget: boolean;
  saveBusy: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const type = normalizeStoredVehicleType(vehicle.type) ?? VEHICLE_TYPES[0];
  const cls  = normalizeStoredVehicleClass(vehicle.class) ?? VEHICLE_CLASSES[0];
  const name = vehicle.model?.trim() || vehicleTypeLabel(type);
  const subtitle = [vehicleClassLabel(cls), vehicle.plate?.trim(), vehicle.year ? String(vehicle.year) : null, vehicle.color?.trim()]
    .filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.vehicleCard,
        vehicle.is_active && styles.vehicleCardActive,
        isEditTarget && styles.vehicleCardEditing,
        (isSelected && !isEditTarget) && styles.vehicleCardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.vehicleCardInner}>
        {/* Left accent stripe */}
        <View style={[styles.cardStripe, vehicle.is_active ? styles.cardStripeActive : styles.cardStripeInactive]} />

        <View style={styles.vehicleCardContent}>
          {/* Title + active badge */}
          <View style={styles.vehicleCardHeaderRow}>
            <Text style={styles.vehicleCardName} numberOfLines={1}>
              {name || t('vehicleScreen.vehicleN', { n: index + 1 })}
            </Text>
            {vehicle.is_active ? (
              <View style={styles.activePill}>
                <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                <Text style={styles.activePillText}>{t('vehicleScreen.activeBadge')}</Text>
              </View>
            ) : vehicleIsApproved(vehicle) ? (
              <View style={[styles.activePill, styles.verifiedPill]}>
                <Text style={styles.verifiedPillText}>{t('vehicleScreen.verifiedBadge')}</Text>
              </View>
            ) : vehicle.verification_status === 'submitted' ? (
              <View style={[styles.activePill, styles.pendingPill]}>
                <Text style={styles.pendingPillText}>{t('vehicleScreen.verificationStatus_submitted')}</Text>
              </View>
            ) : null}
          </View>

          {/* Subtitle line */}
          {subtitle ? (
            <Text style={styles.vehicleCardSub} numberOfLines={1}>{subtitle}</Text>
          ) : null}

          {/* Action row */}
          <View style={styles.vehicleCardActions}>
            <Pressable
              onPress={onToggleActive}
              disabled={saveBusy}
              style={({ pressed }) => [
                styles.cardBtn,
                vehicle.is_active ? styles.cardBtnMuted : styles.cardBtnGold,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={vehicle.is_active ? 'close-circle-outline' : 'checkmark-circle-outline'}
                size={13}
                color={vehicle.is_active ? COLORS.textSecondary : COLORS.gold}
              />
              <Text style={vehicle.is_active ? styles.cardBtnText : styles.cardBtnGoldText}>
                {vehicle.is_active ? t('vehicleScreen.deactivate') : t('vehicleScreen.setActive')}
              </Text>
            </Pressable>

            <Pressable
              onPress={onEdit}
              style={({ pressed }) => [
                styles.cardBtn,
                isEditTarget && styles.cardBtnEditing,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="create-outline"
                size={13}
                color={isEditTarget ? COLORS.gold : COLORS.textSecondary}
              />
              <Text style={[styles.cardBtnText, isEditTarget && { color: COLORS.gold }]}>
                {t('vehicleScreen.editDetails')}
              </Text>
            </Pressable>

            {!vehicle.is_active ? (
              <Pressable onPress={onDelete} style={styles.cardBtnDanger} hitSlop={8}>
                <Ionicons name="trash-outline" size={15} color={COLORS.error} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function DriverVehiclePhotosScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading, refreshVehicles } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id;

  // ── Vehicle list ──────────────────────────────────────────────────────────
  const [vehicles, setVehicles]     = useState<VehicleRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError]   = useState<string | null>(null);

  // ── Photo state ───────────────────────────────────────────────────────────
  const [localUrls, setLocalUrls]     = useState<Record<VehiclePhotoKey, string | null>>(rowToUrlsWithCacheBust(null));
  const [uploadingKey, setUploadingKey] = useState<VehiclePhotoKey | null>(null);
  const [expandedPhotoSlots, setExpandedPhotoSlots] = useState<Partial<Record<VehiclePhotoKey, boolean>>>({});

  // ── Form ──────────────────────────────────────────────────────────────────
  const [formMode, setFormMode]   = useState<FormMode>('view');
  const [editType, setEditType]   = useState<VehicleTypeCode>(VEHICLE_TYPES[0]);
  const [editClass, setEditClass] = useState<VehicleClassCode>(VEHICLE_CLASSES[0]);
  const [editColor, setEditColor] = useState('');
  const [editYearNum, setEditYearNum] = useState<number | null>(null);
  const [editPlate, setEditPlate] = useState('');
  const [editPassengerCapacity, setEditPassengerCapacity] = useState('');
  const [selectedMake, setSelectedMake] = useState<VehicleMakeRow | null>(null);
  const [selectedModel, setSelectedModel] = useState<VehicleModelRow | null>(null);
  const [subDriverRef, setSubDriverRef] = useState('');
  const [saveBusy, setSaveBusy]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const userIdRef   = useRef(userId);    userIdRef.current   = userId;
  const selectedIdRef = useRef(selectedId); selectedIdRef.current = selectedId;
  const localUrlsRef  = useRef(localUrls);  localUrlsRef.current  = localUrls;
  const addDraftIdRef = useRef<string | null>(null);
  const webFileInputRefs = useRef<Record<VehiclePhotoKey, HTMLInputElement | null>>(emptyWebFileRefs());

  const selectedVehicle = vehicles.find((v) => v.id === selectedId) ?? null;

  // ── Sync photo URLs when selection changes ────────────────────────────────
  useEffect(() => {
    setLocalUrls(rowToUrlsWithCacheBust(selectedVehicle));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, vehicles]);

  // ── Load vehicles ─────────────────────────────────────────────────────────
  const loadVehicles = useCallback(async () => {
    if (authLoading) return;
    if (!userId) { setListLoading(false); return; }
    setListError(null);
    setListLoading(true);
    const { data, error } = await fetchVehiclesByDriver(userId);
    setListLoading(false);
    if (error) { setListError(error.message); return; }
    setVehicles(data);
    void refreshVehicles();
    setSelectedId((prev) => {
      if (prev && data.some((v) => v.id === prev)) return prev;
      return data.find((v) => v.is_active)?.id ?? data[0]?.id ?? null;
    });
  }, [userId, authLoading, refreshVehicles]);

  useEffect(() => { void loadVehicles(); }, [loadVehicles]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  function populateFormFrom(v: VehicleRow) {
    setEditType(normalizeStoredVehicleType(v.type)   ?? VEHICLE_TYPES[0]);
    setEditClass(normalizeStoredVehicleClass(v.class) ?? VEHICLE_CLASSES[0]);
    setEditColor(v.color?.trim()  ?? '');
    setEditYearNum(v.year != null ? v.year : null);
    setEditPlate(v.plate?.trim()  ?? '');
    setEditPassengerCapacity(
      v.passenger_capacity != null && v.passenger_capacity > 0
        ? String(v.passenger_capacity)
        : '',
    );
    setSelectedMake(null);
    setSelectedModel(null);
    setSaveError(null);
    void (async () => {
      if (v.make_id) {
        const make = await fetchVehicleMakeById(v.make_id);
        if (make) setSelectedMake(make);
      }
      if (v.model_id) {
        const model = await fetchVehicleModelById(v.model_id);
        if (model) setSelectedModel(model);
      }
    })();
  }

  const makeCategory = TYPE_TO_MAKE_CATEGORY[editType];

  function catalogPayload() {
    const modelLabel =
      selectedMake && selectedModel
        ? `${selectedMake.name} ${selectedModel.name}`.trim()
        : null;
    return {
      make_id: selectedMake?.id ?? null,
      model_id: selectedModel?.id ?? null,
      model: modelLabel,
      year: editYearNum,
    };
  }

  function handleEdit(vehicle: VehicleRow) {
    setSelectedId(vehicle.id);
    populateFormFrom(vehicle);
    setExpandedPhotoSlots({});
    setFormMode('edit');
  }

  function cancelEdit() {
    setFormMode('view');
    setSaveError(null);
    setExpandedPhotoSlots({});
  }

  async function startAdd() {
    if (!userId) return;
    setEditType(VEHICLE_TYPES[0]);
    setEditClass(VEHICLE_CLASSES[0]);
    setEditColor('');
    setEditYearNum(null);
    setEditPlate('');
    setEditPassengerCapacity('');
    setSelectedMake(null);
    setSelectedModel(null);
    setSubDriverRef('');
    setSaveError(null);
    setSaveBusy(true);

    const { data: draft, error } = await insertVehicle(userId, {
      type: VEHICLE_TYPES[0],
      class: VEHICLE_CLASSES[0],
    });
    setSaveBusy(false);

    if (error || !draft) {
      setSaveError(getSupabaseErrorMessage(error ?? new Error('Failed to create vehicle')));
      return;
    }

    addDraftIdRef.current = draft.id;
    setVehicles((prev) => [...prev, draft]);
    setSelectedId(draft.id);
    setLocalUrls(rowToUrlsWithCacheBust(draft));
    setExpandedPhotoSlots({});
    setFormMode('add');
  }

  function cancelAdd() {
    const draftId = addDraftIdRef.current;
    addDraftIdRef.current = null;
    setFormMode('view');
    setSaveError(null);
    setSubDriverRef('');
    setExpandedPhotoSlots({});
    if (draftId && userId) {
      void deleteVehicle(draftId, userId).then(() => {
        setSelectedId((prev) => (prev === draftId ? null : prev));
        void loadVehicles();
      });
    }
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  function validateForm(): string | null {
    const typeErr = validateVehicleSave(editType, editClass);
    if (typeErr) return typeErr;
    return validatePassengerCapacity(editPassengerCapacity);
  }

  async function onSaveEdit() {
    if (!userId || !selectedId) return;
    const err = validateForm();
    if (err) { setSaveError(err); showValidationAlert(err); return; }
    const capacity = parsePassengerCapacity(editPassengerCapacity);
    if (capacity == null) {
      const capErr = validatePassengerCapacity(editPassengerCapacity) ?? t('validation.passengerCapacityRequired');
      setSaveError(capErr);
      showValidationAlert(capErr);
      return;
    }
    setSaveBusy(true); setSaveError(null);
    const { error } = await saveVehicleDetails(selectedId, userId, {
      type: editType,
      class: editClass,
      color: editColor.trim() || null,
      plate: editPlate.trim() || null,
      passenger_capacity: capacity,
      ...catalogPayload(),
    });
    setSaveBusy(false);
    if (error) { setSaveError(getSupabaseErrorMessage(error)); return; }
    setFormMode('view');
    void loadVehicles();
  }

  // ── Save add ──────────────────────────────────────────────────────────────
  async function onSaveAdd() {
    if (!userId || !selectedId) return;
    const err = validateForm();
    if (err) { setSaveError(err); showValidationAlert(err); return; }
    const capacity = parsePassengerCapacity(editPassengerCapacity);
    if (capacity == null) {
      const capErr = validatePassengerCapacity(editPassengerCapacity) ?? t('validation.passengerCapacityRequired');
      setSaveError(capErr);
      showValidationAlert(capErr);
      return;
    }
    setSaveBusy(true);
    setSaveError(null);
    const { error } = await saveVehicleDetails(selectedId, userId, {
      type: editType,
      class: editClass,
      color: editColor.trim() || null,
      plate: editPlate.trim() || null,
      passenger_capacity: capacity,
      ...catalogPayload(),
    });
    if (error) {
      setSaveBusy(false);
      setSaveError(getSupabaseErrorMessage(error));
      return;
    }

    const subRef = subDriverRef.trim();
    if (subRef) {
      const { userId: subId, error: resolveErr } = await resolveDriverUserId(subRef);
      if (resolveErr || !subId) {
        setSaveBusy(false);
        setSaveError(resolveErr?.message ?? t('fleet.driverNotFound'));
        return;
      }
      const { error: fleetErr } = await assignSubDriverToVehicle(userId, selectedId, subId);
      if (fleetErr) {
        setSaveBusy(false);
        setSaveError(fleetErr.message);
        return;
      }
    }

    setSaveBusy(false);
    addDraftIdRef.current = null;
    setSubDriverRef('');
    setFormMode('view');
    void loadVehicles();
  }

  // ── Toggle active ─────────────────────────────────────────────────────────
  async function handleToggleActive(vehicleId: string) {
    if (!userId) return;
    setSaveBusy(true);
    const { is_active, error } = await toggleVehicleActive(userId, vehicleId);
    setSaveBusy(false);
    if (error) {
      Alert.alert(t('system.errorTitle'), error.message);
      return;
    }
    if (!error) {
      setVehicles((prev) =>
        prev.map((v) => (v.id === vehicleId ? { ...v, is_active } : v)),
      );
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function handleDelete(vehicle: VehicleRow) {
    if (!userId) return;
    if (vehicle.is_active) {
      Alert.alert(t('system.noticeTitle'), t('vehicleScreen.cannotDeleteActive'));
      return;
    }
    const doDelete = () => {
      void deleteVehicle(vehicle.id, userId).then(() => {
        if (selectedId === vehicle.id) { setSelectedId(null); setFormMode('view'); }
        void loadVehicles();
      });
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

  // ── Photo upload ──────────────────────────────────────────────────────────
  const runUploadPipeline = useCallback(
    async (
      column: VehiclePhotoKey,
      angle: string,
      label: string,
      localUri: string,
      mime: string,
      opts?: { skipApplyLocalPreview?: boolean; revokeObjectUrl?: string; webUploadFile?: File },
    ) => {
      const uid = userIdRef.current;
      const vid = selectedIdRef.current;
      if (!uid || !vid) { if (opts?.revokeObjectUrl) URL.revokeObjectURL(opts.revokeObjectUrl); return; }
      const previous = localUrlsRef.current[column];
      if (!opts?.skipApplyLocalPreview) setLocalUrls((prev) => ({ ...prev, [column]: localUri }));
      setUploadingKey(column);
      try {
        const path = vehiclePhotoObjectPath(vid, angle);
        const publicUrl = await uploadMediaObject(path, opts?.webUploadFile ?? localUri, { contentType: mime });
        const { error } = await saveVehiclePhotoUrl(vid, column, publicUrl);
        if (error) throw error;
        const busted = withCacheBust(publicUrl) ?? publicUrl;
        setLocalUrls((prev) => ({ ...prev, [column]: busted }));
        const { data: fresh } = await fetchVehiclesByDriver(uid);
        if (fresh.length > 0) setVehicles(fresh);
        if (opts?.revokeObjectUrl) { const b = opts.revokeObjectUrl; setTimeout(() => URL.revokeObjectURL(b), 800); }
        Alert.alert(t('vehicleScreen.uploadSuccessTitle'), t('vehicleScreen.uploadSuccessBody', { label }));
      } catch (e: unknown) {
        setLocalUrls((prev) => ({ ...prev, [column]: previous ?? null }));
        if (opts?.revokeObjectUrl) URL.revokeObjectURL(opts.revokeObjectUrl);
        Alert.alert(t('system.errorTitle'), e instanceof Error ? e.message : t('vehicleScreen.uploadFailed'));
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

  async function pickNativeAndUpload(slot: PhotoSlotDef) {
    if (!userIdRef.current || !selectedIdRef.current) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(t('vehicleScreen.permissionTitle'), t('vehicleScreen.permissionBody')); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.88 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const label = t(`vehicleScreen.${slot.labelKey}`);
    await runUploadPipeline(slot.column, slot.angle, label, asset.uri, asset.mimeType ?? 'image/jpeg');
  }

  function togglePhotoSlot(column: VehiclePhotoKey) {
    setExpandedPhotoSlots((prev) => ({ ...prev, [column]: !prev[column] }));
  }

  function confirmDeletePhoto(column: VehiclePhotoKey) {
    const run = () => void handleDeletePhoto(column);
    if (Platform.OS === 'web') {
      if (window.confirm(t('vehicleScreen.deletePhotoConfirm'))) run();
      return;
    }
    Alert.alert(t('vehicleScreen.deletePhoto'), t('vehicleScreen.deletePhotoConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.yes'), style: 'destructive', onPress: run },
    ]);
  }

  async function handleDeletePhoto(column: VehiclePhotoKey) {
    const vid = selectedIdRef.current;
    if (!vid) return;
    setUploadingKey(column);
    const { error } = await clearVehiclePhotoUrl(vid, column);
    setUploadingKey(null);
    if (error) {
      Alert.alert(t('system.errorTitle'), error.message);
      return;
    }
    setLocalUrls((prev) => ({ ...prev, [column]: null }));
    setVehicles((prev) =>
      prev.map((v) => (v.id === vid ? { ...v, [column]: null } : v)),
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasAtLeastOnePhoto = useMemo(() => SLOTS.some((s) => hasPhotoUrl(localUrls[s.column])), [localUrls]);
  const missingPhotoLabels = useMemo(
    () => SLOTS.filter((s) => !hasPhotoUrl(localUrls[s.column])).map((s) => t(`vehicleScreen.${s.labelKey}`)),
    [localUrls, t],
  );

  function onSubmitPress() {
    if (!hasAtLeastOnePhoto) return;
    const extra = missingPhotoLabels.length > 0
      ? `\n\n${t('vehicleScreen.notUploadedYet', { labels: missingPhotoLabels.join(', ') })}`
      : '';
    const message = t('vehicleScreen.completeMessage', { extra });
    const goDashboard = () => router.replace('/(driver)/dashboard');
    if (Platform.OS === 'web') { window.alert(`${t('vehicleScreen.completeTitle')}\n\n${message}`); goDashboard(); return; }
    Alert.alert(t('vehicleScreen.completeTitle'), message, [{ text: t('common.confirm'), onPress: goDashboard }]);
  }

  const isFormOpen  = formMode === 'edit' || formMode === 'add';
  const bottomPad   = insets.bottom + SPACING.xl + 96;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACING.md, paddingBottom: bottomPad }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{t('vehicleScreen.title')}</Text>

      {/* ── Loading / Error ──────────────────────────────────────────────── */}
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
          {/* ── "My Vehicles" section ────────────────────────────────────── */}
          <Text style={styles.listSectionHeader}>{t('vehicleScreen.myVehicles')}</Text>

          {vehicles.length === 0 && !isFormOpen ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="car-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>{t('vehicleScreen.noVehicles')}</Text>
            </View>
          ) : (
            vehicles.map((v, i) => (
              <VehicleListCard
                key={v.id}
                vehicle={v}
                index={i}
                isSelected={v.id === selectedId && formMode !== 'add'}
                isEditTarget={v.id === selectedId && formMode === 'edit'}
                saveBusy={saveBusy}
                onSelect={() => {
                  setSelectedId(v.id);
                  if (formMode === 'edit' && selectedId !== v.id) setFormMode('view');
                  if (formMode === 'add') setFormMode('view');
                }}
                onEdit={() => handleEdit(v)}
                onToggleActive={() => void handleToggleActive(v.id)}
                onDelete={() => handleDelete(v)}
              />
            ))
          )}

          {/* ── Add vehicle button ────────────────────────────────────────── */}
          <Pressable
            onPress={() => void startAdd()}
            disabled={saveBusy}
            style={({ pressed }) => [
              styles.addVehicleBtn,
              formMode === 'add' && styles.addVehicleBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="add-circle-outline"
              size={18}
              color={formMode === 'add' ? '#0f0f0f' : COLORS.gold}
            />
            <Text style={[styles.addVehicleBtnText, formMode === 'add' && styles.addVehicleBtnTextActive]}>
              {t('vehicleScreen.addVehicle')}
            </Text>
          </Pressable>

          {selectedVehicle && formMode === 'view' ? (
            <Text style={styles.viewEditHint}>{t('vehicleScreen.editToUploadMedia')}</Text>
          ) : null}

          {/* ── Edit / Add form (photos, tech passport, metadata) ─────────── */}
          {isFormOpen ? (
            <View style={styles.formCard}>
              <Text style={styles.formCardTitle}>
                {formMode === 'add' ? t('vehicleScreen.addVehicle') : t('vehicleScreen.vehicleData')}
              </Text>

              <EditModeButtons
                isEditing
                onEdit={() => {}}
                onSave={() => void (formMode === 'edit' ? onSaveEdit() : onSaveAdd())}
                onCancel={formMode === 'edit' ? cancelEdit : cancelAdd}
                saveBusy={saveBusy}
              />

              <VehicleRegistrationMediaBlock
                vehicle={selectedVehicle}
                vehicleId={selectedId}
                localUrls={localUrls}
                uploadingKey={uploadingKey}
                expandedSlots={expandedPhotoSlots}
                onToggleSlot={togglePhotoSlot}
                onDeletePhoto={confirmDeletePhoto}
                onPickNative={pickNativeAndUpload}
                webFileInputRefs={webFileInputRefs}
                onWebFileChange={(slot) =>
                  handleWebFileInputChange(
                    slot.column,
                    slot.angle,
                    t(`vehicleScreen.${slot.labelKey}`),
                  )
                }
                driverId={userId ?? undefined}
                disabled={saveBusy}
                onUpdated={() => void loadVehicles()}
              />

              <Text style={styles.sectionLabel}>{t('vehicleScreen.type')}</Text>
              <View style={styles.chipRow}>
                {VEHICLE_TYPES.map((vt) => (
                  <Pressable
                    key={vt}
                    onPress={() => {
                      setEditType(vt);
                      setSelectedMake(null);
                      setSelectedModel(null);
                    }}
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

              <Text style={styles.sectionLabel}>{t('vehicleScreen.catalogSection')}</Text>
              <VehicleMakeSelect
                category={makeCategory}
                value={selectedMake}
                onChange={(make) => {
                  setSelectedMake(make);
                  setSelectedModel(null);
                }}
                disabled={saveBusy}
              />
              <VehicleModelSelect
                makeId={selectedMake?.id ?? null}
                value={selectedModel}
                onChange={setSelectedModel}
                disabled={saveBusy}
              />
              <VehicleYearSelect
                value={editYearNum}
                onChange={setEditYearNum}
                disabled={saveBusy}
              />
              <VehiclePassengerCapacityInput
                value={editPassengerCapacity}
                onChange={setEditPassengerCapacity}
                error={validatePassengerCapacity(editPassengerCapacity)}
                disabled={saveBusy}
              />
              <VehicleField label={t('vehicleScreen.color')} value={editColor} onChangeText={setEditColor} />
              <VehicleField label={t('vehicleScreen.plateLabel')} value={editPlate} onChangeText={setEditPlate} />

              {formMode === 'add' ? (
                <VehicleField
                  label={t('fleet.assignSubDriver')}
                  value={subDriverRef}
                  onChangeText={setSubDriverRef}
                  placeholder={t('fleet.assignSubDriverHint')}
                  autoCapitalize="none"
                />
              ) : null}

              {formMode === 'add' ? (
                <>
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

              {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────────
function VehicleField({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'number-pad';
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={COLORS.gray}
        style={styles.input}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg },
  title:  { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: SPACING.md },
  sub:    { color: COLORS.grayLight, fontSize: 14, lineHeight: 20, marginBottom: SPACING.md },
  center: { paddingVertical: SPACING.xl * 2, alignItems: 'center' },

  // ── "My Vehicles" section header ──────────────────────────────────────────
  listSectionHeader: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  viewEditHint: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },

  // ── Vehicle list card ─────────────────────────────────────────────────────
  vehicleCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  vehicleCardActive:   { borderColor: 'rgba(16,185,129,0.35)' },
  vehicleCardSelected: { borderColor: 'rgba(245,166,35,0.4)' },
  vehicleCardEditing:  { borderColor: COLORS.gold, borderWidth: 1.5 },
  vehicleCardInner:    { flexDirection: 'row' },

  cardStripe:         { width: 4 },
  cardStripeActive:   { backgroundColor: COLORS.success },
  cardStripeInactive: { backgroundColor: COLORS.border },

  vehicleCardContent: { flex: 1, padding: SPACING.md },

  vehicleCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  vehicleCardName: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700', marginRight: SPACING.sm },
  vehicleCardSub:  { color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.sm },

  vehicleCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },

  activePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
  },
  activePillText: { color: COLORS.success, fontSize: 11, fontWeight: '700' },
  verifiedPill: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderColor: 'rgba(76, 175, 80, 0.35)',
  },
  verifiedPillText: { color: COLORS.success, fontSize: 11, fontWeight: '700' },
  pendingPill: {
    backgroundColor: COLORS.goldTint,
    borderColor: COLORS.gold,
  },
  pendingPillText: { color: COLORS.goldDark, fontSize: 11, fontWeight: '700' },

  cardBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 9,
    borderRadius: 7, borderWidth: 1,
    backgroundColor: COLORS.surface, borderColor: COLORS.border,
  },
  cardBtnGold:    { borderColor: 'rgba(245,166,35,0.4)', backgroundColor: 'rgba(245,166,35,0.07)' },
  cardBtnMuted:   { borderColor: COLORS.border, backgroundColor: COLORS.surface },
  cardBtnEditing: { borderColor: COLORS.gold, backgroundColor: 'rgba(245,166,35,0.1)' },
  cardBtnText:    { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  cardBtnGoldText:{ color: COLORS.gold, fontSize: 12, fontWeight: '600' },

  cardBtnDanger: {
    width: 30, height: 30, borderRadius: 7, marginLeft: 'auto',
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyWrap: { alignItems: 'center', paddingVertical: SPACING.xl * 2, gap: SPACING.md },
  emptyText: {
    color: COLORS.textSecondary, fontSize: 15, textAlign: 'center',
    lineHeight: 22, paddingHorizontal: SPACING.lg,
  },

  // ── Add vehicle button ────────────────────────────────────────────────────
  addVehicleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: COLORS.gold, borderRadius: RADIUS.card,
    paddingVertical: 14, marginBottom: SPACING.md,
  },
  addVehicleBtnActive:    { backgroundColor: COLORS.gold, borderStyle: 'solid' },
  addVehicleBtnText:      { color: COLORS.gold, fontSize: 14, fontWeight: '700' },
  addVehicleBtnTextActive:{ color: '#0f0f0f' },

  // ── Edit / Add form card ──────────────────────────────────────────────────
  formCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.card,
  },
  formCardTitle: {
    color: COLORS.gold, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm,
  },

  // ── Form fields ───────────────────────────────────────────────────────────
  catalogDivider: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.goldDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
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

  registrationMediaInForm: {
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  registrationMediaTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  registrationMediaSubtitle: {
    color: COLORS.goldDark,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  registrationMediaHint: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },

  // ── Photos accordion ──────────────────────────────────────────────────────
  photosAccordion: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  photosAccordionTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  accordionItem: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  accordionItemLast: {},
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
  },
  accordionHeaderLabel: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  accordionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  accordionHeaderThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  accordionHeaderThumbEmpty: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionBody: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  accordionPreviewWrap: {
    width: 88,
    height: 88,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  accordionPreview: { width: '100%', height: '100%' },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  accordionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  accordionBtnOutlineText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '600',
  },
  accordionBtnUpload: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  accordionBtnUploadSolo: { flex: 0, alignSelf: 'flex-start' },
  accordionBtnUploadText: {
    color: COLORS.goldDark,
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: { opacity: 0.55 },

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

  pressed: { opacity: 0.85 },
});
