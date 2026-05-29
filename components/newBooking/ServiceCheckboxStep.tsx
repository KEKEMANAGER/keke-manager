import { Ionicons } from '@expo/vector-icons';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ServiceFlags } from '../../lib/bookingCompose';
import { newBookingStyles as styles } from './styles';

type Props = {
  flags: ServiceFlags;
  onChange: (flags: ServiceFlags) => void;
  step1Error?: string | null;
};

function toggleFlag(
  flags: ServiceFlags,
  key: keyof ServiceFlags,
  onChange: (next: ServiceFlags) => void,
) {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  onChange({ ...flags, [key]: !flags[key] });
}

function ServiceRow({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.serviceCheckboxRow, checked && styles.serviceCheckboxRowActive]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.serviceCheckboxBox, checked && styles.serviceCheckboxBoxActive]}>
        {checked ? <Ionicons name="checkmark" size={16} color="#000" /> : null}
      </View>
      <Text style={[styles.serviceCheckboxLabel, checked && styles.serviceCheckboxLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ServiceCheckboxStep({ flags, onChange, step1Error }: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <Text style={styles.step1Hint}>{t('newBooking.smartForm.step1Hint')}</Text>
      <ServiceRow
        label={t('newBooking.smartForm.arrivalTransfer')}
        checked={flags.wantArrivalTransfer}
        onPress={() => toggleFlag(flags, 'wantArrivalTransfer', onChange)}
      />
      <ServiceRow
        label={t('newBooking.smartForm.tour')}
        checked={flags.wantTour}
        onPress={() => toggleFlag(flags, 'wantTour', onChange)}
      />
      <ServiceRow
        label={t('newBooking.smartForm.departureTransfer')}
        checked={flags.wantDepartureTransfer}
        onPress={() => toggleFlag(flags, 'wantDepartureTransfer', onChange)}
      />
      {step1Error ? <Text style={styles.step1Error}>{step1Error}</Text> : null}
    </View>
  );
}
