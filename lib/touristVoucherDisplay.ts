import en from '../src/locales/en.json';
import ka from '../src/locales/ka.json';
import ru from '../src/locales/ru.json';
import { isLocationType } from './bookingLocations';
import { parseStoredDateTime } from './dateTime';
import { GEORGIAN_CITIES } from './georgianCities';
import {
  languageCodesFromList,
  normalizeSpokenLanguageCode,
  type SpokenLanguageCode,
} from './spokenLanguages';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  vehicleClassLabel,
  vehicleTypeLabel,
} from './vehicleCatalog';
import { touristVoucherDateLocale, type TouristVoucherLocale } from './touristVoucherLocale';

type LocalePair = { en: string; ru: string };

const PRESET_LOCATION_I18N: Record<string, LocalePair> = {
  'თბილისის აეროპორტი': { en: 'Tbilisi Airport', ru: 'Аэропорт Тбилиси' },
  'ბათუმის აეროპორტი': { en: 'Batumi Airport', ru: 'Аэропорт Батуми' },
  'ქუთაისის აეროპორტი': { en: 'Kutaisi Airport', ru: 'Аэропорт Кутаиси' },
  'თბილისის სადგური': { en: 'Tbilisi Railway Station', ru: 'Ж/д вокзал Тбилиси' },
  'ბათუმის სადგური': { en: 'Batumi Railway Station', ru: 'Ж/д вокзал Батуми' },
  'ქუთაისის სადგური': { en: 'Kutaisi Railway Station', ru: 'Ж/д вокзал Кутаиси' },
};

const CITY_I18N: Record<string, LocalePair> = {
  'თბილისი': { en: 'Tbilisi', ru: 'Тбилиси' },
  'ბათუმი': { en: 'Batumi', ru: 'Батуми' },
  'ქუთაისი': { en: 'Kutaisi', ru: 'Кутаиси' },
  'რუსთავი': { en: 'Rustavi', ru: 'Рустави' },
  'გორი': { en: 'Gori', ru: 'Гори' },
  'ზუგდიდი': { en: 'Zugdidi', ru: 'Зугдиди' },
  'თელავი': { en: 'Telavi', ru: 'Телави' },
  'მცხეთა': { en: 'Mtskheta', ru: 'Мцхета' },
  'სიღნაღი': { en: 'Sighnaghi', ru: 'Сигнахи' },
  'ბოლნისი': { en: 'Bolnisi', ru: 'Болниси' },
  'ახალციხე': { en: 'Akhaltsikhe', ru: 'Ахалцихе' },
  'ახალქალაქი': { en: 'Akhalkalaki', ru: 'Ахалкалaki' },
  'ზესტაფონი': { en: 'Zestaponi', ru: 'Зестафони' },
  'სამტრედია': { en: 'Samtredia', ru: 'Самтредиа' },
  'ფოთი': { en: 'Poti', ru: 'Поти' },
  'ოზურგეთი': { en: 'Ozurgeti', ru: 'Озургети' },
  'ქობულეთი': { en: 'Kobuleti', ru: 'Кобулети' },
  'სენაკი': { en: 'Senaki', ru: 'Сенaki' },
  'მარნეული': { en: 'Marneuli', ru: 'Марнеули' },
  'წყალტუბო': { en: 'Tskaltubo', ru: 'Цхалтубо' },
};

for (const city of GEORGIAN_CITIES) {
  if (!CITY_I18N[city]) {
    CITY_I18N[city] = { en: city, ru: city };
  }
}

type ColorCode =
  | 'black'
  | 'white'
  | 'silver'
  | 'gray'
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'brown'
  | 'beige'
  | 'orange'
  | 'gold'
  | 'burgundy';

const COLOR_ALIASES: Record<string, ColorCode> = {
  black: 'black',
  white: 'white',
  silver: 'silver',
  grey: 'gray',
  gray: 'gray',
  red: 'red',
  blue: 'blue',
  green: 'green',
  yellow: 'yellow',
  brown: 'brown',
  beige: 'beige',
  orange: 'orange',
  gold: 'gold',
  burgundy: 'burgundy',
  შავი: 'black',
  თეთრი: 'white',
  ვერცხლისფერი: 'silver',
  ნაცრისფერი: 'gray',
  წითელი: 'red',
  ლურჯი: 'blue',
  მწვანე: 'green',
  ყვითელი: 'yellow',
  ყავისფერი: 'brown',
  ბეჟი: 'beige',
  ნარინჯისფერი: 'orange',
  золотой: 'gold',
  бордовый: 'burgundy',
  'чёрный': 'black',
  'черный': 'black',
  белый: 'white',
  серебристый: 'silver',
  серый: 'gray',
  красный: 'red',
  синий: 'blue',
  зелёный: 'green',
  зеленый: 'green',
  жёлтый: 'yellow',
  желтый: 'yellow',
  коричневый: 'brown',
  бежевый: 'beige',
  оранжевый: 'orange',
  золотистый: 'gold',
};

const COLOR_LABELS: Record<ColorCode, Record<TouristVoucherLocale, string>> = {
  black: { ka: 'შავი', en: 'Black', ru: 'Чёрный' },
  white: { ka: 'თეთრი', en: 'White', ru: 'Белый' },
  silver: { ka: 'ვერცხლისფერი', en: 'Silver', ru: 'Серебристый' },
  gray: { ka: 'ნაცრისფერი', en: 'Gray', ru: 'Серый' },
  red: { ka: 'წითელი', en: 'Red', ru: 'Красный' },
  blue: { ka: 'ლურჯი', en: 'Blue', ru: 'Синий' },
  green: { ka: 'მწვანე', en: 'Green', ru: 'Зелёный' },
  yellow: { ka: 'ყვითელი', en: 'Yellow', ru: 'Жёлтый' },
  brown: { ka: 'ყავისფერი', en: 'Brown', ru: 'Коричневый' },
  beige: { ka: 'ბეჟი', en: 'Beige', ru: 'Бежевый' },
  orange: { ka: 'ნარინჯისფერი', en: 'Orange', ru: 'Оранжевый' },
  gold: { ka: 'ოქროსფერი', en: 'Gold', ru: 'Золотистый' },
  burgundy: { ka: 'ბორდო', en: 'Burgundy', ru: 'Бордовый' },
};

function spokenLanguageLabelForLocale(code: SpokenLanguageCode, locale: TouristVoucherLocale): string {
  const bundle = locale === 'en' ? en : locale === 'ru' ? ru : ka;
  return (bundle.spokenLanguages as Record<string, string>)[code] ?? code.toUpperCase();
}

export function touristVoucherTabLabels(locale: TouristVoucherLocale): { company: string; tourist: string } {
  const bundle = locale === 'en' ? en : locale === 'ru' ? ru : ka;
  return {
    company: bundle.companyVoucher.tabCompany,
    tourist: bundle.companyVoucher.tabTourist,
  };
}

export function localizeTouristLocation(
  name: string | null | undefined,
  locale: TouristVoucherLocale,
): string {
  const trimmed = name?.trim();
  if (!trimmed) return '—';
  if (locale === 'ka') return trimmed;
  return PRESET_LOCATION_I18N[trimmed]?.[locale] ?? trimmed;
}

export function formatTouristLocationDisplay(
  name: string | null | undefined,
  type: string | null | undefined,
  locale: TouristVoucherLocale,
  options?: { withIcon?: boolean },
): string {
  const localized = localizeTouristLocation(name, locale);
  if (localized === '—') return localized;
  if (options?.withIcon === false) return localized;
  if (isLocationType(type)) {
    const icons = { airport: '✈️', train_station: '🚂', hotel: '🏨', address: '📍' } as const;
    return `${icons[type]} ${localized}`;
  }
  return localized;
}

export function formatTouristLocationRoute(
  fromName: string | null | undefined,
  fromType: string | null | undefined,
  toName: string | null | undefined,
  toType: string | null | undefined,
  locale: TouristVoucherLocale,
  options?: { withIcon?: boolean },
): string {
  const from = formatTouristLocationDisplay(fromName, fromType, locale, options);
  const to = formatTouristLocationDisplay(toName, toType, locale, options);
  if (from === '—' && to === '—') return '—';
  if (from === '—') return to;
  if (to === '—') return from;
  return `${from} → ${to}`;
}

export function localizeTouristCity(city: string | null | undefined, locale: TouristVoucherLocale): string {
  const trimmed = city?.trim();
  if (!trimmed) return '—';
  if (locale === 'ka') return trimmed;
  return CITY_I18N[trimmed]?.[locale] ?? trimmed;
}

export function localizeTouristColor(color: string | null | undefined, locale: TouristVoucherLocale): string {
  const trimmed = color?.trim();
  if (!trimmed) return '—';
  const key = trimmed.toLowerCase();
  const code = COLOR_ALIASES[key] ?? COLOR_ALIASES[trimmed];
  if (code) return COLOR_LABELS[code][locale];
  return trimmed;
}

export function localizeTouristVehicleType(
  raw: string | null | undefined,
  locale: TouristVoucherLocale,
): string {
  if (!raw?.trim()) return '—';
  return vehicleTypeLabel(raw, locale);
}

export function localizeTouristVehicleClass(
  raw: string | null | undefined,
  locale: TouristVoucherLocale,
): string {
  if (!raw?.trim()) return '—';
  return vehicleClassLabel(raw, locale);
}

export function formatTouristLanguagesList(
  codes: string[] | null | undefined,
  locale: TouristVoucherLocale,
): string {
  const normalized = languageCodesFromList(codes ?? []);
  if (!normalized.length) return '';
  return normalized.map((code) => spokenLanguageLabelForLocale(code, locale)).join(', ');
}

/** Parse a pre-formatted languages string (legacy rows) into localized labels. */
export function localizeTouristLanguagesLabel(
  languagesLabel: string | null | undefined,
  languageCodes: string[] | null | undefined,
  locale: TouristVoucherLocale,
): string {
  if (languageCodes?.length) {
    return formatTouristLanguagesList(languageCodes, locale);
  }
  const raw = languagesLabel?.trim();
  if (!raw) return '';
  const parts = raw.split(/[,;|/]/).map((p) => p.trim()).filter(Boolean);
  const codes = parts
    .map((part) => normalizeSpokenLanguageCode(part))
    .filter((code): code is SpokenLanguageCode => !!code);
  if (codes.length) {
    return codes.map((code) => spokenLanguageLabelForLocale(code, locale)).join(', ');
  }
  return raw;
}

export function formatTouristStoredDate(
  value: string | null | undefined,
  locale: TouristVoucherLocale,
): string {
  const parsed = parseStoredDateTime(value);
  const d = parsed ?? (value?.trim() ? new Date(value.trim()) : null);
  if (!d || Number.isNaN(d.getTime())) return value?.trim() || '—';
  return d.toLocaleDateString(touristVoucherDateLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
