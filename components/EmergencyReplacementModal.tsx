import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BookingRow } from '../lib/bookings';
import { emergencyAssignmentBookingLabel } from '../lib/bookings';
import {
  assignEmergencyDriverToBooking,
  findAvailableDriversInCity,
  type AvailableDriverRow,
} from '../lib/driverAvailability';
import { getSupabaseErrorMessage } from '../lib/errorHandler';
import { vehicleClassLabel, vehicleTypeLabel } from '../lib/vehicleCatalog';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { NameWithVerifiedBadge } from './NameWithVerifiedBadge';
import { SearchableCitySelect } from './SearchableCitySelect';
import { UserAvatar } from './UserAvatar';

type Props = {
  visible: boolean;
  onClose: () => void;
  companyUserId: string | undefined;
  assignableBookings: BookingRow[];
  onAssigned: () => void | Promise<void>;
};

export function EmergencyReplacementModal({
  visible,
  onClose,
  companyUserId,
  assignableBookings,
  onAssigned,
}: Props) {
  const { t } = useTranslation();
  const [city, setCity] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<AvailableDriverRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [bookingPickDriver, setBookingPickDriver] = useState<AvailableDriverRow | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setCity(null);
    setDrivers([]);
    setLoading(false);
    setAssigningId(null);
    setError(null);
    setSearched(false);
    setBookingPickDriver(null);
    setSelectedBookingId(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const first = assignableBookings[0]?.id ?? null;
    setSelectedBookingId(first);
  }, [visible, assignableBookings]);

  const selectedBooking = useMemo(
    () => assignableBookings.find((b) => b.id === selectedBookingId) ?? assignableBookings[0] ?? null,
    [assignableBookings, selectedBookingId],
  );

  function handleClose() {
    reset();
    onClose();
  }

  const sharedVehicleFilter = useMemo(() => {
    if (assignableBookings.length === 0) return null;
    const firstType = assignableBookings[0]?.vehicle_type?.trim() ?? '';
    const firstClass = assignableBookings[0]?.vehicle_class?.trim() ?? '';
    const sameForAll = assignableBookings.every(
      (b) =>
        (b.vehicle_type?.trim() ?? '') === firstType &&
        (b.vehicle_class?.trim() ?? '') === firstClass,
    );
    if (!sameForAll || !firstType) return null;
    return { vehicleType: firstType, vehicleClass: firstClass || undefined };
  }, [assignableBookings]);

  async function handleSearch() {
    const trimmed = city?.trim();
    if (!trimmed) {
      setError(t('driverAvailability.cityRequired'));
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    const searchFilter =
      sharedVehicleFilter?.vehicleType != null
        ? { vehicleType: sharedVehicleFilter.vehicleType }
        : undefined;
    const res = await findAvailableDriversInCity(trimmed, searchFilter);
    setLoading(false);
    if (res.error) {
      setDrivers([]);
      setError(getSupabaseErrorMessage(res.error));
      return;
    }
    setDrivers(res.data);
  }

  function callDriver(phone: string | null) {
    const trimmed = phone?.trim();
    if (!trimmed) {
      const msg = t('emergencyReplacement.noPhone');
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert(t('common.error'), msg);
      return;
    }
    void Linking.openURL(`tel:${trimmed}`);
  }

  function showAssignSuccess(driver: AvailableDriverRow) {
    const name = driver.full_name?.trim() || t('company.driverDefault');
    const phone = driver.phone?.trim();
    const ok = phone
      ? t('emergencyReplacement.assignSuccessPhone', { name, phone })
      : t('emergencyReplacement.assignSuccess', { name });
    if (Platform.OS === 'web') window.alert(ok);
    else Alert.alert(t('common.success'), ok);
  }

  async function runAssign(driver: AvailableDriverRow, bookingId: string) {
    if (!companyUserId) return;
    setAssigningId(driver.id);
    const res = await assignEmergencyDriverToBooking(bookingId, companyUserId, driver);
    setAssigningId(null);
    setBookingPickDriver(null);
    if (!res.ok) {
      const msg = getSupabaseErrorMessage(res.error) || t('emergencyReplacement.assignFailed');
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert(t('common.error'), msg);
      return;
    }
    await onAssigned();
    handleClose();
    showAssignSuccess(driver);
  }

  function pickBookingForDriver(driver: AvailableDriverRow) {
    if (!companyUserId) return;
    if (assignableBookings.length === 0) {
      const msg = t('emergencyReplacement.noPendingBookings');
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert(t('emergencyReplacement.assignTitle'), msg);
      return;
    }

    const bookingId = selectedBooking?.id;
    if (!bookingId) return;

    if (assignableBookings.length === 1) {
      void runAssign(driver, bookingId);
      return;
    }

    setBookingPickDriver(driver);
  }

  const emptyMessage = useMemo(() => {
    if (!searched) return t('emergencyReplacement.searchHint');
    return t('emergencyReplacement.noDrivers');
  }, [searched, t]);

  const listHeader = (
    <>
      {assignableBookings.length === 0 ? (
        <Text style={styles.warnText}>{t('emergencyReplacement.noPendingBookings')}</Text>
      ) : (
        <>
          <Text style={styles.hintText}>{t('emergencyReplacement.bookingHint')}</Text>
          {assignableBookings.length > 1 ? (
            <View style={styles.bookingSelectBlock}>
              <Text style={styles.sectionLabel}>{t('emergencyReplacement.pickBooking')}</Text>
              {assignableBookings.map((b) => {
                const active = (selectedBookingId ?? b.id) === b.id;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => setSelectedBookingId(b.id)}
                    style={({ pressed }) => [
                      styles.bookingSelectRow,
                      active && styles.bookingSelectRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.bookingPickRowText}>{emergencyAssignmentBookingLabel(b)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : selectedBooking ? (
            <View style={styles.singleBookingBlock}>
              <Text style={styles.sectionLabel}>{t('emergencyReplacement.targetBooking')}</Text>
              <Text style={styles.singleBookingText}>{emergencyAssignmentBookingLabel(selectedBooking)}</Text>
            </View>
          ) : null}
        </>
      )}

      <SearchableCitySelect
        label={t('emergencyReplacement.cityLabel')}
        value={city}
        onChange={setCity}
        disabled={loading || !!assigningId || assignableBookings.length === 0}
        error={error && !searched ? error : null}
      />

      <Pressable
        onPress={() => void handleSearch()}
        disabled={loading || !!assigningId || assignableBookings.length === 0}
        style={({ pressed }) => [styles.searchBtn, pressed && styles.pressed]}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <Text style={styles.searchBtnText}>{t('emergencyReplacement.search')}</Text>
        )}
      </Pressable>

      {searched && !loading ? (
        <Text style={styles.resultCount}>
          {t('emergencyReplacement.foundCount', { count: drivers.length })}
        </Text>
      ) : null}

      {bookingPickDriver ? (
        <View style={styles.bookingPickBlock}>
          <Text style={styles.bookingPickTitle}>{t('emergencyReplacement.pickBooking')}</Text>
          <Text style={styles.bookingPickHint}>
            {bookingPickDriver.full_name ?? t('company.driverDefault')}
          </Text>
          {assignableBookings.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => void runAssign(bookingPickDriver, b.id)}
              disabled={!!assigningId}
              style={({ pressed }) => [styles.bookingPickRow, pressed && styles.pressed]}
            >
              <Text style={styles.bookingPickRowText}>{emergencyAssignmentBookingLabel(b)}</Text>
              <Text style={styles.bookingPickRowMeta}>
                {[
                  b.vehicle_type ? vehicleTypeLabel(b.vehicle_type) : null,
                  b.vehicle_class ? vehicleClassLabel(b.vehicle_class) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setBookingPickDriver(null)}
            style={({ pressed }) => [styles.bookingPickCancel, pressed && styles.pressed]}
          >
            <Text style={styles.bookingPickCancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('emergencyReplacement.title')}</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <FlatList
            data={drivers}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              searched && !loading ? (
                <Text style={styles.emptyText}>{emptyMessage}</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.driverCard}>
                <View style={styles.driverHead}>
                  <UserAvatar
                    name={item.full_name ?? t('company.driverDefault')}
                    uri={item.avatar_url}
                    size={44}
                  />
                  <View style={styles.driverInfo}>
                    <NameWithVerifiedBadge
                      name={item.full_name ?? t('company.driverDefault')}
                      verified
                      isGuide={item.is_guide_driver}
                      textStyle={styles.driverName}
                    />
                    <Text style={styles.driverMeta}>
                      {[
                        item.vehicle_type ? vehicleTypeLabel(item.vehicle_type) : null,
                        item.vehicle_class ? vehicleClassLabel(item.vehicle_class) : null,
                        item.vehicle_plate,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {item.phone ? (
                      <Text style={styles.driverPhone}>{item.phone}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => callDriver(item.phone)}
                    style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
                  >
                    <Ionicons name="call-outline" size={16} color={COLORS.white} />
                    <Text style={styles.callBtnText}>{t('emergencyReplacement.call')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => pickBookingForDriver(item)}
                    disabled={assigningId === item.id}
                    style={({ pressed }) => [styles.assignBtn, pressed && styles.pressed]}
                  >
                    {assigningId === item.id ? (
                      <ActivityIndicator color={COLORS.white} size="small" />
                    ) : (
                      <Text style={styles.assignBtnText}>{t('emergencyReplacement.assign')}</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  hintText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  singleBookingBlock: {
    marginBottom: SPACING.sm,
  },
  singleBookingText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  bookingSelectBlock: {
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  bookingSelectRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    padding: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  bookingSelectRowActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245, 166, 35, 0.1)',
  },
  warnText: {
    color: '#B91C1C',
    fontSize: 13,
    marginBottom: SPACING.sm,
  },
  searchBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  searchBtnText: {
    fontWeight: '800',
    color: '#000',
  },
  resultCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  list: {
    maxHeight: 420,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    paddingVertical: SPACING.lg,
  },
  driverCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  driverHead: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  driverInfo: {
    flex: 1,
    gap: 2,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
  },
  driverMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  driverPhone: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    borderRadius: RADIUS.button,
    paddingVertical: 10,
  },
  callBtnText: {
    color: COLORS.white,
    fontWeight: '700',
  },
  assignBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: RADIUS.button,
    paddingVertical: 10,
  },
  assignBtnText: {
    color: COLORS.white,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.88,
  },
  bookingPickBlock: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: 'rgba(245, 166, 35, 0.08)',
    gap: SPACING.xs,
  },
  bookingPickTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  bookingPickHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  bookingPickRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    padding: SPACING.sm,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.xs,
  },
  bookingPickRowText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  bookingPickRowMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  bookingPickCancel: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  bookingPickCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
