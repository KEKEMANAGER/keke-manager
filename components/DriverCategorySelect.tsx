import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REQUESTED_DRIVER_CATEGORIES,
  type RequestedDriverCategory,
} from '../lib/driverCategory';
import { OptionChips } from './OptionChips';

type Props = {
  value: RequestedDriverCategory;
  onChange: (value: RequestedDriverCategory) => void;
  disabled?: boolean;
};

export function DriverCategorySelect({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const options = useMemo(
    () =>
      REQUESTED_DRIVER_CATEGORIES.map((cat) => ({
        value: cat,
        label: t(`newBooking.driverCategory.${cat}`),
      })),
    [t],
  );

  return (
    <OptionChips
      label={t('newBooking.driverCategory.label')}
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
