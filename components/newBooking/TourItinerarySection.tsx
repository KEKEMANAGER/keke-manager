import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AuthInput } from '../AuthInput';
import { DateTimeField } from '../DateTimeField';
import { countTourOvernights, type TourDayForm } from '../../lib/tourDays';

type Props = {
  tourStartDate: Date | null;
  onTourStartDateChange: (d: Date | null) => void;
  tourEndDate: Date | null;
  onTourEndDateChange: (d: Date | null) => void;
  tourDays: TourDayForm[];
  onPatchTourDay: (index: number, patch: Partial<TourDayForm>) => void;
  styles: Record<string, object>;
};

export function TourItinerarySection({
  tourStartDate,
  onTourStartDateChange,
  tourEndDate,
  onTourEndDateChange,
  tourDays,
  onPatchTourDay,
  styles,
}: Props) {
  const { t } = useTranslation();
  const tourOvernightCount = countTourOvernights(tourDays.length);

  return (
    <View>
      <Text style={[styles.sectionHeader as object, styles.sectionHeaderFirst as object]}>
        {t('newBooking.form.tourCalendar')}
      </Text>
      <DateTimeField
        label={t('newBooking.form.tourStartDate')}
        value={tourStartDate}
        onChange={onTourStartDateChange}
        placeholder={t('newBooking.form.placeholders.dateTime')}
        minimumDate={new Date()}
      />
      <DateTimeField
        label={t('newBooking.form.tourEndDate')}
        value={tourEndDate}
        onChange={onTourEndDateChange}
        placeholder={t('newBooking.form.placeholders.dateTime')}
        minimumDate={tourStartDate ?? new Date()}
      />
      {tourDays.length > 0 ? (
        <Text style={styles.tourOvernightSummary as object}>
          {t('newBooking.form.totalOvernights', { count: tourOvernightCount })}
        </Text>
      ) : null}
      {tourDays.map((day, dayIndex) => {
        const isLastDay = dayIndex === tourDays.length - 1;
        return (
          <View key={`tour-day-${day.date}-${dayIndex}`} style={styles.tourDayBlock as object}>
            <Text style={styles.tourDayTitle as object}>
              {t('newBooking.form.dayN', { n: day.day })}
            </Text>
            <AuthInput
              label={t('newBooking.form.from')}
              value={day.from}
              onChangeText={(text) => onPatchTourDay(dayIndex, { from: text })}
            />
            <AuthInput
              label={t('newBooking.form.to')}
              value={day.to}
              onChangeText={(text) => onPatchTourDay(dayIndex, { to: text })}
            />
            <AuthInput
              label={t('newBooking.form.stops')}
              value={day.stops}
              onChangeText={(text) => onPatchTourDay(dayIndex, { stops: text })}
              placeholder={t('newBooking.form.placeholders.stopsExample')}
              multiline
              style={styles.textArea as object}
            />
            {!isLastDay ? (
              <>
                <AuthInput
                  label={t('newBooking.form.touristHotel')}
                  value={day.touristHotel}
                  onChangeText={(text) => onPatchTourDay(dayIndex, { touristHotel: text })}
                  placeholder={t('newBooking.form.placeholders.touristHotel')}
                />
                <Text style={styles.fieldHint as object}>{t('newBooking.form.touristHotelHint')}</Text>
                <AuthInput
                  label={t('newBooking.form.driverOvernight')}
                  value={day.driverOvernight}
                  onChangeText={(text) => onPatchTourDay(dayIndex, { driverOvernight: text })}
                  placeholder={t('newBooking.form.placeholders.driverOvernight')}
                />
                <Text style={styles.fieldHint as object}>
                  {t('newBooking.form.driverOvernightHint')}
                </Text>
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
