import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import {
  fetchVehicleMakes,
  fetchVehicleModels,
  vehicleYearsDescending,
  type VehicleMakeRow,
  type VehicleModelRow,
} from '../../lib/vehicleData';

type CatalogSelectProps<T extends { id: number; name: string }> = {
  label: string;
  placeholder: string;
  value: T | null;
  options: T[];
  onChange: (item: T | null) => void;
  disabled?: boolean;
  loading?: boolean;
};

function CatalogSelect<T extends { id: number; name: string }>({
  label,
  placeholder,
  value,
  options,
  onChange,
  disabled,
  loading,
}: CatalogSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const display = value?.name ?? placeholder;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={open ? query : value?.name ?? ''}
          onChangeText={(text) => {
            setQuery(text);
            setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          editable={!disabled && !loading}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          style={[styles.input, disabled && styles.inputDisabled]}
        />
        {open && filtered.length > 0 ? (
          <View style={styles.webList}>
            {filtered.slice(0, 40).map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery('');
                }}
                style={styles.option}
              >
                <Text style={styles.optionText}>{item.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => !disabled && !loading && setOpen(true)}
        style={[styles.trigger, disabled && styles.inputDisabled]}
      >
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {loading ? '…' : display}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
        <View style={styles.modalSheet}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            style={styles.search}
            autoFocus
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery('');
                }}
                style={styles.option}
              >
                <Text style={styles.optionText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

type MakeProps = {
  category: string | null;
  value: VehicleMakeRow | null;
  onChange: (make: VehicleMakeRow | null) => void;
  disabled?: boolean;
};

export function VehicleMakeSelect({ category, value, onChange, disabled }: MakeProps) {
  const { t } = useTranslation();
  const [makes, setMakes] = useState<VehicleMakeRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!category) {
      setMakes([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data } = await fetchVehicleMakes(category);
      if (!cancelled) {
        setMakes(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  return (
    <CatalogSelect
      label={t('vehicleScreen.make')}
      placeholder={t('vehicleScreen.pickMake')}
      value={value}
      options={makes}
      onChange={onChange}
      disabled={disabled || !category}
      loading={loading}
    />
  );
}

type ModelProps = {
  makeId: number | null;
  value: VehicleModelRow | null;
  onChange: (model: VehicleModelRow | null) => void;
  disabled?: boolean;
};

export function VehicleModelSelect({ makeId, value, onChange, disabled }: ModelProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<VehicleModelRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!makeId) {
      setModels([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data } = await fetchVehicleModels(makeId);
      if (!cancelled) {
        setModels(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [makeId]);

  return (
    <CatalogSelect
      label={t('vehicleScreen.modelCatalog')}
      placeholder={t('vehicleScreen.pickModel')}
      value={value}
      options={models}
      onChange={onChange}
      disabled={disabled || !makeId}
      loading={loading}
    />
  );
}

type YearProps = {
  value: number | null;
  onChange: (year: number | null) => void;
  disabled?: boolean;
};

type PassengerCapacityProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
};

/** Required seat count (1–100) for driver vehicle registration. */
export function VehiclePassengerCapacityInput({
  value,
  onChange,
  error,
  disabled,
}: PassengerCapacityProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('vehicleScreen.passengerCapacity')}</Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^\d]/g, ''))}
        keyboardType="number-pad"
        maxLength={3}
        editable={!disabled}
        placeholder={t('vehicleScreen.passengerCapacityPlaceholder')}
        placeholderTextColor={COLORS.textMuted}
        style={[
          styles.input,
          styles.capacityInput,
          error ? styles.inputError : null,
          disabled && styles.inputDisabled,
        ]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function VehicleYearSelect({ value, onChange, disabled }: YearProps) {
  const { t } = useTranslation();
  const years = useMemo(() => vehicleYearsDescending(), []);
  const yearItems = useMemo(
    () => years.map((y) => ({ id: y, name: String(y) })),
    [years],
  );
  const selected = value != null ? { id: value, name: String(value) } : null;

  return (
    <CatalogSelect
      label={t('vehicleScreen.year')}
      placeholder={t('vehicleScreen.pickYear')}
      value={selected}
      options={yearItems}
      onChange={(item) => onChange(item ? item.id : null)}
      disabled={disabled}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.sm },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  inputDisabled: { opacity: 0.55 },
  inputError: {
    borderColor: COLORS.error,
  },
  capacityInput: {
    borderColor: '#EF9F27',
  },
  fieldError: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 4,
  },
  trigger: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
  },
  triggerText: { fontSize: 15, color: COLORS.text },
  placeholder: { color: COLORS.textMuted },
  webList: {
    marginTop: 4,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  optionText: { fontSize: 15, color: COLORS.text },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    marginTop: '30%',
    marginHorizontal: SPACING.md,
    maxHeight: '55%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
  },
  search: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    fontSize: 15,
  },
});
