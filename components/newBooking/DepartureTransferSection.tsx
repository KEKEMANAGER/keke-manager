import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AuthInput } from '../AuthInput';
import { DateTimeField } from '../DateTimeField';
import { LocationPicker } from '../LocationPicker';
import type { LocationValue } from '../../lib/bookingLocations';

type Props = {
  transferOutDateTime: Date | null;
  onTransferOutDateTimeChange: (d: Date | null) => void;
  transferOutHotelLoc: LocationValue;
  onTransferOutHotelLocChange: (v: LocationValue) => void;
  transferOutAirportLoc: LocationValue;
  onTransferOutAirportLocChange: (v: LocationValue) => void;
  departureFlightNo: string;
  onDepartureFlightNoChange: (v: string) => void;
  styles: Record<string, object>;
};

export function DepartureTransferSection({
  transferOutDateTime,
  onTransferOutDateTimeChange,
  transferOutHotelLoc,
  onTransferOutHotelLocChange,
  transferOutAirportLoc,
  onTransferOutAirportLocChange,
  departureFlightNo,
  onDepartureFlightNoChange,
  styles,
}: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <Text style={styles.sectionHeader as object}>{t('newBooking.form.transferDepartureSection')}</Text>
      <DateTimeField
        label={t('newBooking.form.departureDateTime')}
        value={transferOutDateTime}
        onChange={onTransferOutDateTimeChange}
        placeholder={t('newBooking.form.placeholders.dateTime')}
        minimumDate={new Date()}
      />
      <LocationPicker
        label={t('newBooking.form.transferOutFrom')}
        value={transferOutHotelLoc}
        onChange={onTransferOutHotelLocChange}
      />
      <LocationPicker
        label={t('newBooking.form.transferOutTo')}
        value={transferOutAirportLoc}
        onChange={onTransferOutAirportLocChange}
      />
      <AuthInput
        label={t('newBooking.flightNumber')}
        value={departureFlightNo}
        onChangeText={onDepartureFlightNoChange}
        autoCapitalize="characters"
        placeholder={t('newBooking.flightNumberPlaceholder')}
      />
    </View>
  );
}
