import {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { coerceValidDate, mergeDateAndTime } from './dateTime';

type OpenOptions = {
  value: Date | null | undefined;
  mode: 'date' | 'time';
  minimumDate?: Date;
  maximumDate?: Date;
  onSelect: (date: Date) => void;
};

function isDismissed(event: DateTimePickerEvent): boolean {
  return event.type === 'dismissed' || event.type === 'neutralButtonPressed';
}

/** Opens the native Android date/time dialog (recommended over inline DateTimePicker). */
export function openAndroidDateTimePicker(options: OpenOptions): void {
  if (Platform.OS !== 'android') return;

  const value = coerceValidDate(options.value);
  const minimumDate =
    options.minimumDate instanceof Date && !Number.isNaN(options.minimumDate.getTime())
      ? options.minimumDate
      : undefined;
  const maximumDate =
    options.maximumDate instanceof Date && !Number.isNaN(options.maximumDate.getTime())
      ? options.maximumDate
      : undefined;

  try {
    DateTimePickerAndroid.open({
      value,
      mode: options.mode,
      is24Hour: true,
      minimumDate: options.mode === 'date' ? minimumDate : undefined,
      maximumDate: options.mode === 'date' ? maximumDate : undefined,
      onChange: (event, selected) => {
        if (isDismissed(event) || !selected) return;
        const picked = coerceValidDate(selected);
        if (!Number.isNaN(picked.getTime())) {
          options.onSelect(picked);
        }
      },
    });
  } catch (err) {
    if (__DEV__) {
      console.warn('[openAndroidDateTimePicker]', err);
    }
  }
}

/** Date then time on Android; single step when mode is `time` only. */
export function openAndroidDateTimeFlow(params: {
  value: Date | null | undefined;
  mode: 'datetime' | 'time';
  minimumDate?: Date;
  onChange: (value: Date) => void;
}): void {
  if (Platform.OS !== 'android') return;

  const base = coerceValidDate(params.value);

  if (params.mode === 'time') {
    openAndroidDateTimePicker({
      value: base,
      mode: 'time',
      onSelect: params.onChange,
    });
    return;
  }

  openAndroidDateTimePicker({
    value: base,
    minimumDate: params.minimumDate,
    mode: 'date',
    onSelect: (datePart) => {
      const withTime = params.value
        ? mergeDateAndTime(datePart, coerceValidDate(params.value))
        : datePart;
      openAndroidDateTimePicker({
        value: withTime,
        mode: 'time',
        onSelect: (timePart) => {
          params.onChange(mergeDateAndTime(datePart, timePart));
        },
      });
    },
  });
}
