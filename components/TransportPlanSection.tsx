import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AuthInput } from './AuthInput';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { fetchMatchingDrivers, type MatchingDriver } from '../lib/drivers';
import {
  legPassengers,
  newTransportLeg,
  sumLegPassengers,
  type TransportLegDraft,
} from '../lib/transportPlan';
import {
  VEHICLE_CLASSES,
  VEHICLE_TYPES,
  vehicleClassLabel,
  vehicleTypeLabel,
  type VehicleClassCode,
  type VehicleTypeCode,
} from '../lib/vehicleCatalog';

type SingleProps = {
  passengers: string;
  onPassengersChange: (v: string) => void;
  selectedVehicleType: VehicleTypeCode;
  onVehicleTypeChange: (t: VehicleTypeCode) => void;
  vehicleClass: VehicleClassCode;
  onVehicleClassChange: (c: VehicleClassCode) => void;
};

type Props = SingleProps & {
  multiVehicle: boolean;
  legs: TransportLegDraft[];
  onLegsChange: (legs: TransportLegDraft[]) => void;
  onEnableMulti: () => void;
  cityHint?: string | null;
};

function InlineChipRow<T extends string>({
  options,
  value,
  onChange,
  labelFor,
  compact,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelFor: (v: T) => string;
  compact?: boolean;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[compact ? styles.chipSmall : styles.chip, active && styles.chipActive]}
          >
            <Text style={[compact ? styles.chipTextSmall : styles.chipText, active && styles.chipTextActive]}>
              {labelFor(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TransportPlanSection({
  multiVehicle,
  legs,
  onLegsChange,
  onEnableMulti,
  passengers,
  onPassengersChange,
  selectedVehicleType,
  onVehicleTypeChange,
  vehicleClass,
  onVehicleClassChange,
  cityHint,
}: Props) {
  const { t } = useTranslation();
  const [pickerLegId, setPickerLegId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<MatchingDriver[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);

  const updateLeg = (id: string, patch: Partial<TransportLegDraft>) => {
    onLegsChange(legs.map((leg) => (leg.id === id ? { ...leg, ...patch } : leg)));
  };

  const removeLeg = (id: string) => {
    if (legs.length <= 2) return;
    onLegsChange(legs.filter((leg) => leg.id !== id));
  };

  const addLeg = () => {
    onLegsChange([...legs, newTransportLeg({ passengers: '1' })]);
  };

  const openDriverPicker = async (leg: TransportLegDraft) => {
    setPickerLegId(leg.id);
    setDriversLoading(true);
    const { data } = await fetchMatchingDrivers(
      leg.vehicle_type,
      leg.vehicle_class,
      null,
      cityHint?.trim() || null,
      'all',
      legPassengers(leg),
    );
    setDrivers(data);
    setDriversLoading(false);
  };

  if (!multiVehicle) {
    const num = Math.max(1, parseInt(passengers, 10) || 1);
    return (
      <View style={styles.wrap}>
        <Text style={styles.sectionHeader}>{t('transportPlan.sectionTitle')}</Text>
        <View style={styles.stepperRow}>
          <Text style={styles.fieldLabel}>{t('newBooking.form.passengers')}</Text>
          <View style={styles.stepperControls}>
            <Pressable
              onPress={() => onPassengersChange(String(Math.max(1, num - 1)))}
              style={styles.stepperBtn}
            >
              <Ionicons name="remove" size={20} color={COLORS.gold} />
            </Pressable>
            <Text style={styles.stepperValue}>{num}</Text>
            <Pressable
              onPress={() => onPassengersChange(String(num + 1))}
              style={styles.stepperBtn}
            >
              <Ionicons name="add" size={20} color={COLORS.gold} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.fieldLabel}>{t('newBooking.form.vehicleType')}</Text>
        <InlineChipRow
          options={VEHICLE_TYPES}
          value={selectedVehicleType}
          onChange={onVehicleTypeChange}
          labelFor={vehicleTypeLabel}
        />
        <Text style={styles.fieldLabel}>{t('newBooking.form.vehicleClass')}</Text>
        <InlineChipRow
          options={VEHICLE_CLASSES}
          value={vehicleClass}
          onChange={onVehicleClassChange}
          labelFor={vehicleClassLabel}
        />
        <Pressable onPress={onEnableMulti} style={styles.addMultiBtn}>
          <Ionicons name="add-circle-outline" size={18} color={COLORS.goldDark} />
          <Text style={styles.addMultiText}>{t('transportPlan.addVehicle')}</Text>
        </Pressable>
      </View>
    );
  }

  const totalAssigned = sumLegPassengers(legs);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionHeader}>{t('transportPlan.multiTitle')}</Text>
      <Text style={styles.hint}>{t('transportPlan.multiHint')}</Text>
      <Text style={styles.totalLine}>
        {t('transportPlan.totalSeats', { total: totalAssigned })}
      </Text>

      {legs.map((leg, index) => (
        <View key={leg.id} style={styles.legCard}>
          <View style={styles.legTop}>
            <Text style={styles.legTitle}>{t('transportPlan.legN', { n: index + 1 })}</Text>
            {legs.length > 2 ? (
              <Pressable onPress={() => removeLeg(leg.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              </Pressable>
            ) : null}
          </View>
          <AuthInput
            label={t('transportPlan.legPassengers')}
            value={leg.passengers}
            onChangeText={(v) => updateLeg(leg.id, { passengers: v.replace(/[^\d]/g, '') })}
            keyboardType="number-pad"
          />
          <Text style={styles.fieldLabel}>{t('newBooking.form.vehicleType')}</Text>
          <InlineChipRow
            options={VEHICLE_TYPES}
            value={leg.vehicle_type}
            onChange={(vt) => updateLeg(leg.id, { vehicle_type: vt, driver_id: null, driver_name: null })}
            labelFor={vehicleTypeLabel}
            compact
          />
          <Text style={styles.fieldLabel}>{t('newBooking.form.vehicleClass')}</Text>
          <InlineChipRow
            options={VEHICLE_CLASSES}
            value={leg.vehicle_class}
            onChange={(vc) => updateLeg(leg.id, { vehicle_class: vc, driver_id: null, driver_name: null })}
            labelFor={vehicleClassLabel}
            compact
          />
          <Pressable onPress={() => void openDriverPicker(leg)} style={styles.driverPick}>
            <Ionicons name="person-outline" size={16} color={COLORS.goldDark} />
            <Text style={styles.driverPickText}>
              {leg.driver_name ?? t('transportPlan.driverOptional')}
            </Text>
          </Pressable>
        </View>
      ))}

      <Pressable onPress={addLeg} style={styles.addLegBtn}>
        <Ionicons name="add" size={18} color={COLORS.white} />
        <Text style={styles.addLegText}>{t('transportPlan.addAnother')}</Text>
      </Pressable>

      {pickerLegId ? (
        <View style={styles.driverModal}>
          <Text style={styles.driverModalTitle}>{t('transportPlan.pickDriver')}</Text>
          {driversLoading ? (
            <ActivityIndicator color={COLORS.gold} />
          ) : drivers.length === 0 ? (
            <Text style={styles.empty}>{t('transportPlan.noDrivers')}</Text>
          ) : (
            drivers.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => {
                  updateLeg(pickerLegId, {
                    driver_id: d.id,
                    driver_name: d.full_name ?? d.id.slice(0, 8),
                  });
                  setPickerLegId(null);
                }}
                style={styles.driverRow}
              >
                <Text style={styles.driverName}>{d.full_name ?? '—'}</Text>
                <Text style={styles.driverMeta}>
                  {[d.vehicle?.type ? vehicleTypeLabel(d.vehicle.type) : null, d.vehicle?.plate]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Pressable>
            ))
          )}
          <Pressable onPress={() => setPickerLegId(null)} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.md },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  hint: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  totalLine: { fontSize: 14, fontWeight: '700', color: COLORS.goldDark, marginBottom: SPACING.md },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 6 },
  stepperRow: { marginBottom: SPACING.md },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { fontSize: 20, fontWeight: '700', minWidth: 40, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.md },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextSmall: { fontSize: 12, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.goldDark, fontWeight: '700' },
  addMultiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: SPACING.sm,
  },
  addMultiText: { color: COLORS.goldDark, fontWeight: '700', fontSize: 14 },
  legCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.white,
  },
  legTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legTitle: { fontSize: 15, fontWeight: '700', marginBottom: SPACING.sm },
  driverPick: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  driverPickText: { fontSize: 14, color: COLORS.goldDark, fontWeight: '600' },
  addLegBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    marginBottom: SPACING.sm,
  },
  addLegText: { color: COLORS.white, fontWeight: '700' },
  driverModal: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  driverModalTitle: { fontSize: 15, fontWeight: '700', marginBottom: SPACING.sm },
  empty: { color: COLORS.textSecondary, marginBottom: SPACING.sm },
  driverRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  driverName: { fontSize: 15, fontWeight: '600' },
  driverMeta: { fontSize: 12, color: COLORS.textSecondary },
  modalClose: { marginTop: SPACING.sm, alignItems: 'center' },
  modalCloseText: { color: COLORS.textSecondary, fontWeight: '600' },
});
