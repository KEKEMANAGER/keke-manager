// review.ts — which of a draft's critical values the agency can rely on.
//
// The importer has two readers (the rules reader and the model). A value is
// CONFIRMED only when nothing argues against it: both readers agree, or one
// read it and it is really written in the request with no ambiguity. Two
// different readings are a CONFLICT. A value the model guessed, that is not in
// the request, that came from a photo, or that is ambiguous (AM/PM, a foreign
// currency, "adults + children") is UNCONFIRMED. Unconfirmed values stay in the
// draft for the agency to check; they are never treated as confirmed.
//
// The same module approves the agency's final draft on the server before the
// booking is created (approveService), so the decision does not rest on the
// app's button alone.

import {
  clockInSource, dateInSource, flightKey, headCountsMentioned, kindsNamed, numberInSource, placeInSource,
  quoteInSource, searchable, vehiclesNamed,
} from './normalize.ts';

export type FieldStatus = 'confirmed' | 'conflict' | 'unconfirmed' | 'missing';

export const CRITICAL_FIELDS = [
  'kind', 'date', 'time', 'from_location', 'to_location', 'passengers', 'vehicle_type', 'client_price',
  'flight_number', 'flight_at', 'tour_days', 'transfer_in', 'transfer_out',
] as const;
export type CriticalField = (typeof CRITICAL_FIELDS)[number];

export type FieldReview = {
  status: FieldStatus;
  /** The value in the draft (display form). */
  value: unknown;
  /** Both readings, when they disagree. */
  candidates?: unknown[];
  reasons: string[];
  required: boolean;
};

export type ServiceReview = {
  fields: Partial<Record<CriticalField, FieldReview>>;
  /** Fields the agency must confirm, choose or fill before this service can be created. */
  blocking: CriticalField[];
  ready: boolean;
  /** Signed summary of this review, returned with the approval request. */
  token?: string;
};

export type InputKind = 'form' | 'prose' | 'chat' | 'pdf' | 'visual';

// --------------------------------------------------------------- helpers

export const VEHICLE_CAPACITY: Record<string, number> = { sedan: 4, suv: 6, offroad: 6, minivan: 8, microbus: 20, bus: 55, special: 20 };
const VEHICLES = new Set(Object.keys(VEHICLE_CAPACITY));

function tbilisiDate(iso: unknown): string | null {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  return new Date(t + 4 * 3600e3).toISOString().slice(0, 10);
}

function tbilisiClock(iso: unknown): string | null {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  return new Date(t + 4 * 3600e3).toISOString().slice(11, 16);
}

function isMidnight(iso: unknown): boolean {
  return tbilisiClock(iso) === '00:00';
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

type LegValue = { date: string | null; time: string | null; from: string | null; to: string | null; flight: string | null };

/** A leg's critical parts: when, from where, to where, which flight. */
function legValue(leg: any): LegValue | null {
  if (!leg || typeof leg !== 'object') return null;
  const date = tbilisiDate(leg.date_display);
  const time = str(leg.pickup_time) ?? (leg.date_display && !isMidnight(leg.date_display) ? tbilisiClock(leg.date_display) : null);
  const from = str(leg.from);
  const to = str(leg.to);
  const flight = str(leg.flight);
  if (!date && !time && !from && !to && !flight) return null;
  return { date, time, from, to, flight };
}

/** The critical values of a draft, in the form they are compared and fingerprinted. */
export function criticalValues(d: any): Record<CriticalField, unknown> {
  const kind = str(d?.kind);
  const isTour = kind === 'tour';
  const days: string[] | null = Array.isArray(d?.tour_days) && d.tour_days.length > 0
    ? d.tour_days.map((x: any) => (typeof x?.date === 'string' && x.date ? x.date.slice(0, 10) : ''))
    : null;
  const firstDay = days?.filter(Boolean).sort()[0] ?? null;
  return {
    kind,
    date: isTour ? (tbilisiDate(d?.date_display) ?? firstDay) : tbilisiDate(d?.date_display),
    // A tour's start time too, when it has one: the booking stores it.
    time: str(d?.pickup_time) ?? (d?.date_display && !isMidnight(d.date_display) ? tbilisiClock(d.date_display) : null),
    from_location: str(d?.from_location),
    to_location: str(d?.to_location),
    passengers: num(d?.passengers),
    vehicle_type: str(d?.vehicle_type),
    client_price: num(d?.client_price),
    flight_number: str(d?.flight_number),
    flight_at: str(d?.flight_at),
    tour_days: isTour ? days : null,
    transfer_in: isTour ? legValue(d?.transfer_in) : null,
    transfer_out: isTour ? legValue(d?.transfer_out) : null,
  };
}

const GENERIC_PLACE_WORDS = new Set([
  'hotel', 'hotels', 'the', 'and', 'international', 'airport', 'aeroport', 'station', 'railway', 'city', 'center', 'centre',
  'სასტუმრო', 'აეროპორტი', 'საერთაშორისო', 'სადგური', 'отель', 'гостиница', 'аэропорт', 'международный', 'вокзал',
]);

function placeWords(v: unknown): string[] {
  return searchable(String(v ?? '')).split(' ').filter((w) => w.length >= 3 && !GENERIC_PLACE_WORDS.has(w));
}

/** Two names for one place ("Radisson Blu Iveria, Tbilisi" / "Отель Radisson Blu Iveria")? */
export function samePlace(a: unknown, b: unknown): boolean {
  const A = placeWords(a);
  const B = placeWords(b);
  if (A.length === 0 || B.length === 0) return searchable(String(a)) === searchable(String(b));
  const setB = new Set(B);
  const common = A.filter((w) => setB.has(w)).length;
  return common / Math.min(A.length, B.length) >= 0.5;
}

/** Do two readings of one field say the same thing? */
export function sameValue(field: CriticalField, a: unknown, b: unknown): boolean {
  if (a == null || b == null) return true;
  switch (field) {
    case 'client_price': {
      const x = Number(a);
      const y = Number(b);
      return Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1) <= 0.02;
    }
    case 'flight_number':
      return flightKey(String(a)) === flightKey(String(b));
    case 'from_location':
    case 'to_location':
      return samePlace(a, b);
    case 'tour_days': {
      const x = (a as string[]).filter(Boolean).sort().join(',');
      const y = (b as string[]).filter(Boolean).sort().join(',');
      return x === y;
    }
    case 'transfer_in':
    case 'transfer_out': {
      const x = a as any;
      const y = b as any;
      return (!x.date || !y.date || x.date === y.date) && (!x.time || !y.time || x.time === y.time) &&
        (!x.from || !y.from || samePlace(x.from, y.from)) && (!x.to || !y.to || samePlace(x.to, y.to)) &&
        (!x.flight || !y.flight || flightKey(x.flight) === flightKey(y.flight));
    }
    default:
      return JSON.stringify(a) === JSON.stringify(b);
  }
}

function isEmpty(field: CriticalField, v: unknown): boolean {
  if (v == null || v === '') return true;
  if (field === 'tour_days') return !Array.isArray(v) || v.length === 0;
  return false;
}

/**
 * The critical fields reviewed for a kind of service. A flight number is
 * reviewed for every kind: a tour's booking stores one too. If the agency
 * changes the kind, the fields the new kind adds were never reviewed, and
 * approveService asks for each of them to be confirmed.
 */
export function reviewedFields(kind: string | null): CriticalField[] {
  const base: CriticalField[] = ['kind', 'date', 'time', 'passengers', 'vehicle_type', 'client_price', 'flight_number'];
  if (kind === 'tour') return [...base, 'tour_days', 'transfer_in', 'transfer_out'];
  if (kind === 'day_tour') return [...base, 'from_location', 'to_location'];
  return [...base, 'from_location', 'to_location', 'flight_at'];
}

/** Fields the booking form itself requires for this kind of service. */
export function requiredFields(kind: string | null): Set<CriticalField> {
  const base: CriticalField[] = ['kind', 'date', 'passengers', 'vehicle_type', 'client_price'];
  if (kind === 'tour') return new Set([...base, 'tour_days']);
  if (kind === 'day_tour') return new Set([...base, 'time', 'from_location']);
  return new Set([...base, 'time', 'from_location', 'to_location']);
}

/** The model's own field names for "I worked this out rather than read it". */
const AI_FIELD_ALIASES: Record<string, CriticalField> = {
  kind: 'kind', date: 'date', time: 'time', from_location: 'from_location', to_location: 'to_location',
  passengers: 'passengers', vehicle_type: 'vehicle_type', client_price: 'client_price', flight_number: 'flight_number',
  flight_time: 'flight_at', flight_at: 'flight_at', tour_days: 'tour_days', transfer_in: 'transfer_in', transfer_out: 'transfer_out',
};

export type ReviewInput = {
  /** The merged draft the agency will see. */
  draft: any;
  /** Which reader filled each draft field. */
  sources: Record<string, string | undefined>;
  /** The rules reader's own draft, before the model's answer was merged in (null for a chat or a picture). */
  templateDraft: any | null;
  /** The model's own reading as a draft (null when the model was not used). */
  aiDraft: any | null;
  aiUncertain: string[];
  aiEvidence: Record<string, string> | null;
  /** Ambiguities the readers noticed, per field. */
  flags: Partial<Record<CriticalField, string[]>>;
  inputKind: InputKind;
  sourceText: string | null;
  /** The model's answer was cut off. */
  truncated: boolean;
  now: number;
};

function inRequest(field: CriticalField, value: unknown, evidence: Record<string, string> | null, source: string | null): boolean {
  if (!source) return false;
  const ev = (k: string) => evidence?.[k] ?? null;
  switch (field) {
    case 'date':
      return dateInSource(String(value), source) || (quoteInSource(ev('date'), source) && dateInSource(String(value), ev('date')));
    case 'time':
      return clockInSource(String(value), source);
    case 'passengers':
      return numberInSource(Number(value), source);
    case 'client_price':
      return numberInSource(Number(value), source);
    case 'flight_number':
      return flightKey(source).includes(flightKey(String(value)));
    case 'from_location':
    case 'to_location': {
      // The model's quote counts only if it is in the request AND names this place.
      const q = ev(field);
      return placeInSource(String(value), source) || (quoteInSource(q, source) && placeInSource(String(value), q));
    }
    case 'vehicle_type':
      // A vehicle the request never names ("7 people") is the model's choice.
      return vehiclesNamed(source).has(String(value));
    case 'kind':
      // A kind the request never names is the model's reading of its shape.
      return kindsNamed(source).has(String(value));
    case 'flight_at':
      return clockInSource(tbilisiClock(value), source);
    case 'tour_days':
      return (value as string[]).filter(Boolean).every((d) => dateInSource(d, source));
    case 'transfer_in':
    case 'transfer_out': {
      const v = value as any;
      return (!v.date || dateInSource(v.date, source)) && (!v.time || clockInSource(v.time, source)) &&
        (!v.flight || flightKey(source).includes(flightKey(v.flight))) &&
        (!v.from || placeInSource(v.from, source)) && (!v.to || placeInSource(v.to, source));
    }
  }
}

/** The review of one service. */
export function reviewService(input: ReviewInput): ServiceReview {
  const cur = criticalValues(input.draft);
  const tpl = input.templateDraft ? criticalValues(input.templateDraft) : null;
  const ai = input.aiDraft ? criticalValues(input.aiDraft) : null;
  const kind = (cur.kind as string | null) ?? 'transfer';
  const required = requiredFields(kind);
  const isTransfer = kind === 'transfer';
  const uncertain = new Set(input.aiUncertain.map((f) => AI_FIELD_ALIASES[String(f).trim()]).filter(Boolean));
  const textInput = input.inputKind !== 'visual';
  const fields: Partial<Record<CriticalField, FieldReview>> = {};

  const relevant = reviewedFields(kind);

  for (const field of relevant) {
    const value = cur[field];
    const reasons: string[] = [...(input.flags[field] ?? [])];
    const t = tpl?.[field] ?? null;
    const a = ai?.[field] ?? null;
    const src = input.sources[draftKey(field)];
    const fromAi = src === 'ai' || (src == null && a != null && t == null);

    if (isEmpty(field, value)) {
      if (field === 'tour_days') reasons.push('no_days');
      fields[field] = { status: 'missing', value: null, reasons, required: required.has(field) };
      continue;
    }
    if (t != null && a != null && !sameValue(field, t, a)) {
      fields[field] = { status: 'conflict', value, candidates: [t, a], reasons: [...reasons, 'readers_disagree'], required: required.has(field) };
      continue;
    }
    if (field === 'tour_days' && (value as string[]).some((d) => !d)) reasons.push('day_without_date');
    if (fromAi && t == null) {
      if (uncertain.has(field)) reasons.push('model_unsure');
      if (!textInput) reasons.push('from_picture');
      else if (!inRequest(field, value, input.aiEvidence, input.sourceText)) reasons.push('not_in_request');
      if (input.truncated) reasons.push('answer_cut');
    } else if (uncertain.has(field) && a != null) {
      reasons.push('model_unsure');
    }
    if (input.inputKind === 'chat') {
      if (field === 'client_price') reasons.push('chat_price');
      if (field === 'passengers' && headCountsMentioned(input.sourceText ?? '').length > 1) reasons.push('chat_several_counts');
    }
    reasons.push(...plausibility(field, value, cur, input.now));
    fields[field] = {
      status: reasons.length > 0 ? 'unconfirmed' : 'confirmed',
      value,
      reasons: [...new Set(reasons)],
      required: required.has(field),
    };
  }

  // An arrival is timed by its flight: an unsure flight makes the pickup unsure.
  const flight = fields.flight_number;
  if (flight && (flight.status === 'conflict' || flight.status === 'unconfirmed') && fields.time && fields.time.status === 'confirmed' &&
      input.draft?.flight_direction === 'arrival') {
    fields.time = { ...fields.time, status: 'unconfirmed', reasons: [...fields.time.reasons, 'flight_unclear'] };
  }

  const blocking = (Object.entries(fields) as [CriticalField, FieldReview][])
    .filter(([, r]) => r.status === 'conflict' || r.status === 'unconfirmed' || (r.status === 'missing' && r.required))
    .map(([f]) => f);
  return { fields, blocking, ready: blocking.length === 0 };
}

/** The draft field a critical field is read from, for its source. */
function draftKey(field: CriticalField): string {
  if (field === 'date') return 'date_display';
  if (field === 'time') return 'pickup_time';
  return field;
}

function plausibility(field: CriticalField, value: unknown, cur: Record<CriticalField, unknown>, now: number): string[] {
  const out: string[] = [];
  if (field === 'client_price') {
    const p = Number(value);
    if (p < 20) out.push('price_too_low');
    if (p > 50000) out.push('price_too_high');
  }
  if (field === 'passengers') {
    const n = Number(value);
    const cap = VEHICLE_CAPACITY[String(cur.vehicle_type ?? '')];
    if (!Number.isInteger(n) || n < 1 || n > 60) out.push('pax_unusual');
    if (cap && n > cap) out.push('over_capacity');
  }
  if (field === 'date') {
    const t = Date.parse(`${value}T23:59:59+04:00`);
    if (Number.isFinite(t) && t < now - 24 * 3600e3) out.push('date_past');
    if (Number.isFinite(t) && t > now + 400 * 24 * 3600e3) out.push('date_far');
  }
  if (field === 'flight_at') {
    const pickup = cur.date && cur.time ? Date.parse(`${cur.date}T${cur.time}:00+04:00`) : NaN;
    const f = Date.parse(String(value));
    if (Number.isFinite(pickup) && Number.isFinite(f) && f - pickup > 12 * 3600e3) out.push('pickup_long_before_flight');
    // A flight after midnight: is the pickup the evening before, or that same night? Read
    // wrongly, the car comes a day late. A person says which.
    if (cur.date && tbilisiDate(value) && tbilisiDate(value) !== cur.date) out.push('flight_next_day');
  }
  if (field === 'vehicle_type' && !VEHICLES.has(String(value))) out.push('vehicle_unknown');
  return out;
}

// -------------------------------------------------- what the agency is told

const FIELD_KA: Record<CriticalField, string> = {
  kind: 'სერვისის ტიპი', date: 'თარიღი', time: 'აყვანის დრო', from_location: 'საიდან', to_location: 'სად',
  passengers: 'მგზავრები', vehicle_type: 'ტრანსპორტი', client_price: 'ფასი', flight_number: 'რეისი',
  flight_at: 'რეისის დრო', tour_days: 'ტურის დღეები', transfer_in: 'ჩამოსვლის ტრანსფერი', transfer_out: 'გამგზავრების ტრანსფერი',
};

const REASON_KA: Record<string, string> = {
  readers_disagree: 'ორი წაკითხვა განსხვავდება',
  model_unsure: 'AI დარწმუნებული არ არის',
  from_picture: 'ფოტოდან არის წაკითხული',
  not_in_request: 'მოთხოვნაში ასე არ წერია',
  answer_cut: 'AI-ს პასუხი არასრულია',
  chat_price: 'ფასი ჩატიდანაა — გადაამოწმე, ბოლოს რაზე შეთანხმდით',
  chat_several_counts: 'ჩატში რამდენიმე რაოდენობაა ნახსენები',
  ampm_unclear: 'გაურკვეველია დილაა თუ საღამო (AM/PM)',
  currency_foreign: 'ფასი ლარში არ არის — ლარში მიუთითე',
  currency_several: 'რამდენიმე ვალუტაა მითითებული',
  amount_several: 'რამდენიმე თანხაა მითითებული',
  price_per_person: 'ფასი ერთ ადამიანზეა მითითებული',
  pax_range: 'რაოდენობა დიაპაზონითაა',
  pax_including: 'რაოდენობა „ჩათვლით“ წერია',
  price_too_low: 'ფასი უჩვეულოდ დაბალია',
  price_too_high: 'ფასი უჩვეულოდ მაღალია',
  pax_unusual: 'რაოდენობა უჩვეულოა',
  over_capacity: 'მგზავრები ტრანსპორტში არ ეტევა',
  date_past: 'თარიღი წარსულშია',
  date_far: 'თარიღი ერთ წელზე შორსაა',
  pickup_long_before_flight: 'აყვანა რეისამდე 12+ საათით ადრეა',
  vehicle_unknown: 'ტრანსპორტის ტიპი უცნობია',
  day_without_date: 'ერთ-ერთ დღეს თარიღი არ აქვს',
  flight_unclear: 'რეისი დასაზუსტებელია',
  no_days: 'ტურის დღეები არ არის',
  time_unreadable: 'დრო ვერ წავიკითხე',
  flight_next_day: 'რეისი შუაღამის შემდეგაა — გადაამოწმე აყვანის დღე',
  kind_changed: 'სერვისის ტიპი შეიცვალა — ეს ველი ჯერ არ შემოწმებულა',
};

function show(field: CriticalField, v: unknown): string {
  if (v == null) return '—';
  if (field === 'tour_days') return (v as string[]).filter(Boolean).join(', ') || '—';
  if (field === 'transfer_in' || field === 'transfer_out') {
    const x = v as any;
    return [x.date, x.time, x.from && x.to ? `${x.from} → ${x.to}` : x.from ?? x.to, x.flight].filter(Boolean).join(' ');
  }
  if (field === 'flight_at') {
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? new Date(t + 4 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : String(v);
  }
  return String(v);
}

/** One line per blocking field, in Georgian, for the warnings list. */
export function reviewWarnings(review: ServiceReview): string[] {
  const out: string[] = [];
  for (const field of review.blocking) {
    const r = review.fields[field];
    if (!r) continue;
    if (r.status === 'missing') continue; // the form's own "required" message covers it
    const why = r.reasons.map((x) => REASON_KA[x] ?? x).join('; ');
    const what = r.status === 'conflict'
      ? `${show(field, r.candidates?.[0])} თუ ${show(field, r.candidates?.[1])}?`
      : show(field, r.value);
    out.push(`დასადასტურებელია — ${FIELD_KA[field]}: ${what}${why ? ` (${why})` : ''}`);
  }
  return out;
}

/** Codes for the import log: which fields, which status, which reasons — no values. */
export function reviewCodes(review: ServiceReview): string[] {
  return review.blocking.map((f) => {
    const r = review.fields[f];
    return `review:${f}:${r?.status ?? '?'}${r?.reasons.length ? `:${r.reasons.join('+')}` : ''}`;
  });
}

// ------------------------------------------------ an app without the review

/**
 * For an app version that does not show the review: every critical value
 * that is not confirmed is left out of the draft fields, so the form's own
 * required-field check makes a person enter it. The value itself is still in
 * the review and in the warnings.
 */
export function withholdUnconfirmed(draft: any, review: ServiceReview): any {
  const d = structuredClone(draft);
  const midnight = (iso: unknown) => {
    const day = tbilisiDate(iso);
    return day ? new Date(Date.parse(`${day}T00:00:00+04:00`)).toISOString() : null;
  };
  const clearTime = () => {
    if (d.date_display) d.date_display = midnight(d.date_display);
    d.pickup_time = null;
  };
  for (const field of review.blocking) {
    const r = review.fields[field];
    if (!r || r.status === 'missing') continue;
    switch (field) {
      case 'kind':
      case 'date':
        if (d.kind === 'tour') {
          d.date_display = null;
          if (Array.isArray(d.tour_days) && d.tour_days[0]) d.tour_days[0] = { ...d.tour_days[0], date: null };
        } else {
          d.date_display = null;
          d.pickup_time = null;
        }
        break;
      case 'time':
        clearTime();
        break;
      case 'from_location':
        d.from_location = null; d.from_location_type = null; d.from_location_link = null;
        break;
      case 'to_location':
        d.to_location = null; d.to_location_type = null; d.to_location_link = null;
        break;
      case 'passengers':
        d.passengers = null;
        break;
      case 'vehicle_type':
        d.vehicle_type = null;
        break;
      case 'client_price':
        d.client_price = null;
        break;
      case 'flight_number':
        d.flight_number = null;
        clearTime();
        break;
      case 'flight_at':
        d.flight_at = null;
        clearTime();
        break;
      case 'tour_days':
        // Every day's date: the review does not say which one is in doubt, and
        // that app's form asks for each day's date.
        if (Array.isArray(d.tour_days)) d.tour_days = d.tour_days.map((x: any) => ({ ...x, date: null }));
        d.date_display = null;
        break;
      case 'transfer_in':
      case 'transfer_out':
        // The leg stays (so it is not quietly dropped) with its date, time, places
        // and flight to fill in: that app's form asks for each of them.
        if (d[field]) {
          d[field] = { ...d[field], date_display: null, pickup_time: null, flight: null, flight_at: null, from: null, from_type: null, from_link: null, to: null, to_type: null, to_link: null };
        }
        break;
    }
  }
  return d;
}

// --------------------------------------------------------- signed review

export type ReviewTokenPayload = {
  v: 1;
  /** company (the signed-in user) */
  c: string;
  /** issued at, epoch ms */
  t: number;
  /** per field: [status, fingerprint of the value] */
  f: Partial<Record<CriticalField, [FieldStatus, string]>>;
};

export const REVIEW_TTL_MS = 24 * 3600e3;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmacKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derived = new Uint8Array(await crypto.subtle.sign('HMAC', base, enc.encode('booking-import/review/v1')));
  return await crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** A short fingerprint of a field's value, as compared. */
export async function fingerprint(field: CriticalField, value: unknown): Promise<string> {
  let canon: string;
  if (value == null) canon = '∅';
  else if (field === 'flight_number') canon = flightKey(String(value));
  else if (field === 'from_location' || field === 'to_location') canon = searchable(String(value));
  else if (field === 'client_price') canon = String(Math.round(Number(value) * 100) / 100);
  else if (field === 'tour_days') canon = (value as string[]).join(',');
  else canon = JSON.stringify(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`${field}|${canon}`)));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signReview(companyId: string, review: ServiceReview, draft: any, secret: string, now: number): Promise<string> {
  const values = criticalValues(draft);
  const f: ReviewTokenPayload['f'] = {};
  for (const [field, r] of Object.entries(review.fields) as [CriticalField, FieldReview][]) {
    f[field] = [r.status, await fingerprint(field, values[field])];
  }
  const payload: ReviewTokenPayload = { v: 1, c: companyId, t: now, f };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyReview(token: string, secret: string): Promise<ReviewTokenPayload | null> {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return payload?.v === 1 ? payload as ReviewTokenPayload : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------ server approval

export type Issue = { field: string; code: string };

/** The critical columns of the booking about to be inserted, as the database will check them. */
export type ApprovedValues = {
  date_display: string | null;
  pickup_time: string | null;
  passengers: number | null;
  vehicle_type: string | null;
  price_gel: number | null;
  client_price: number | null;
  flight_number: string | null;
  from_location: string | null;
  to_location: string | null;
  transfer_in_date: string | null;
  transfer_out_date: string | null;
  tour_day_dates: string[] | null;
};

const KINDS = new Set(['transfer', 'day_tour', 'tour']);

/** The booking form's own required fields, checked again on the server. */
export function requiredIssues(d: any, now: number): Issue[] {
  const issues: Issue[] = [];
  const kind = String(d?.kind ?? 'transfer');
  if (!KINDS.has(kind)) issues.push({ field: 'kind', code: 'invalid' });
  const days: any[] = Array.isArray(d?.tour_days) ? d.tour_days : [];
  if (kind === 'tour') {
    if (days.length === 0 || !days.some((x) => str(x?.fromPlace))) issues.push({ field: 'tour_days', code: 'missing' });
    if (days.some((x) => !str(x?.date))) issues.push({ field: 'tour_days', code: 'day_without_date' });
    for (const key of ['transfer_in', 'transfer_out'] as const) {
      const leg = d?.[key];
      if (!leg) continue;
      if (!str(leg.date_display)) issues.push({ field: key, code: 'missing_date' });
      else if (isMidnight(leg.date_display) && !str(leg.pickup_time)) issues.push({ field: key, code: 'missing_time' });
      if (!str(leg.from) && key === 'transfer_out') issues.push({ field: key, code: 'missing_from' });
      if (!str(leg.to) && key === 'transfer_in') issues.push({ field: key, code: 'missing_to' });
      if (key === 'transfer_out' && str(leg.flight_at) && str(leg.date_display) && Date.parse(leg.date_display) >= Date.parse(leg.flight_at)) {
        issues.push({ field: key, code: 'pickup_after_flight' });
      }
    }
  } else {
    if (!str(d?.date_display)) issues.push({ field: 'date', code: 'missing' });
    else if (isMidnight(d.date_display) && !str(d?.pickup_time)) issues.push({ field: 'time', code: 'missing' });
    if (kind === 'transfer') {
      if (!str(d?.from_location)) issues.push({ field: 'from_location', code: 'missing' });
      if (!str(d?.to_location)) issues.push({ field: 'to_location', code: 'missing' });
      if (d?.flight_direction !== 'arrival' && str(d?.flight_at) && str(d?.date_display) &&
          Date.parse(d.date_display) >= Date.parse(d.flight_at)) {
        issues.push({ field: 'time', code: 'pickup_after_flight' });
      }
    } else if (!str(d?.route) && !str(d?.from_location)) {
      issues.push({ field: 'from_location', code: 'missing' });
    }
  }
  if (!VEHICLES.has(String(d?.vehicle_type ?? ''))) issues.push({ field: 'vehicle_type', code: 'missing' });
  const pax = Number(d?.passengers);
  if (!Number.isInteger(pax) || pax < 1) issues.push({ field: 'passengers', code: 'missing' });
  if (!(Number(d?.client_price) > 0)) issues.push({ field: 'client_price', code: 'missing' });
  void now;
  return issues;
}

/**
 * The server's decision on the agency's final draft. The booking may be
 * created only if every critical value that was not confirmed when the
 * request was read has since been confirmed by a person (as it now stands —
 * correcting a value is followed by confirming it), every value the kind of
 * service gained after a change of kind is confirmed too, the form's required
 * fields are filled, and the booking about to be inserted carries exactly the
 * values that were reviewed.
 */
export async function approveService(o: {
  token: string;
  secret: string;
  companyId: string;
  draft: any;
  insert: any;
  confirmed: string[];
  now: number;
}): Promise<{ ok: true; approved: ApprovedValues } | { ok: false; issues: Issue[] }> {
  const payload = await verifyReview(o.token, o.secret);
  if (!payload) return { ok: false, issues: [{ field: '*', code: 'review_invalid' }] };
  if (payload.c !== o.companyId) return { ok: false, issues: [{ field: '*', code: 'review_not_yours' }] };
  if (o.now - payload.t > REVIEW_TTL_MS || payload.t - o.now > 60_000) return { ok: false, issues: [{ field: '*', code: 'review_expired' }] };

  const issues: Issue[] = [];
  const values = criticalValues(o.draft);
  const confirmed = new Set(o.confirmed.map(String));
  // A value not confirmed when the request was read needs a person's
  // confirmation now. A change is not a confirmation: moving a tour's start
  // moves its legs and days too, values nobody looked at. (A value that was
  // missing is the form's: a person types it, and requiredIssues checks it.)
  const kind = String(o.draft?.kind ?? 'transfer');
  const relevant = new Set(reviewedFields(kind));
  for (const [field, [status]] of Object.entries(payload.f) as [CriticalField, [FieldStatus, string]][]) {
    if (status === 'confirmed' || status === 'missing') continue;
    // Not part of this kind of service any more, or emptied: none of it is
    // stored (and a required value that was emptied is requiredIssues' to report).
    if (!relevant.has(field) || isEmpty(field, values[field])) continue;
    if (!confirmed.has(field)) issues.push({ field, code: status === 'conflict' ? 'choose_value' : 'needs_confirmation' });
  }
  // The kind of service was changed after the review: whatever the new kind
  // adds (a transfer's pickup time and places, a tour's days and legs) was
  // never reviewed, so each value it holds needs a person's confirmation.
  for (const field of relevant) {
    if (payload.f[field] || isEmpty(field, values[field])) continue;
    if (!confirmed.has(field)) issues.push({ field, code: 'kind_changed' });
  }
  issues.push(...requiredIssues(o.draft, o.now));

  // The booking about to be inserted must carry the reviewed values.
  const ins = o.insert ?? {};
  const mismatch = (field: string) => issues.push({ field, code: 'insert_mismatch' });
  if (String(ins.kind ?? 'transfer') !== kind) mismatch('kind');
  if (Number(ins.passengers) !== Number(o.draft?.passengers)) mismatch('passengers');
  if (Number(ins.price_gel) !== Number(o.draft?.client_price) || Number(ins.client_price) !== Number(o.draft?.client_price)) mismatch('client_price');
  if (String(ins.vehicle_type ?? '').toLowerCase() !== String(o.draft?.vehicle_type ?? '').toLowerCase()) mismatch('vehicle_type');
  if (flightKey(ins.flight_number) !== flightKey(o.draft?.flight_number)) mismatch('flight_number');
  if (kind === 'tour') {
    if (tbilisiDate(ins.date_display) !== (values.date as string | null)) mismatch('date');
    for (const key of ['transfer_in', 'transfer_out'] as const) {
      const inserted = typeof ins[key]?.date === 'string' ? ins[key].date : null;
      if (inserted !== str(o.draft?.[key]?.date_display)) mismatch(key);
    }
    const dates = (days: unknown) => (Array.isArray(days) ? days.map((x: any) => String(x?.date ?? '')).sort().join(',') : '');
    if (dates(ins.tour_days) !== dates(o.draft?.tour_days)) mismatch('tour_days');
  } else {
    if (String(ins.date_display ?? '') !== String(o.draft?.date_display ?? '')) mismatch('date');
    if ((str(ins.pickup_time) ?? null) !== (str(o.draft?.pickup_time) ?? null)) mismatch('time');
  }
  if (issues.length > 0) return { ok: false, issues: dedupe(issues) };

  const legDate = (leg: any) => (leg && typeof leg.date === 'string' ? leg.date : null);
  // Exactly as they will be inserted: the database compares them character for character.
  const exact = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    ok: true,
    approved: {
      date_display: exact(ins.date_display),
      pickup_time: exact(ins.pickup_time),
      passengers: Number(ins.passengers),
      vehicle_type: String(ins.vehicle_type ?? '').toLowerCase() || null,
      price_gel: Number(ins.price_gel),
      client_price: Number(ins.client_price),
      flight_number: exact(ins.flight_number),
      from_location: exact(ins.from_location),
      to_location: exact(ins.to_location),
      transfer_in_date: legDate(ins.transfer_in),
      transfer_out_date: legDate(ins.transfer_out),
      tour_day_dates: Array.isArray(ins.tour_days) ? ins.tour_days.map((x: any) => String(x?.date ?? '')) : null,
    },
  };
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.field}:${i.code}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

