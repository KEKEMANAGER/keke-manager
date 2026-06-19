import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AuthInput } from './AuthInput';
import { DriverCategorySelect } from './DriverCategorySelect';
import { TransportLegDriverSection } from './TransportLegDriverSection';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import type { RequestedDriverCategory } from '../lib/driverCategory';
import {
  newTransportLeg,
  parseLegPrice,
  sumLegPassengers,
  sumLegPrices,
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
  onAddVehicle: () => void;
  onCollapseToSingle: (leg: TransportLegDraft) => void;
  cityHint?: string | null;
  requiredLanguages: string[];
  driverCategory: RequestedDriverCategory;
  onDriverCategoryChange: (c: RequestedDriverCategory) => void;
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

function PassengerStepper({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const num = Math.max(1, parseInt(value, 10) || 1);
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.fieldLabel}>{t('newBooking.form.passengers')}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onChange(String(Math.max(1, num - 1)))}
          style={styles.stepperBtn}
        >
          <Ionicons name="remove" size={20} color={COLORS.gold} />
        </Pressable>
        <Text style={styles.stepperValue}>{num}</Text>
        <Pressable onPress={() => onChange(String(num + 1))} style={styles.stepperBtn}>
          <Ionicons name="add" size={20} color={COLORS.gold} />
        </Pressable>
      </View>
    </View>
  );
}

function AddVehicleLink({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={styles.addVehicleLink}>
      <Ionicons name="add" size={18} color={COLORS.gold} />
      <Text style={styles.addVehicleLinkText}>{label}</Text>
    </Pressable>
  );
}

export function TransportPlanSection({
  multiVehicle,
  legs,
  onLegsChange,
  onAddVehicle,
  onCollapseToSingle,
  passengers,
  onPassengersChange,
  selectedVehicleType,
  onVehicleTypeChange,
  vehicleClass,
  onVehicleClassChange,
  cityHint,
  requiredLanguages,
  driverCategory,
  onDriverCategoryChange,
}: Props) {
  const { t } = useTranslation();

  const updateLeg = (id: string, patch: Partial<TransportLegDraft>) => {
    onLegsChange(legs.map((leg) => (leg.id === id ? { ...leg, ...patch } : leg)));
  };

  const removeLeg = (id: string) => {
    if (legs.length <= 1) return;
    const next = legs.filter((leg) => leg.id !== id);
    if (next.length === 1) {
      onCollapseToSingle(next[0]);
    } else {
      onLegsChange(next);
    }
  };

  const addLeg = () => {
    onLegsChange([...legs, newTransportLeg({ passengers: '1' })]);
  };

  const clearLegDriver = {
    driver_id: null as string | null,
    driver_name: null as string | null,
    driver_vehicle_id: null as string | null,
  };

  if (!multiVehicle) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.sectionHeader}>{t('transportPlan.sectionTitle')}</Text>
        <PassengerStepper value={passengers} onChange={onPassengersChange} />
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
        <AddVehicleLink onPress={onAddVehicle} label={t('transportPlan.addVehicle')} />
      </View>
    );
  }

  const totalAssigned = sumLegPassengers(legs);
  const totalPrice = sumLegPrices(legs);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionHeader}>{t('transportPlan.sectionTitle')}</Text>
      {totalAssigned > 0 ? (
        <Text style={styles.totalLine}>
          {t('transportPlan.totalSeats', { total: totalAssigned })}
          {totalPrice > 0 ? ` · ${t('transportPlan.totalPrice', { amount: totalPrice.toFixed(0) })}` : ''}
        </Text>
      ) : null}

      <DriverCategorySelect value={driverCategory} onChange={onDriverCategoryChange} />

      {legs.map((leg, index) => (
        <View key={leg.id} style={styles.legCard}>
          <View style={styles.legTop}>
            <Text style={styles.legTitle}>{t('transportPlan.legN', { n: index + 1 })}</Text>
            {legs.length >= 2 ? (
              <Pressable onPress={() => removeLeg(leg.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              </Pressable>
            ) : null}
          </View>
          <PassengerStepper
            value={leg.passengers}
            onChange={(v) => updateLeg(leg.id, { passengers: v })}
          />
          <Text style={styles.fieldLabel}>{t('newBooking.form.vehicleType')}</Text>
          <InlineChipRow
            options={VEHICLE_TYPES}
            value={leg.vehicle_type}
            onChange={(vt) => updateLeg(leg.id, { vehicle_type: vt, ...clearLegDriver })}
            labelFor={vehicleTypeLabel}
            compact
          />
          <Text style={styles.fieldLabel}>{t('newBooking.form.vehicleClass')}</Text>
          <InlineChipRow
            options={VEHICLE_CLASSES}
            value={leg.vehicle_class}
            onChange={(vc) => updateLeg(leg.id, { vehicle_class: vc, ...clearLegDriver })}
            labelFor={vehicleClassLabel}
            compact
          />
          <AuthInput
            label={t('transportPlan.legPrice')}
            value={leg.price_str}
            onChangeText={(v) => updateLeg(leg.id, { price_str: v })}
            keyboardType="decimal-pad"
            placeholder={t('newBooking.form.placeholders.zero')}
          />
          {parseLegPrice(leg.price_str) <= 0 ? (
            <Text style={styles.priceWarn}>{t('transportPlan.legPriceRequired')}</Text>
          ) : null}
          <TransportLegDriverSection
            leg={leg}
            onChange={(patch) => updateLeg(leg.id, patch)}
            cityHint={cityHint}
            requiredLanguages={requiredLanguages}
            driverCategory={driverCategory}
          />
        </View>
      ))}

      <AddVehicleLink onPress={addLeg} label={t('transportPlan.addAnother')} />
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextSmall: { fontSize: 12, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.goldDark, fontWeight: '700' },
  addVehicleLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    paddingVertical: 8,
  },
  addVehicleLinkText: { fontSize: 14, fontWeight: '700', color: COLORS.gold },
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
  priceWarn: { fontSize: 12, color: COLORS.error, marginTop: -4, marginBottom: SPACING.sm },
});
