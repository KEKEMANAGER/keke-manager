import en from '../src/locales/en.json';
import ka from '../src/locales/ka.json';
import ru from '../src/locales/ru.json';

export type TouristVoucherLocale = 'ka' | 'en' | 'ru';

export type TouristVoucherStrings = typeof ka.touristVoucher;

const BUNDLES: Record<TouristVoucherLocale, TouristVoucherStrings> = {
  ka: ka.touristVoucher,
  en: en.touristVoucher,
  ru: ru.touristVoucher,
};

export function touristVoucherStrings(locale: TouristVoucherLocale): TouristVoucherStrings {
  return BUNDLES[locale] ?? BUNDLES.ka;
}

export function touristVoucherDateLocale(locale: TouristVoucherLocale): string {
  if (locale === 'ru') return 'ru-RU';
  if (locale === 'en') return 'en-GB';
  return 'ka-GE';
}

export function touristVoucherPdfDialogTitle(locale: TouristVoucherLocale, voucherCode: string): string {
  const s = touristVoucherStrings(locale);
  return `${s.badge} ${voucherCode}`;
}
