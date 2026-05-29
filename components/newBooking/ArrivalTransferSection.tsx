import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AuthInput } from '../AuthInput';
import { DateTimeField } from '../DateTimeField';
import { LocationPicker } from '../LocationPicker';
import type { LocationValue } from '../../lib/bookingLocations';

type Props = {
  transferInDateTime: Date | null;
  onTransferInDateTimeChange: (d: Date | null) => void;
  transferInAirportLoc: LocationValue;
  onTransferInAirportLocChange: (v: LocationValue) => void;
  transferInHotelLoc: LocationValue;
  onTransferInHotelLocChange: (v: LocationValue) => void;
  arrivalFlightNo: string;
  onArrivalFlightNoChange: (v: string) => void;
  styles: Record<string, object>;
};

export function ArrivalTransferSection({
  transferInDateTime,
  onTransferInDateTimeChange,
  transferInAirportLoc,
  onTransferInAirportLocChange,
  transferInHotelLoc,
  onTransferInHotelLocChange,
  arrivalFlightNo,
  onArrivalFlightNoChange,
  styles,
}: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <Text style={[styles.sectionHeader as object, styles.sectionHeaderFirst as object]}>
        {t('newBooking.form.transferArrivalSection')}
      </Text>
      <DateTimeField
        label={t('newBooking.form.dateTime')}
        value={transferInDateTime}
        onChange={onTransferInDateTimeChange}
        placeholder={t('newBooking.form.placeholders.dateTime')}
        minimumDate={new Date()}
      />
      <LocationPicker
        label={t('newBooking.form.transferInFrom')}
        value={transferInAirportLoc}
        onChange={onTransferInAirportLocChange}
      />
      <AuthInput
        label={t('newBooking.flightNumber')}
        value={arrivalFlightNo}
        onChangeText={onArrivalFlightNoChange}
        autoCapitalize="characters"
        placeholder={t('newBooking.flightNumberPlaceholder')}
      />
      <LocationPicker
        label={t('newBooking.form.transferInTo')}
        value={transferInHotelLoc}
        onChange={onTransferInHotelLocChange}
      />
    </View>
  );
}
