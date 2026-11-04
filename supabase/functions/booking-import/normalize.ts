// normalize.ts — reading the values a booking cannot afford to get wrong.
//
// Every function here is pure and deterministic, so the rules reader and the
// review of the model's answer read a time, an amount or a head count the
// same way. Each one also says when it is NOT sure ("ambiguous"): the review
// turns that into "needs the agency's confirmation" instead of a guess that
// looks like a fact.

/** HH:MM, 24-hour. */
export type Clock = string;

export type ClockRead = {
  /** The time as a 24-hour clock, or null when the text holds no time. */
  hhmm: Clock | null;
  /** True when the reading is a guess a person must confirm. */
  ambiguous: boolean;
  /** Why it is ambiguous, for the review. */
  reason: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');

function clock(h: number, m: number): Clock | null {
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/** "PM" / "p.m." / "AM" written anywhere in the text. */
export function hasMeridiem(text: string): boolean {
  return /(^|[^\p{L}])([ap])\.?\s?m\.?(?![\p{L}])/iu.test(text);
}

function fromMeridiem(h: number, m: number, marker: string): Clock | null {
  if (h < 1 || h > 12) return null;
  const pm = /^p/i.test(marker);
  if (pm) return clock(h === 12 ? 12 : h + 12, m);
  return clock(h === 12 ? 0 : h, m);
}

/** A day-part word: Georgian before the number, Russian and English after it. */
function fromDayPart(h: number, m: number, part: 'morning' | 'day' | 'evening' | 'night'): Clock | null {
  if (h < 0 || h > 23) return null;
  if (h > 12) return clock(h, m); // "22 вечера" is already a 24-hour time
  switch (part) {
    case 'morning':
      return clock(h === 12 ? 0 : h, m);
    case 'day':
      // "2 დღის" / "в 2 дня" is 14:00; "12 дня" is noon.
      return clock(h === 12 ? 12 : h <= 6 ? h + 12 : h, m);
    case 'evening':
      return clock(h === 12 ? 12 : h + 12, m);
    case 'night':
      // "12 ღამის" is midnight, "2 ночи" is 02:00, "11 ночи" is 23:00.
      if (h === 12) return clock(0, m);
      return clock(h <= 5 ? h : h + 12, m);
  }
}

const KA_PART: Record<string, 'morning' | 'day' | 'evening' | 'night'> = {
  'დილის': 'morning', 'დილით': 'morning', 'დღის': 'day', 'საღამოს': 'evening', 'ღამის': 'night', 'ღამით': 'night',
};
const RU_PART: Record<string, 'morning' | 'day' | 'evening' | 'night'> = {
  'утра': 'morning', 'дня': 'day', 'вечера': 'evening', 'ночи': 'night',
};
const EN_PART: Record<string, 'morning' | 'day' | 'evening' | 'night'> = {
  'in the morning': 'morning', 'in the afternoon': 'day', 'in the evening': 'evening', 'at night': 'night',
};

/**
 * A written calendar date with its year: "20.11.2026", "20/11/26",
 * "2026-11-20", "2026.11.20". Its digits are never a time of day — read as
 * one, "20.11.2026" became a 20:11 pickup. Use only with replace().
 */
export const DATE_TOKEN = /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})\b/g;

/** The text with every written date blanked out, for reading times from. */
export function withoutDates(text: string): string {
  return String(text ?? '').replace(DATE_TOKEN, ' ');
}

/**
 * The first time of day in a piece of text.
 *
 * `docHasMeridiem` says the document writes AM/PM somewhere: then a bare
 * "7:30" with no marker of its own could be either 07:30 or 19:30, and the
 * reader must not decide that for the agency. Dates in the text are not
 * times ("TK 382 20.11.2026" has no time).
 */
export function parseClock(text: string, opts: { docHasMeridiem?: boolean } = {}): ClockRead {
  const s = withoutDates(text);
  const none: ClockRead = { hhmm: null, ambiguous: false, reason: null };
  if (!s.trim()) return none;

  // 4:30 PM, 4.30pm, 12:15 a.m.
  let m = /(\d{1,2})[:.](\d{2})\s*([ap])\.?\s?m\.?(?![\p{L}])/iu.exec(s);
  if (m) {
    const c = fromMeridiem(Number(m[1]), Number(m[2]), m[3]);
    return c ? { hhmm: c, ambiguous: false, reason: null } : { hhmm: null, ambiguous: true, reason: 'time_unreadable' };
  }
  // 7 pm, 11AM
  m = /(^|[^\d:.])(\d{1,2})\s*([ap])\.?\s?m\.?(?![\p{L}])/iu.exec(s);
  if (m) {
    const c = fromMeridiem(Number(m[2]), 0, m[3]);
    return c ? { hhmm: c, ambiguous: false, reason: null } : { hhmm: null, ambiguous: true, reason: 'time_unreadable' };
  }
  // საღამოს 7-ზე, დილის 9:30
  m = /(დილის|დილით|დღის|საღამოს|ღამის|ღამით)\s*(\d{1,2})(?:[:.](\d{2}))?/u.exec(s);
  if (m) {
    const c = fromDayPart(Number(m[2]), Number(m[3] ?? 0), KA_PART[m[1]]);
    if (c) return { hhmm: c, ambiguous: false, reason: null };
  }
  // в 7 вечера, 2:30 ночи
  m = /(\d{1,2})(?:[:.](\d{2}))?\s*(утра|дня|вечера|ночи)/iu.exec(s);
  if (m) {
    const c = fromDayPart(Number(m[1]), Number(m[2] ?? 0), RU_PART[m[3].toLowerCase()]);
    if (c) return { hhmm: c, ambiguous: false, reason: null };
  }
  // 7 in the evening, 9:30 in the morning
  m = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:o'?clock\s*)?(in the morning|in the afternoon|in the evening|at night)/iu.exec(s);
  if (m) {
    const c = fromDayPart(Number(m[1]), Number(m[2] ?? 0), EN_PART[m[3].toLowerCase()]);
    if (c) return { hhmm: c, ambiguous: false, reason: null };
  }
  // 14:30, 9.05 — a 24-hour time
  m = /(^|[^\d])(\d{1,2})[:.](\d{2})(?!\d)/u.exec(s);
  if (m) {
    const h = Number(m[2]);
    const c = clock(h, Number(m[3]));
    if (!c) return { hhmm: null, ambiguous: true, reason: 'time_unreadable' };
    if (opts.docHasMeridiem && h >= 1 && h <= 12) {
      return { hhmm: c, ambiguous: true, reason: 'ampm_unclear' };
    }
    return { hhmm: c, ambiguous: false, reason: null };
  }
  return none;
}

// ----------------------------------------------------------------- amounts

export const CURRENCIES = ['GEL', 'USD', 'EUR', 'RUB', 'TRY', 'AMD', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

const CURRENCY_PATTERNS: [Currency, RegExp][] = [
  ['GEL', /₾|\bgel\b|\blari\b|лари|ლარ|(^|[^\p{L}])ლ\.?(?![\p{L}])/iu],
  ['USD', /\$|\busd\b|\bus\s?dollars?\b|\bdollars?\b|долл|დოლარ/iu],
  ['EUR', /€|\beur\b|\beuros?\b|евро|ევრო/iu],
  ['RUB', /₽|\brub\b|руб|რუბლ/iu],
  ['TRY', /₺|\btry\b|\btl\b|\blira\b|лир|ლირ/iu],
  ['AMD', /֏|\bamd\b|драм|դրամ|დრამ/iu],
  ['GBP', /£|\bgbp\b|\bpounds?\b|фунт|ფუნტ/iu],
];

/** Every currency written in the text. */
export function currenciesIn(text: string): Currency[] {
  const s = String(text ?? '');
  return CURRENCY_PATTERNS.filter(([, re]) => re.test(s)).map(([c]) => c);
}

export type AmountRead = {
  amount: number | null;
  currency: Currency | null;
  /** "35 USD per person" — not the price of the job. */
  perPerson: boolean;
  ambiguous: boolean;
  reason: string | null;
};

// ("150 GEL each way" is per direction, not per person.) Cyrillic and Georgian
// words end with a lookahead: \b sees only ASCII letters.
const PER_PERSON = new RegExp([
  String.raw`per\s+(?:person|pax|guest|head|passenger)`, String.raw`\/\s?(?:person|pers|pax|guest|чел(?![а-яё]))`,
  String.raw`\bp\.?\s?p\.?\b`, String.raw`pro\s+person`, String.raw`\beach\b(?!\s+way)`,
  String.raw`(?:за|с|на)\s+(?:1\s+|одного\s+)?(?:человека|чел(?![а-яё])\.?|персону|персоны|пассажира|гостя)`,
  String.raw`(?:ერთ\s+|თითო\s+|1\s+)?(?:ადამიანზე|პირზე|კაცზე|მგზავრზე|სტუმარზე)(?![ა-ჰ])`, 'თითოეულზე',
].join('|'), 'iu');

/**
 * One number as it is written for money: "1,250", "1.250", "1 250", "2,450.00",
 * "2.450,00", "12,50". A separator followed by exactly three digits groups
 * thousands; one followed by one or two digits is the decimal point.
 */
export function parseNumberToken(token: string): number | null {
  const t = token.replace(/[\s  '’]/g, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    normalized = t.slice(0, dec).replace(/[.,]/g, '') + '.' + t.slice(dec + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = t.split(sep);
    const tail = parts[parts.length - 1];
    if (parts.length > 2 || tail.length === 3) normalized = parts.join('');
    else normalized = parts.slice(0, -1).join('') + '.' + tail;
  } else {
    normalized = t;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const NUMBER_TOKEN = /\d{1,3}(?:[\s  '’.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;

/** The amount of a price cell, with its currency when one is written. */
export function parseAmount(text: string): AmountRead {
  const s = String(text ?? '');
  const tokens = [...s.matchAll(NUMBER_TOKEN)].map((m) => parseNumberToken(m[0])).filter((n): n is number => n !== null);
  const currencies = currenciesIn(s);
  const perPerson = PER_PERSON.test(s);
  if (tokens.length === 0) {
    return { amount: null, currency: currencies[0] ?? null, perPerson, ambiguous: false, reason: null };
  }
  const distinct = [...new Set(tokens)];
  let reason: string | null = null;
  if (currencies.length > 1) reason = 'currency_several';
  else if (distinct.length > 1) reason = 'amount_several';
  else if (perPerson) reason = 'price_per_person';
  return {
    amount: tokens[0],
    currency: currencies.length === 1 ? currencies[0] : null,
    perPerson,
    ambiguous: reason !== null,
    reason,
  };
}

// --------------------------------------------------------------- head count

export type PaxRead = {
  total: number | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  ambiguous: boolean;
  reason: string | null;
};

const ADULT = /(adults?|adt|ad\.|взросл\p{L}*|ზრდასრულ\p{L}*|დიდ\p{L}*)/iu;
const CHILD = /(children|child|kids?|chd|ch\.|дет\p{L}*|ребен\p{L}*|ребён\p{L}*|ბავშვ\p{L}*)/iu;
const INFANT = /(infants?|inf\.?|bab(?:y|ies)|младен\p{L}*|ჩვილ\p{L}*)/iu;
const INCLUDING = /incl\.?|including|включая|в\s+том\s+числе|ჩათვლით|გიდის\s+ჩათვლით/iu;

/**
 * "12 adults + 2 children", "3 взрослых + 2 детей", "2 ზრდასრული და 1 ბავშვი",
 * "4+1 infant", "2+2" — the total is every person in the car. A range
 * ("4-5") or "including the guide" is for the agency to settle.
 */
export function parsePassengers(text: string): PaxRead {
  // Ages are not people: "(ages 4 and 7)", "5 лет", "3 წლის", "7 years old".
  const s = String(text ?? '')
    .replace(/[–—]/g, '-')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(ages?|aged)\s*\d+(\s*(and|,|&|и|და)\s*\d+)*/giu, ' ')
    .replace(/\d+\s*(years?\s*old|y\.?\s?o\.?|лет|года?|წლის)/giu, ' ');
  const out: PaxRead = { total: null, adults: null, children: null, infants: null, ambiguous: false, reason: null };
  if (/\d+\s*-\s*\d+/.test(s) && !/\d{3,}/.test(s)) {
    const first = /\d+/.exec(s);
    out.total = first ? Number(first[0]) : null;
    out.ambiguous = true;
    out.reason = 'pax_range';
    return out;
  }
  // Number followed by a word, or a word followed by a number.
  const groups: { n: number; kind: 'adult' | 'child' | 'infant' | null }[] = [];
  const re = /(\d{1,3})\s*([\p{L}.]+)?/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    const word = m[2] ?? '';
    let kind: 'adult' | 'child' | 'infant' | null = null;
    if (word && ADULT.test(word)) kind = 'adult';
    else if (word && CHILD.test(word)) kind = 'child';
    else if (word && INFANT.test(word)) kind = 'infant';
    groups.push({ n, kind });
  }
  if (groups.length === 0) {
    // "adults: two" and the like are left to the model.
    return out;
  }
  const composite = groups.length > 1 && (/\+/.test(s) || /\s(and|и|და)\s/iu.test(s) || groups.some((g) => g.kind));
  if (!composite) {
    out.total = groups[0].n;
    if (groups[0].kind === 'adult') out.adults = groups[0].n;
    if (INCLUDING.test(s)) {
      out.ambiguous = true;
      out.reason = 'pax_including';
    }
    return out;
  }
  for (const g of groups) {
    if (g.kind === 'child') out.children = (out.children ?? 0) + g.n;
    else if (g.kind === 'infant') out.infants = (out.infants ?? 0) + g.n;
    else out.adults = (out.adults ?? 0) + g.n;
  }
  out.total = (out.adults ?? 0) + (out.children ?? 0) + (out.infants ?? 0);
  if (INCLUDING.test(s)) {
    out.ambiguous = true;
    out.reason = 'pax_including';
  }
  return out;
}

/** Distinct head counts a chat mentions ("4 people", "5 pax", "6 ადამიანი"). */
export function headCountsMentioned(text: string): number[] {
  const re = /(\d{1,3})\s*(people|persons|person|pax|guests|adults|человек\p{L}*|чел\.?|гост\p{L}*|ადამიან\p{L}*|სტუმარ\p{L}*|კაც\p{L}*|kişi)/giu;
  return [...new Set([...String(text ?? '').matchAll(re)].map((m) => Number(m[1])))];
}

// ------------------------------------------------------------ sanity checks

/**
 * A flight number in a cell that may hold more ("W6 4470, вылет 21:15"), or
 * null when there is none. Two characters (one at least a letter) or three
 * letters, then up to four digits.
 */
export function extractFlightNumber(text: string): string | null {
  const s = String(text ?? '').toUpperCase();
  const m = /(?:^|[^A-Z0-9])([A-Z]{3}|[A-Z][A-Z0-9]|[0-9][A-Z])\s?-?\s?(\d{1,4})[A-Z]?(?![0-9])/.exec(s);
  if (!m) return null;
  return `${m[1]} ${m[2]}`;
}

/** Normalised for comparing two readings of one flight. */
export function flightKey(v: string | null | undefined): string {
  return String(v ?? '').toUpperCase().replace(/[\s-]+/g, '');
}

const DATE_IN_TEXT = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/;

/** A cell that was a table row, not a hotel's name. */
export function looksLikeJunkPlace(v: string | null | undefined): boolean {
  const s = String(v ?? '').trim();
  if (!s) return false;
  if (DATE_IN_TEXT.test(s)) return true;
  if (/\d{1,2}:\d{2}/.test(s) && s.split(/\s+/).length > 4) return true;
  return s.length > 140;
}

/** A phone number inside a name cell ("Pieter van der Berg, +31 6 1234 5678"). */
export function splitNameAndPhone(v: string | null | undefined): { name: string | null; phone: string | null } {
  const s = String(v ?? '').trim();
  if (!s) return { name: null, phone: null };
  const m = /(\+?\d[\d\s().-]{6,}\d)/.exec(s);
  if (!m || digitsOnly(m[1]).length < 7) return { name: s, phone: null };
  const name = (s.slice(0, m.index) + s.slice(m.index + m[1].length)).replace(/[\s,;:/|-]+$/g, '').replace(/^[\s,;:/|-]+/g, '').trim();
  return { name: name || null, phone: m[1].replace(/\s+/g, ' ').trim() };
}

export function digitsOnly(v: string | null | undefined): string {
  return String(v ?? '').replace(/\D/g, '');
}

// --------------------------------------------------------- found in source

/** Lower-cased, one kind of space, no punctuation but what joins words. */
export function searchable(v: string | null | undefined): string {
  return String(v ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[“”«»„"']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Does a quote of the request actually appear in it? */
export function quoteInSource(quote: string | null | undefined, source: string | null): boolean {
  if (!quote || !source) return false;
  const q = searchable(quote);
  if (q.length < 2) return false;
  return searchable(source).includes(q);
}

/** Is this number written in the request (any common way of writing it)? */
export function numberInSource(n: number | null | undefined, source: string | null): boolean {
  if (n == null || !source || !Number.isFinite(n)) return false;
  for (const m of String(source).matchAll(NUMBER_TOKEN)) {
    const v = parseNumberToken(m[0]);
    if (v !== null && Math.abs(v - n) < 0.005) return true;
  }
  return false;
}

/** Are most of the words of a place's name in the request? */
export function placeInSource(place: string | null | undefined, source: string | null): boolean {
  if (!place || !source) return false;
  const words = searchable(place).split(' ').filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  const hay = ` ${searchable(source)} `;
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits / words.length >= 0.6;
}

/** Is this clock time written in the request, in any of the ways people write it? */
export function clockInSource(hhmm: string | null | undefined, source: string | null): boolean {
  if (!hhmm || !source) return false;
  // A date's digits are not a time: "20.11.2026" does not confirm 20:11.
  const text = withoutDates(source);
  const docHasMeridiem = hasMeridiem(text);
  const parts = text.split(/\n|(?<=[.;!?])\s+/);
  for (const part of parts) {
    // Read every time in this piece, not only the first.
    const re = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:[ap]\.?\s?m\.?|утра|дня|вечера|ночи|in the morning|in the afternoon|in the evening|at night)?/giu;
    for (const m of part.matchAll(re)) {
      // "20.11" or "14.05" on its own is as likely a day and month as a time:
      // it does not confirm one ("10.30" can only be a time).
      if (/^\d{1,2}\.\d{2}$/.test(m[0].trim()) && Number(m[2]) <= 12) continue;
      const start = Math.max(0, (m.index ?? 0) - 12);
      const window = part.slice(start, (m.index ?? 0) + m[0].length + 2);
      const read = parseClock(window, { docHasMeridiem });
      if (read.hhmm === hhmm) return true;
    }
  }
  return false;
}

/** Is a calendar day (YYYY-MM-DD) written in the request? Day-first, as Georgian operators write. */
const MONTH_NAMES: string[][] = [
  ['jan', 'январ', 'янв', 'იანვ'], ['feb', 'феврал', 'февр', 'თებ'], ['mar', 'март', 'მარტ'], ['apr', 'апрел', 'апр', 'აპრ'],
  ['may', 'мая', 'май', 'მაის'], ['jun', 'июн', 'ივნ'], ['jul', 'июл', 'ივლ'], ['aug', 'август', 'авг', 'აგვ'],
  ['sep', 'сентябр', 'сент', 'სექტ'], ['oct', 'октябр', 'окт', 'ოქტ'], ['nov', 'ноябр', 'нояб', 'ნოემ'], ['dec', 'декабр', 'дек', 'დეკ'],
];

/** A two- or four-digit year as a full year. */
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Does the request name this date (YYYY-MM-DD)? As written in tour operators'
 * requests in Georgian, English and Russian: 20.11.2026, 20/11, 2026-11-20,
 * "20 ნოემბერს", "ноября 20", "November 20th", 11/20/2026 (only when it cannot
 * be day/month), and a span of days that contains it — "18-22.11.2026",
 * "18.11-22.11", "18–22 ноября", "November 18-22", "18-დან 22-მდე ნოემბერი".
 */
export function dateInSource(ymd: string | null | undefined, source: string | null): boolean {
  if (!ymd || !source) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const s = String(source);
  if (s.includes(ymd)) return true;
  const target = Date.UTC(year, month - 1, day);
  const yearOk = (y: string | undefined) => !y || fullYear(y) === year;
  /** Is the target inside a span of at most a month (the span's year, else the target's)? */
  const within = (d1: number, m1: number, d2: number, m2: number, y?: string) => {
    if (y && !yearOk(y)) return false;
    if (d1 < 1 || d1 > 31 || d2 < 1 || d2 > 31 || m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12) return false;
    const end = Date.UTC(year, m2 - 1, d2);
    const start = Date.UTC(m1 > m2 ? year - 1 : year, m1 - 1, d1);
    return end >= start && end - start <= 31 * 86_400_000 && target >= start && target <= end;
  };

  // 2026.11.20, 2026/11/20: year first.
  for (const t of s.matchAll(/(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/g)) {
    if (Number(t[1]) === year && Number(t[2]) === month && Number(t[3]) === day) return true;
  }
  // Every numeric date, overlapping ("13-15.11.2026" holds 15.11.2026 too). A
  // number right after a dot or a slash is a month or a year, not a day.
  for (const t of s.matchAll(/(?<![\d./])(?=(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2})(?!\d))?(?![\d:]))/g)) {
    const a = Number(t[1]);
    const b = Number(t[2]);
    if (a === day && b === month && yearOk(t[3])) return true;
    // 11/20/2026: month first, unmistakably (20 is not a month).
    if (b > 12 && a === month && b === day && yearOk(t[3])) return true;
  }
  // A span of days in one month, or from one date to another.
  for (const t of s.matchAll(/(?<![\d./])(\d{1,2})\s*[-–—]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?!\d)/g)) {
    if (within(Number(t[1]), Number(t[3]), Number(t[2]), Number(t[3]), t[4])) return true;
  }
  for (const t of s.matchAll(/(?<![\d./])(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?\s*[-–—]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?!\d)/g)) {
    if (within(Number(t[1]), Number(t[2]), Number(t[4]), Number(t[5]), t[6] ?? t[3])) return true;
  }

  const lower = s.toLowerCase();
  const ord = '(?:st|nd|rd|th|-?ში|-?ს|-?ე)?';
  const span = '\\s*(?:[-–—]|to|till|until|по|до)\\s*';
  for (const name of MONTH_NAMES[month - 1]) {
    const monthWord = `${name}\\p{L}*\\.?`;
    const single = new RegExp(`((?<!\\d)${day}${ord}\\s*${monthWord})|(${monthWord}\\s*${day}(?!\\d))`, 'iu');
    if (single.test(lower)) return true;
    const spans = [
      new RegExp(`(?<!\\d)(\\d{1,2})${ord}${span}(\\d{1,2})${ord}\\s*${monthWord}`, 'giu'),
      new RegExp(`(?<!\\d)(\\d{1,2})-?დან\\s*(\\d{1,2})-?მდე\\s*${monthWord}`, 'giu'),
      new RegExp(`${monthWord}\\s*(\\d{1,2})${ord}${span}(\\d{1,2})(?!\\d)`, 'giu'),
    ];
    for (const re of spans) {
      for (const t of lower.matchAll(re)) {
        if (within(Number(t[1]), month, Number(t[2]), month)) return true;
      }
    }
  }
  return false;
}

/**
 * Every vehicle type a request names ("sedan or minivan" names two) — the
 * same words the form reader knows. A vehicle the model chose that the
 * request never names is the model's guess.
 */
export function vehiclesNamed(text: string | null | undefined): Set<string> {
  const s = String(text ?? '').toLowerCase();
  const out = new Set<string>();
  if (/სედან|sedan|седан/u.test(s)) out.add('sedan');
  if (/მინივენ|minivan|\bvan\b|минивэн|минивен|vito|viano/u.test(s)) out.add('minivan');
  if (/მიკროავტობუს|microbus|minibus|sprinter|микроавтобус/u.test(s)) out.add('microbus');
  if (/(?<!მიკრო)ავტობუს|\bbus\b|(?<!микро)автобус/u.test(s)) out.add('bus');
  if (/\bsuv\b|джип|ჯიპ|\bjeep\b/u.test(s)) out.add('suv');
  if (/off[\s-]?road|4x4|4х4|внедорожник|ოფროუდ/u.test(s)) out.add('offroad');
  return out;
}

/**
 * Every kind of service a request names in words. "Tour operator" and
 * "tourist" name none. A kind the model chose that the request never names
 * is the model's reading of its shape, not something the request says.
 */
export function kindsNamed(text: string | null | undefined): Set<string> {
  const s = String(text ?? '')
    .toLowerCase()
    .replace(/tour[\s-]?operator|туроператор|ტუროპერატორ|tourist|турист|ტურისტ|tourism|туризм|ტურიზმ/gu, ' ');
  const out = new Set<string>();
  if (/ტრანსფერ|transfer|трансфер/u.test(s)) out.add('transfer');
  // A one-day tour, taken out before looking for a tour ("8 day tour" is not one).
  // "1-day tour" is one; "8-day tour", "11 day tour", "two-day trip" are not.
  // The count is a number of its own: "09:30 Day tour" in a table row is a day tour at 09:30.
  const DAY_TOUR = /(?:ერთდღიან\S*|one[\s-]?day|(?<!(?:(?<![\d:.])(?:[2-9]|\d\d)|two|three|four|five|six|seven|eight|nine|ten|multi|several)[\s-]?)day[\s-]?(?:tour|trip)|однодневн\S*|excursion|экскурси\S*|ექსკურსი\S*)(?:\s+(?:ტურ\S*|tours?|trip|тур\S*))?/giu;
  if (DAY_TOUR.test(s)) out.add('day_tour');
  const rest = s.replace(DAY_TOUR, ' ');
  if (/ტურ|\btours?\b|(?<![а-яё])тур(?![а-яё]*(?:ист|изм))|programme|program\b|программ|პროგრამ|itinerary/u.test(rest)) out.add('tour');
  return out;
}
