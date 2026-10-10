/**
 * Where in Georgia a job is, and where a driver is willing to drive.
 *
 * This exists for one reason: the first dispatch wave is only ten drivers, and
 * before this they were the ten best-rated drivers anywhere in the country. A
 * Batumi airport pickup could spend all ten slots on Tbilisi drivers who were
 * never going to take it, while the Batumi driver who would have taken it sat
 * in the second wave three minutes later.
 *
 * It only ever changes the ORDER. Nobody is filtered out, the second wave still
 * reaches every matching driver, and a driver who has not said where he works
 * counts as working everywhere — most drivers have never filled this in, and
 * reading their silence as "covers nothing" would push them out of the first
 * wave overnight.
 */

export const GEORGIA_REGION_CODES = [
  'tbilisi',
  'mtskheta_mtianeti',
  'kakheti',
  'kvemo_kartli',
  'shida_kartli',
  'samtskhe_javakheti',
  'imereti',
  'racha_lechkhumi',
  'samegrelo',
  'svaneti',
  'guria',
  'adjara',
] as const;

export type GeorgiaRegionCode = (typeof GEORGIA_REGION_CODES)[number];

type RegionDef = {
  code: GeorgiaRegionCode;
  /**
   * The spellings companies actually type, Georgian and Latin, lower-cased.
   *
   * Georgian declines place names — a company writes „თბილისის აეროპორტი", not
   * „თბილისი აეროპორტი" — so matching is plain containment rather than whole
   * words. That is also why nothing shorter than four characters belongs here:
   * at three characters the airport codes start matching ordinary words.
   */
  places: string[];
};

/**
 * Svaneti sits inside Samegrelo administratively, but a driver who works
 * Zugdidi and a driver who works Mestia are not the same driver — one needs a
 * 4x4 and mountain roads in winter. The split is what the dispatch needs.
 */
const REGION_DEFS: RegionDef[] = [
  {
    code: 'tbilisi',
    places: [
      'თბილისი', 'tbilisi', 'tiflis', 'tbs',
      'თბილისის აეროპორტი', 'tbilisi airport', 'tbilisi international airport',
      'თბილისის სადგური', 'tbilisi railway station', 'tbilisi central station',
      'ვაკე', 'vake', 'საბურთალო', 'saburtalo', 'ძველი თბილისი', 'old tbilisi',
    ],
  },
  {
    code: 'mtskheta_mtianeti',
    places: [
      'მცხეთა', 'mtskheta', 'ჯვარი', 'jvari monastery',
      'ანანური', 'ananuri', 'გუდაური', 'gudauri',
      'ყაზბეგი', 'kazbegi', 'სტეფანწმინდა', 'stepantsminda', 'გერგეთი', 'gergeti',
      'ზემო ლარსი', 'zemo larsi', 'larsi', 'დუშეთი', 'dusheti',
      'ფასანაური', 'pasanauri', 'ჟინვალი', 'zhinvali',
      'თუშეთი', 'tusheti', 'ომალო', 'omalo', 'შატილი', 'shatili', 'ხევსურეთი', 'khevsureti',
    ],
  },
  {
    code: 'kakheti',
    places: [
      'კახეთი', 'kakheti', 'თელავი', 'telavi',
      'სიღნაღი', 'sighnaghi', 'signagi', 'ყვარელი', 'kvareli',
      'ლაგოდეხი', 'lagodekhi', 'გურჯაანი', 'gurjaani', 'წინანდალი', 'tsinandali',
      'ბოდბე', 'bodbe', 'დავით გარეჯი', 'david gareji', 'საგარეჯო', 'sagarejo',
      'ახმეტა', 'akhmeta', 'დედოფლისწყარო', 'dedoplistskaro',
    ],
  },
  {
    code: 'kvemo_kartli',
    places: [
      'ქვემო ქართლი', 'kvemo kartli', 'რუსთავი', 'rustavi',
      'სადახლო', 'sadakhlo', 'მარნეული', 'marneuli', 'ბოლნისი', 'bolnisi',
      'დმანისი', 'dmanisi', 'თეთრი წყარო', 'tetri tskaro', 'გარდაბანი', 'gardabani',
    ],
  },
  {
    code: 'shida_kartli',
    places: [
      'შიდა ქართლი', 'shida kartli', 'გორი', 'gori',
      'უფლისციხე', 'uplistsikhe', 'კასპი', 'kaspi', 'ხაშური', 'khashuri',
      'ქარელი', 'kareli', 'ატენი', 'ateni',
    ],
  },
  {
    code: 'samtskhe_javakheti',
    places: [
      'სამცხე', 'samtskhe', 'ჯავახეთი', 'javakheti',
      'ბორჯომი', 'borjomi', 'ბაკურიანი', 'bakuriani',
      'ახალციხე', 'akhaltsikhe', 'რაბათი', 'rabati',
      'ვარძია', 'vardzia', 'ახალქალაქი', 'akhalkalaki', 'ნინოწმინდა', 'ninotsminda',
      'ფარავანი', 'paravani', 'აბასთუმანი', 'abastumani',
    ],
  },
  {
    code: 'imereti',
    places: [
      'იმერეთი', 'imereti', 'ქუთაისი', 'kutaisi',
      'ქუთაისის აეროპორტი', 'kutaisi airport', 'kutaisi international airport',
      'ქუთაისის სადგური', 'kutaisi railway station',
      'წყალტუბო', 'tskaltubo', 'პრომეთეს მღვიმე', 'prometheus cave',
      'სათაფლია', 'sataplia', 'გელათი', 'gelati', 'ბაგრატი', 'bagrati',
      'ჭიათურა', 'chiatura', 'ზესტაფონი', 'zestaponi', 'სამტრედია', 'samtredia',
      'ოკაცეს კანიონი', 'okatse',
    ],
  },
  {
    code: 'racha_lechkhumi',
    places: [
      'რაჭა', 'racha', 'ლეჩხუმი', 'lechkhumi',
      'ამბროლაური', 'ambrolauri', 'შოვი', 'shovi', 'ონი ', 'oni,',
      'ცაგერი', 'tsageri', 'ლენტეხი', 'lentekhi', 'უწერა', 'utsera',
      'შაორი', 'shaori',
    ],
  },
  {
    code: 'samegrelo',
    places: [
      'სამეგრელო', 'samegrelo', 'ზუგდიდი', 'zugdidi',
      'ფოთი', 'poti', 'ანაკლია', 'anaklia', 'სენაკი', 'senaki',
      'მარტვილი', 'martvili', 'მარტვილის კანიონი', 'martvili canyon',
      'ხობი', 'khobi', 'ჯვარი ', 'jvari,', 'წალენჯიხა', 'tsalenjikha',
    ],
  },
  {
    code: 'svaneti',
    places: [
      'სვანეთი', 'svaneti', 'მესტია', 'mestia',
      'უშგული', 'ushguli', 'ბეჩო', 'becho', 'ჰაწვალი', 'hatsvali',
      'ლატალი', 'latali', 'მაზერი', 'mazeri', 'კორულდი', 'koruldi',
      'ჭალაადი', 'chalaadi',
    ],
  },
  {
    code: 'guria',
    places: [
      'გურია', 'guria', 'ოზურგეთი', 'ozurgeti',
      'ურეკი', 'ureki', 'შეკვეთილი', 'shekvetili', 'ბახმარო', 'bakhmaro',
      'ლანჩხუთი', 'lanchkhuti', 'ნაბეღლავი', 'nabeghlavi',
    ],
  },
  {
    code: 'adjara',
    places: [
      'აჭარა', 'adjara', 'ajara', 'achara',
      'ბათუმი', 'batumi',
      'ბათუმის აეროპორტი', 'batumi airport', 'ბათუმის სადგური', 'batumi railway station',
      'ქობულეთი', 'kobuleti', 'გონიო', 'gonio', 'მახინჯაური', 'makhinjauri',
      'სარფი', 'sarpi', 'ხულო', 'khulo', 'ქედა', 'keda', 'მწვანე კონცხი', 'mtsvane kontskhi',
      'ჩაქვი', 'chakvi', 'კინტრიში', 'kintrishi',
    ],
  },
];

/** Georgian needs no translation for its own place names, so only the region label is localised. */
export const REGION_LABELS: Record<GeorgiaRegionCode, { ka: string; en: string; ru: string; hy: string }> = {
  tbilisi: { ka: 'თბილისი', en: 'Tbilisi', ru: 'Тбилиси', hy: 'Թբիլիսի' },
  mtskheta_mtianeti: {
    ka: 'მცხეთა-მთიანეთი (ყაზბეგი, გუდაური)',
    en: 'Mtskheta-Mtianeti (Kazbegi, Gudauri)',
    ru: 'Мцхета-Мтианети (Казбеги, Гудаури)',
    hy: 'Մցխեթա-Մթիանեթի (Ղազբեգի, Գուդաուրի)',
  },
  kakheti: { ka: 'კახეთი', en: 'Kakheti', ru: 'Кахетия', hy: 'Կախեթի' },
  kvemo_kartli: { ka: 'ქვემო ქართლი', en: 'Kvemo Kartli', ru: 'Квемо-Картли', hy: 'Քվեմո Քարթլի' },
  shida_kartli: { ka: 'შიდა ქართლი (გორი)', en: 'Shida Kartli (Gori)', ru: 'Шида-Картли (Гори)', hy: 'Շիդա Քարթլի (Գորի)' },
  samtskhe_javakheti: {
    ka: 'სამცხე-ჯავახეთი (ბორჯომი, ბაკურიანი)',
    en: 'Samtskhe-Javakheti (Borjomi, Bakuriani)',
    ru: 'Самцхе-Джавахети (Боржоми, Бакуриани)',
    hy: 'Սամցխե-Ջավախք (Բորժոմի, Բակուրիանի)',
  },
  imereti: { ka: 'იმერეთი (ქუთაისი)', en: 'Imereti (Kutaisi)', ru: 'Имерети (Кутаиси)', hy: 'Իմերեթի (Քութայիսի)' },
  racha_lechkhumi: { ka: 'რაჭა-ლეჩხუმი', en: 'Racha-Lechkhumi', ru: 'Рача-Лечхуми', hy: 'Ռաչա-Լեչխումի' },
  samegrelo: { ka: 'სამეგრელო (ზუგდიდი, ფოთი)', en: 'Samegrelo (Zugdidi, Poti)', ru: 'Самегрело (Зугдиди, Поти)', hy: 'Սամեգրելո (Զուգդիդի, Փոթի)' },
  svaneti: { ka: 'სვანეთი (მესტია)', en: 'Svaneti (Mestia)', ru: 'Сванетия (Местиа)', hy: 'Սվանեթի (Մեստիա)' },
  guria: { ka: 'გურია (ურეკი)', en: 'Guria (Ureki)', ru: 'Гурия (Уреки)', hy: 'Գուրիա (Ուրեկի)' },
  adjara: { ka: 'აჭარა (ბათუმი)', en: 'Adjara (Batumi)', ru: 'Аджария (Батуми)', hy: 'Աջարիա (Բաթումի)' },
};

function normalizePlaceKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Georgian drops the nominative „-ი" in some case endings — a company writes
 * „ლაგოდეხოს საზღვარი", which does not contain „ლაგოდეხი" at all. Matching the
 * stem as well is what catches those. Only stems long enough to stand alone
 * qualify, so „გორი" never becomes a three-letter „გორ" looking for trouble.
 */
function georgianStem(key: string): string | null {
  if (!/[ა-ჿ]/.test(key)) return null;
  if (!key.endsWith('ი')) return null;
  const stem = key.slice(0, -1);
  return stem.length >= 5 ? stem : null;
}

/** Longest name first, so „ქუთაისის აეროპორტი" wins before plain „ქუთაისი". */
const PLACE_ENTRIES: { key: string; code: GeorgiaRegionCode }[] = REGION_DEFS.flatMap((def) =>
  def.places.flatMap((place) => {
    const key = normalizePlaceKey(place);
    const stem = georgianStem(key);
    const entries = [{ key, code: def.code }];
    if (stem) entries.push({ key: stem, code: def.code });
    return entries;
  }),
).sort((a, b) => b.key.length - a.key.length);

const PLACE_BY_KEY = new Map<string, GeorgiaRegionCode>();
for (const entry of PLACE_ENTRIES) {
  if (!PLACE_BY_KEY.has(entry.key)) PLACE_BY_KEY.set(entry.key, entry.code);
}

export function isGeorgiaRegionCode(value: unknown): value is GeorgiaRegionCode {
  return typeof value === 'string' && (GEORGIA_REGION_CODES as readonly string[]).includes(value);
}

/** A region's name in the interface language. */
export function regionLabel(code: GeorgiaRegionCode, language: string | null | undefined): string {
  const row = REGION_LABELS[code];
  const lang = language ?? 'ka';
  if (lang.startsWith('en')) return row.en;
  if (lang.startsWith('ru')) return row.ru;
  if (lang.startsWith('hy')) return row.hy;
  return row.ka;
}

/**
 * The region a typed place belongs to, or null when nothing is recognised.
 *
 * Null is the safe answer and the common one: companies type „Moxy hotel" or
 * „Courtyard Marriott" with no city at all. A null region means the dispatch
 * order is left exactly as it was, which is why an unrecognised place can never
 * cost a driver his place in the queue.
 */
export function resolveRegionFromText(text: string | null | undefined): GeorgiaRegionCode | null {
  const key = normalizePlaceKey(text ?? '');
  if (!key) return null;

  const exact = PLACE_BY_KEY.get(key);
  if (exact) return exact;

  for (const entry of PLACE_ENTRIES) {
    // Three characters is where airport codes start matching ordinary words.
    if (entry.key.length < 4) continue;
    if (matchesPlace(key, entry.key)) return entry.code;
  }
  return null;
}

const GEORGIAN_LETTER = /[ა-ჿ]/;

/**
 * Georgian glues its case endings straight onto the name — „ბათუმიდან" is
 * Batumi — so there containment is the only thing that works. Latin names are
 * written as separate words, and there containment is the thing that goes
 * wrong: „Grigori street" is not Gori. So each script gets the rule it needs.
 */
function matchesPlace(haystack: string, needle: string): boolean {
  if (GEORGIAN_LETTER.test(needle)) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u').test(haystack);
}

/** Every region a booking touches — pickup, drop-off and the route line. */
export function resolveBookingRegions(booking: {
  from_location?: string | null;
  to_location?: string | null;
  route?: string | null;
}): GeorgiaRegionCode[] {
  const found = new Set<GeorgiaRegionCode>();
  for (const text of [booking.from_location, booking.to_location, booking.route]) {
    const region = resolveRegionFromText(text);
    if (region) found.add(region);
  }
  return [...found];
}

/**
 * Whether this driver should be in the first wave for these regions.
 *
 * Returns true whenever there is no reason to say otherwise: no regions on the
 * booking, no answer from the driver, a multi-day tour he travels for. Only a
 * driver who narrowed his own coverage, for a booking whose region is known and
 * outside it, drops to the second wave.
 */
export function driverCoversRegions(
  driver: { service_regions?: string[] | null; travels_countrywide?: boolean | null },
  bookingRegions: GeorgiaRegionCode[],
  isMultiDayTour = false,
): boolean {
  if (bookingRegions.length === 0) return true;

  const declared = (driver.service_regions ?? []).filter(isGeorgiaRegionCode);
  if (declared.length === 0) return true;

  if (isMultiDayTour && driver.travels_countrywide === true) return true;

  return bookingRegions.some((region) => declared.includes(region));
}
