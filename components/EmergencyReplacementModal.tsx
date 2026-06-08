import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
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
import { routeSummary } from '../lib/bookings';
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

  const reset = useCallback(() => {
    setCity(null);
    setDrivers([]);
    setLoading(false);
    setAssigningId(null);
    setError(null);
    setSearched(false);
  }, []);

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
    const res = await findAvailableDriversInCity(trimmed, sharedVehicleFilter ?? undefined);
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

  function pickBookingForDriver(driver: AvailableDriverRow) {
    if (!companyUserId) return;
    if (assignableBookings.length === 0) {
      const msg = t('emergencyReplacement.noPendingBookings');
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert(t('emergencyReplacement.assignTitle'), msg);
      return;
    }

    const runAssign = async (bookingId: string) => {
      setAssigningId(driver.id);
      const res = await assignEmergencyDriverToBooking(bookingId, companyUserId, driver);
      setAssigningId(null);
      if (!res.ok) {
        const msg = getSupabaseErrorMessage(res.error) || t('emergencyReplacement.assignFailed');
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert(t('common.error'), msg);
        return;
      }
      await onAssigned();
      handleClose();
      const ok = t('emergencyReplacement.assignSuccess');
      if (Platform.OS === 'web') window.alert(ok);
      else Alert.alert(t('common.success'), ok);
    };

    if (assignableBookings.length === 1) {
      void runAssign(assignableBookings[0]!.id);
      return;
    }

    if (Platform.OS === 'web') {
      const labels = assignableBookings.map((b, i) => `${i + 1}. ${routeSummary(b)}`);
      const pick = window.prompt(
        `${t('emergencyReplacement.pickBooking')}\n${labels.join('\n')}\n\n${t('emergencyReplacement.pickBookingHint')}`,
        '1',
      );
      const idx = Number(pick) - 1;
      if (Number.isInteger(idx) && assignableBookings[idx]) {
        void runAssign(assignableBookings[idx]!.id);
      }
      return;
    }

    Alert.alert(
      t('emergencyReplacement.assignTitle'),
      t('emergencyReplacement.pickBooking'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        ...assignableBookings.slice(0, 5).map((b) => ({
          text: routeSummary(b).slice(0, 48),
          onPress: () => void runAssign(b.id),
        })),
      ],
    );
  }

  const emptyMessage = useMemo(() => {
    if (!searched) return t('emergencyReplacement.searchHint');
    return t('emergencyReplacement.noDrivers');
  }, [searched, t]);

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

          <SearchableCitySelect
            label={t('emergencyReplacement.cityLabel')}
            value={city}
            onChange={setCity}
            disabled={loading || !!assigningId}
            error={error && !searched ? error : null}
          />

          <Pressable
            onPress={() => void handleSearch()}
            disabled={loading || !!assigningId}
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

          <FlatList
            data={drivers}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
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
    maxHeight: '88%',
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
    maxHeight: 360,
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
});
