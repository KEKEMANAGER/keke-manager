// deno-lint-ignore-file no-explicit-any
//
// booking-import — turn a company's own Word/Excel/text file into a booking draft.
//
// Design rules, in order of importance:
//
//  1. NOTHING is ever written to the database here. The function only returns a
//     draft. The company reviews it and the normal booking-creation path runs,
//     so every existing validation, the review gate and the availability check
//     still apply. A bad parse can never create a bad booking.
//  2. The deterministic template parser runs FIRST and always wins on the
//     fields it recognises. The model is a fallback for free-form documents,
//     not the primary path.
//  3. If the model is unavailable, misconfigured or returns nonsense, the
//     function still succeeds with whatever the template found, plus warnings.
//     The feature degrades, it never breaks.
//
// Deploy:  supabase functions deploy booking-import
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          (optional) supabase secrets set BOOKING_IMPORT_MODEL=claude-sonnet-4-5

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 6 MB of base64 ≈ 4.5 MB of file. Booking sheets are far smaller. */
const MAX_BASE64_CHARS = 6 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

const ANTHROPIC_MODEL = Deno.env.get('BOOKING_IMPORT_MODEL') ?? 'claude-sonnet-4-5';
const ANTHROPIC_VERSION = '2023-06-01';

type FieldSource = 'template' | 'ai' | 'none';

type BookingDraft = {
  kind: 'transfer' | 'tour' | 'day_tour' | null;
  date_display: string | null;
  from_location: string | null;
  to_location: string | null;
  route: string | null;
  passengers: number | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  flight_number: string | null;
  flight_direction: 'arrival' | 'departure' | null;
  pickup_time: string | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  meet_greet: boolean | null;
  sign_text: string | null;
  client_price: number | null;
  payment_method: string | null;
  comment: string | null;
  tour_days: { day: number; date: string | null; fromPlace: string | null; toPlace: string | null; stops: string | null }[] | null;
};

const EMPTY_DRAFT: BookingDraft = {
  kind: null,
  date_display: null,
  from_location: null,
  to_location: null,
  route: null,
  passengers: null,
  vehicle_type: null,
  vehicle_class: null,
  flight_number: null,
  flight_direction: null,
  pickup_time: null,
  passenger_name: null,
  passenger_phone: null,
  meet_greet: null,
  sign_text: null,
  client_price: null,
  payment_method: null,
  comment: null,
  tour_days: null,
};

// ---------------------------------------------------------------- file → text

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function xmlBlockToPlain(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab[^>]*\/>/g, ' ')
      .replace(/<w:br[^>]*\/>/g, ' ')
      // a cell with several paragraphs must not run them together, or a label
      // and the hint under it merge into one unmatchable word
      .replace(/<\/w:p>/g, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** One line per table row, cells separated by tabs. */
function tableXmlToLines(tblXml: string): string[] {
  const lines: string[] = [];
  const rowRe = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(tblXml))) {
    const cells: string[] = [];
    const cellRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(row[1]))) {
      cells.push(xmlBlockToPlain(cell[1]));
    }
    if (cells.some((c) => c)) lines.push(cells.join('\t'));
  }
  return lines;
}

/**
 * Word XML → text.
 *
 * This walks tables structurally instead of rewriting close-tags into
 * whitespace. A cell routinely holds more than one paragraph (a label with a
 * hint under it), and a flat rewrite pushes the label and its value onto
 * different lines — which silently destroys every label/value pair in the
 * document. One line per row, one tab per cell, whatever is inside the cell.
 */
function docxXmlToText(xml: string): string {
  const body = /<w:body[^>]*>([\s\S]*?)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const lines: string[] = [];
  const blockRe = /<w:tbl[\s>][\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body))) {
    const chunk = m[0];
    if (chunk.startsWith('<w:tbl')) {
      lines.push(...tableXmlToLines(chunk));
    } else {
      const t = xmlBlockToPlain(chunk);
      if (t) lines.push(t);
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function columnToIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Sheet XML → TSV rows, resolving the shared-strings table. */
function sheetXmlToText(xml: string, shared: string[]): string {
  const lines: string[] = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(row[1]))) {
      const attrs = cell[1] ?? cell[3] ?? '';
      const body = cell[2] ?? '';
      const refMatch = /r="([A-Z]+\d+)"/.exec(attrs);
      const idx = refMatch ? columnToIndex(refMatch[1]) : cells.length;
      const isShared = /t="s"/.test(attrs);
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(body);
      let value = '';
      if (isShared && vMatch) value = shared[Number(vMatch[1])] ?? '';
      else if (inline) value = inline[1];
      else if (vMatch) value = vMatch[1];
      while (cells.length < idx) cells.push('');
      cells[idx] = decodeXmlEntities(value).trim();
    }
    if (cells.some((c) => c)) lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

async function extractText(fileName: string, bytes: Uint8Array): Promise<string> {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();

  if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'tsv') {
    return new TextDecoder('utf-8').decode(bytes);
  }

  if (ext === 'docx' || ext === 'dotx') {
    const zip = await JSZip.loadAsync(bytes);
    const parts: string[] = [];
    const main = zip.file('word/document.xml');
    if (main) parts.push(docxXmlToText(await main.async('string')));
    // headers and footers often carry the company name and reference number
    for (const name of Object.keys(zip.files)) {
      if (/^word\/(header|footer)\d*\.xml$/.test(name)) {
        const f = zip.file(name);
        if (f) {
          const t = docxXmlToText(await f.async('string'));
          if (t) parts.push(t);
        }
      }
    }
    if (parts.length === 0) throw new Error('EMPTY_DOCX');
    return parts.join('\n\n');
  }

  if (ext === 'xlsx' || ext === 'xlsm') {
    const zip = await JSZip.loadAsync(bytes);
    const sharedFile = zip.file('xl/sharedStrings.xml');
    const shared: string[] = [];
    if (sharedFile) {
      const sx = await sharedFile.async('string');
      const siRe = /<si>([\s\S]*?)<\/si>/g;
      let si: RegExpExecArray | null;
      while ((si = siRe.exec(sx))) {
        const text = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((m) => m[1])
          .join('');
        shared.push(decodeXmlEntities(text));
      }
    }
    const sheets = Object.keys(zip.files)
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort();
    const out: string[] = [];
    for (const name of sheets.slice(0, 3)) {
      const f = zip.file(name);
      if (!f) continue;
      const t = sheetXmlToText(await f.async('string'), shared);
      if (t) out.push(t);
    }
    if (out.length === 0) throw new Error('EMPTY_XLSX');
    return out.join('\n\n');
  }

  if (ext === 'doc') throw new Error('OLD_DOC');
  if (ext === 'pdf') throw new Error('PDF_UNSUPPORTED');
  throw new Error('UNSUPPORTED_TYPE');
}

// ------------------------------------------------------------ template parser

/** Label → canonical field. Georgian, English and Russian, lower-cased. */
const LABELS: Record<string, keyof BookingDraft | 'time' | 'vehicle'> = {
  'სერვისი': 'kind', 'მომსახურება': 'kind', 'ჯავშნის ტიპი': 'kind',
  'service': 'kind', 'service type': 'kind', 'услуга': 'kind', 'тип': 'kind',

  'თარიღი': 'date_display', 'date': 'date_display', 'дата': 'date_display',
  'გამგზავრების თარიღი': 'date_display', 'pickup date': 'date_display',

  'დრო': 'time', 'საათი': 'time', 'time': 'time', 'pickup time': 'time', 'время': 'time',

  'საიდან': 'from_location', 'აყვანის ადგილი': 'from_location', 'აყვანა': 'from_location',
  'from': 'from_location', 'pickup': 'from_location', 'откуда': 'from_location',

  'სად': 'to_location', 'სადამდე': 'to_location', 'ჩაყვანის ადგილი': 'to_location',
  'ჩაყვანა': 'to_location', 'to': 'to_location', 'dropoff': 'to_location',
  'drop off': 'to_location', 'куда': 'to_location',

  'მარშრუტი': 'route', 'route': 'route', 'маршрут': 'route',

  'მგზავრი': 'passengers', 'მგზავრები': 'passengers', 'მგზავრების რაოდენობა': 'passengers',
  'pax': 'passengers', 'passengers': 'passengers', 'пассажиры': 'passengers',

  'ავტომობილი': 'vehicle', 'ტრანსპორტი': 'vehicle', 'მანქანა': 'vehicle',
  'vehicle': 'vehicle', 'car': 'vehicle', 'транспорт': 'vehicle',

  'კლასი': 'vehicle_class', 'class': 'vehicle_class', 'класс': 'vehicle_class',

  'რეისი': 'flight_number', 'ფრენა': 'flight_number', 'flight': 'flight_number',
  'flight number': 'flight_number', 'рейс': 'flight_number',

  'მგზავრის სახელი': 'passenger_name', 'სტუმარი': 'passenger_name',
  'passenger': 'passenger_name', 'guest': 'passenger_name',
  'passenger name': 'passenger_name', 'гость': 'passenger_name',

  'ტელეფონი': 'passenger_phone', 'მობილური': 'passenger_phone',
  'phone': 'passenger_phone', 'телефон': 'passenger_phone',

  'ტაბლო': 'sign_text', 'sign': 'sign_text', 'sign text': 'sign_text',

  'ფასი': 'client_price', 'ღირებულება': 'client_price', 'თანხა': 'client_price',
  'price': 'client_price', 'amount': 'client_price', 'цена': 'client_price',

  'გადახდა': 'payment_method', 'payment': 'payment_method', 'оплата': 'payment_method',

  'კომენტარი': 'comment', 'შენიშვნა': 'comment', 'comment': 'comment',
  'note': 'comment', 'notes': 'comment', 'комментарий': 'comment',
};

function normalizeLabel(s: string): string {
  return s
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[:：]\s*$/, '')
    .trim()
    .toLowerCase();
}

/** Longest known label first, so "pickup date" beats "date" and "to". */
const LABEL_KEYS = Object.keys(LABELS).sort((a, b) => b.length - a.length);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Operators label things their own way: "თარიღი / Date", "Pickup date (dd/mm)",
 * "PAX no.". An exact lookup would miss all of those, so fall back to finding a
 * known label as a whole word inside the cell text.
 */
function resolveLabel(normalized: string): (keyof BookingDraft | 'time' | 'vehicle') | null {
  const direct = LABELS[normalized];
  if (direct) return direct;
  // A label cell often carries a hint under the label ("Vehicle / sedan,
  // minivan, microbus, bus"), so the allowance has to cover that.
  if (normalized.length > 160) return null;

  for (const key of LABEL_KEYS) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(key)}([^\\p{L}\\p{N}]|$)`, 'u');
    if (re.test(normalized)) return LABELS[key];
  }
  return null;
}

function splitLabelValue(line: string): [string, string] | null {
  const tab = line.indexOf('\t');
  const colon = line.search(/[:：]/);
  if (tab >= 0 && (colon < 0 || tab < colon)) {
    return [line.slice(0, tab), line.slice(tab + 1)];
  }
  if (colon >= 0) return [line.slice(0, colon), line.slice(colon + 1)];
  return null;
}

function parseNumber(v: string): number | null {
  const m = /-?\d+(?:[.,]\d+)?/.exec(v.replace(/\s/g, ''));
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD, with an optional HH:MM. */
function parseDateTime(dateStr: string, timeStr?: string | null): string | null {
  const d = dateStr.trim();
  let y: number | null = null;
  let mo: number | null = null;
  let da: number | null = null;

  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(d);
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); da = Number(m[3]);
  } else {
    m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(d);
    if (m) {
      // Georgian and Russian documents are day-first; that is the house format.
      da = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
    }
  }
  if (y === null || mo === null || da === null) return null;
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;

  let hh = 0;
  let mi = 0;
  const timeSource = `${timeStr ?? ''} ${d}`;
  const t = /(\d{1,2})[:.](\d{2})/.exec(timeSource);
  if (t) {
    hh = Number(t[1]);
    mi = Number(t[2]);
    if (hh > 23 || mi > 59) { hh = 0; mi = 0; }
  }

  // Tbilisi is UTC+4 all year; the app stores an ISO instant.
  const utc = Date.UTC(y, mo - 1, da, hh - 4, mi, 0);
  const dt = new Date(utc);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function matchKind(v: string): BookingDraft['kind'] {
  const s = v.toLowerCase();
  if (/ტრანსფერ|transfer|трансфер/.test(s)) return 'transfer';
  if (/ერთდღი|one[\s-]?day|day tour|однодневн/.test(s)) return 'day_tour';
  if (/ტურ|tour|тур/.test(s)) return 'tour';
  return null;
}

function matchVehicleType(v: string): string | null {
  const s = v.toLowerCase();
  if (/სედან|sedan|седан/.test(s)) return 'sedan';
  if (/მინივენ|minivan|van\b|минивэн|vito|viano/.test(s)) return 'minivan';
  if (/მიკროავტობუს|microbus|minibus|sprinter|микроавтобус/.test(s)) return 'microbus';
  if (/ავტობუს|\bbus\b|автобус/.test(s)) return 'bus';
  if (/suv|джип|ჯიპ/.test(s)) return 'suv';
  return null;
}

function matchVehicleClass(v: string): string | null {
  const s = v.toLowerCase();
  if (/vip|ვიპ|премиум|premium|business|ბიზნეს/.test(s)) return 'vip';
  if (/კომფორტ|comfort|комфорт/.test(s)) return 'comfort';
  if (/ეკონომ|econom|эконом/.test(s)) return 'economy';
  return null;
}

function matchFlightDirection(text: string): BookingDraft['flight_direction'] {
  const s = text.toLowerCase();
  if (/ჩამოფრენ|arrival|прилет|прилёт/.test(s)) return 'arrival';
  if (/გაფრენ|departure|вылет/.test(s)) return 'departure';
  return null;
}

function parseTemplate(text: string): {
  draft: BookingDraft;
  sources: Partial<Record<keyof BookingDraft, FieldSource>>;
} {
  const draft: BookingDraft = { ...EMPTY_DRAFT };
  const sources: Partial<Record<keyof BookingDraft, FieldSource>> = {};
  let rawDate: string | null = null;
  let rawTime: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const pair = splitLabelValue(line);
    if (!pair) continue;

    const label = normalizeLabel(pair[0]);
    const value = pair[1].replace(/\t/g, ' ').trim();
    if (!value) continue;

    const field = resolveLabel(label);
    if (!field) continue;

    switch (field) {
      case 'kind': {
        const k = matchKind(value);
        if (k) { draft.kind = k; sources.kind = 'template'; }
        break;
      }
      case 'date_display':
        rawDate = value;
        break;
      case 'time':
        rawTime = value;
        break;
      case 'vehicle': {
        const t = matchVehicleType(value);
        if (t) { draft.vehicle_type = t; sources.vehicle_type = 'template'; }
        const c = matchVehicleClass(value);
        if (c && !draft.vehicle_class) { draft.vehicle_class = c; sources.vehicle_class = 'template'; }
        break;
      }
      case 'vehicle_class': {
        const c = matchVehicleClass(value);
        if (c) { draft.vehicle_class = c; sources.vehicle_class = 'template'; }
        break;
      }
      case 'passengers': {
        const n = parseNumber(value);
        if (n !== null && n > 0) {
          draft.passengers = Math.round(n);
          sources.passengers = 'template';
        }
        break;
      }
      case 'client_price': {
        const n = parseNumber(value);
        if (n !== null) { draft.client_price = n; sources.client_price = 'template'; }
        break;
      }
      default: {
        const key = field as keyof BookingDraft;
        if (draft[key] == null) {
          (draft as any)[key] = value;
          sources[key] = 'template';
        }
      }
    }
  }

  if (rawDate) {
    const iso = parseDateTime(rawDate, rawTime);
    if (iso) {
      draft.date_display = iso;
      sources.date_display = 'template';
    }
    if (rawTime) {
      const t = /(\d{1,2})[:.](\d{2})/.exec(rawTime);
      if (t) {
        draft.pickup_time = `${t[1].padStart(2, '0')}:${t[2]}`;
        sources.pickup_time = 'template';
      }
    }
  }

  const dir = matchFlightDirection(text);
  if (dir && !draft.flight_direction) {
    draft.flight_direction = dir;
    sources.flight_direction = 'template';
  }

  if (draft.meet_greet == null && /meet\s*(&|and)?\s*greet|შეხვედრა|ტაბლო/i.test(text)) {
    draft.meet_greet = true;
    sources.meet_greet = 'template';
  }

  return { draft, sources };
}

// ------------------------------------------------------------------- ai pass

const EXTRACT_TOOL = {
  name: 'submit_booking',
  description:
    'Return the booking details found in the document. Use null for anything that is not stated. Never invent a value.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: ['string', 'null'], enum: ['transfer', 'tour', 'day_tour', null] },
      date: { type: ['string', 'null'], description: 'Service start date as YYYY-MM-DD' },
      time: { type: ['string', 'null'], description: 'Pickup time as HH:MM, 24h' },
      from_location: { type: ['string', 'null'] },
      to_location: { type: ['string', 'null'] },
      route: { type: ['string', 'null'], description: 'Free-text route if given as one line' },
      passengers: { type: ['integer', 'null'] },
      vehicle_type: { type: ['string', 'null'], enum: ['sedan', 'minivan', 'microbus', 'bus', 'suv', null] },
      vehicle_class: { type: ['string', 'null'], enum: ['economy', 'comfort', 'vip', null] },
      flight_number: { type: ['string', 'null'] },
      flight_direction: { type: ['string', 'null'], enum: ['arrival', 'departure', null] },
      passenger_name: { type: ['string', 'null'] },
      passenger_phone: { type: ['string', 'null'] },
      meet_greet: { type: ['boolean', 'null'] },
      sign_text: { type: ['string', 'null'] },
      client_price: { type: ['number', 'null'] },
      payment_method: { type: ['string', 'null'] },
      comment: { type: ['string', 'null'] },
      tour_days: {
        type: ['array', 'null'],
        description: 'One entry per day for a multi-day tour, in order.',
        items: {
          type: 'object',
          properties: {
            day: { type: 'integer' },
            date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            fromPlace: { type: ['string', 'null'] },
            toPlace: { type: ['string', 'null'] },
            stops: { type: ['string', 'null'] },
          },
          required: ['day'],
        },
      },
      uncertain_fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Field names you guessed rather than read directly.',
      },
    },
    required: [],
  },
} as const;

const SYSTEM_PROMPT = `You read transport booking requests that Georgian tour operators send to a transport company, and turn them into structured data.

The documents are in Georgian, English or Russian and follow no fixed format: they may be a table, a paragraph, an email pasted into Word, or a day-by-day itinerary.

Rules:
- Only report what the document actually says. If a field is not stated, return null. Never guess a price, a phone number or a date.
- Dates in these documents are DAY FIRST (15/05/2026 is 15 May 2026), unless the format is clearly YYYY-MM-DD.
- Times are local Tbilisi time, 24-hour.
- "ტრანსფერი"/transfer = transfer. A single day of sightseeing = day_tour. Several days = tour, and then fill tour_days.
- Vehicle words: სედანი/sedan, მინივენი/Vito/Viano = minivan, მიკროავტობუსი/Sprinter = microbus, ავტობუსი = bus.
- List in uncertain_fields any field you inferred rather than read.
- Call the submit_booking tool exactly once.`;

async function aiExtract(
  text: string,
  apiKey: string,
): Promise<{ data: any | null; warning: string | null }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'submit_booking' },
        messages: [
          {
            role: 'user',
            content: `<document>\n${text.slice(0, MAX_TEXT_CHARS)}\n</document>`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        data: null,
        warning: `AI წაკითხვა ვერ მოხერხდა (${res.status}). შაბლონით წაკითხული ველები დარჩა. ${body.slice(0, 200)}`,
      };
    }

    const json = await res.json();
    const block = (json.content ?? []).find((c: any) => c.type === 'tool_use');
    if (!block?.input) {
      return { data: null, warning: 'AI-მ სტრუქტურირებული პასუხი არ დააბრუნა.' };
    }
    return { data: block.input, warning: null };
  } catch (e) {
    return { data: null, warning: `AI წაკითხვა ვერ მოხერხდა: ${String(e).slice(0, 200)}` };
  }
}

function mergeAi(
  draft: BookingDraft,
  sources: Partial<Record<keyof BookingDraft, FieldSource>>,
  ai: any,
): void {
  const setIfEmpty = (key: keyof BookingDraft, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    if (draft[key] != null) return; // the template already read this one
    (draft as any)[key] = value;
    sources[key] = 'ai';
  };

  setIfEmpty('kind', ai.kind ?? null);
  setIfEmpty('from_location', ai.from_location ?? null);
  setIfEmpty('to_location', ai.to_location ?? null);
  setIfEmpty('route', ai.route ?? null);
  setIfEmpty('passengers', typeof ai.passengers === 'number' ? Math.round(ai.passengers) : null);
  setIfEmpty('vehicle_type', ai.vehicle_type ?? null);
  setIfEmpty('vehicle_class', ai.vehicle_class ?? null);
  setIfEmpty('flight_number', ai.flight_number ?? null);
  setIfEmpty('flight_direction', ai.flight_direction ?? null);
  setIfEmpty('passenger_name', ai.passenger_name ?? null);
  setIfEmpty('passenger_phone', ai.passenger_phone ?? null);
  setIfEmpty('meet_greet', typeof ai.meet_greet === 'boolean' ? ai.meet_greet : null);
  setIfEmpty('sign_text', ai.sign_text ?? null);
  setIfEmpty('client_price', typeof ai.client_price === 'number' ? ai.client_price : null);
  setIfEmpty('payment_method', ai.payment_method ?? null);
  setIfEmpty('comment', ai.comment ?? null);
  setIfEmpty('pickup_time', typeof ai.time === 'string' ? ai.time : null);

  if (draft.date_display == null && typeof ai.date === 'string') {
    const iso = parseDateTime(ai.date, ai.time ?? draft.pickup_time ?? null);
    if (iso) {
      draft.date_display = iso;
      sources.date_display = 'ai';
    }
  }

  if (draft.tour_days == null && Array.isArray(ai.tour_days) && ai.tour_days.length > 0) {
    draft.tour_days = ai.tour_days
      .filter((d: any) => d && typeof d.day === 'number')
      .map((d: any) => ({
        day: d.day,
        date: typeof d.date === 'string' ? d.date : null,
        fromPlace: d.fromPlace ?? null,
        toPlace: d.toPlace ?? null,
        stops: d.stops ?? null,
      }));
    sources.tour_days = 'ai';
  }
}

// ------------------------------------------------------------------ validate

function buildWarnings(draft: BookingDraft): string[] {
  const w: string[] = [];
  if (!draft.date_display) w.push('თარიღი ვერ წავიკითხე — ხელით მიუთითე');
  if (!draft.vehicle_type) w.push('ტრანსპორტის ტიპი ვერ წავიკითხე');
  if (!draft.passengers) w.push('მგზავრების რაოდენობა ვერ წავიკითხე');
  if (!draft.from_location && !draft.route) w.push('აყვანის ადგილი ვერ წავიკითხე');

  if (draft.date_display) {
    const t = Date.parse(draft.date_display);
    if (Number.isFinite(t)) {
      if (t < Date.now() - 24 * 3600 * 1000) {
        w.push('თარიღი წარსულშია — გადაამოწმე');
      }
      if (t > Date.now() + 400 * 24 * 3600 * 1000) {
        w.push('თარიღი ერთ წელზე შორსაა — გადაამოწმე');
      }
    }
  }
  if (draft.passengers != null && (draft.passengers < 1 || draft.passengers > 60)) {
    w.push('მგზავრების რაოდენობა უჩვეულოა — გადაამოწმე');
  }
  if (draft.client_price != null && draft.client_price <= 0) {
    w.push('ფასი უჩვეულოა — გადაამოწმე');
  }
  return w;
}

function friendlyExtractError(code: string): string {
  switch (code) {
    case 'OLD_DOC':
      return 'ძველი .doc ფორმატი არ იკითხება. Word-ში შეინახე როგორც .docx და თავიდან ატვირთე.';
    case 'PDF_UNSUPPORTED':
      return 'PDF ჯერ არ იკითხება. გამოგვიგზავნე .docx ან .xlsx.';
    case 'EMPTY_DOCX':
    case 'EMPTY_XLSX':
      return 'ფაილი ცარიელია ან დაზიანებულია.';
    default:
      return 'ეს ფორმატი არ იკითხება. ატვირთე .docx, .xlsx ან .txt.';
  }
}

// ---------------------------------------------------------------------- serve

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
    });

  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ ok: false, error: 'ავტორიზაცია საჭიროა' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ ok: false, error: 'ავტორიზაცია ვერ დადასტურდა' }, 401);
  }

  let payload: { fileName?: string; contentBase64?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'არასწორი მოთხოვნა' }, 400);
  }

  const fileName = String(payload.fileName ?? '').trim();
  const b64 = String(payload.contentBase64 ?? '');
  if (!fileName || !b64) {
    return json({ ok: false, error: 'ფაილი არ არის' }, 400);
  }
  if (b64.length > MAX_BASE64_CHARS) {
    return json({ ok: false, error: 'ფაილი ძალიან დიდია (მაქს. ~4 MB)' }, 413);
  }

  let bytes: Uint8Array;
  try {
    const bin = atob(b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return json({ ok: false, error: 'ფაილი დაზიანებულია' }, 400);
  }

  let text: string;
  try {
    text = await extractText(fileName, bytes);
  } catch (e) {
    return json({ ok: false, error: friendlyExtractError(String((e as Error).message)) }, 415);
  }

  if (!text.trim()) {
    return json({ ok: false, error: 'ფაილში ტექსტი ვერ ვიპოვე' }, 422);
  }

  const { draft, sources } = parseTemplate(text);
  const warnings: string[] = [];

  // The template is authoritative. The model only fills what is still missing.
  const missingCore =
    !draft.date_display || !draft.vehicle_type || !draft.passengers ||
    (!draft.from_location && !draft.route);

  let usedAi = false;
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (missingCore) {
    if (apiKey) {
      const { data, warning } = await aiExtract(text, apiKey);
      if (warning) warnings.push(warning);
      if (data) {
        mergeAi(draft, sources, data);
        usedAi = true;
        if (Array.isArray(data.uncertain_fields) && data.uncertain_fields.length > 0) {
          warnings.push(
            `ეს ველები AI-მ დაასკვნა, არ ეწერა პირდაპირ: ${data.uncertain_fields.join(', ')}`,
          );
        }
      }
    } else {
      warnings.push(
        'ფაილი შაბლონს არ ემთხვევა და AI წაკითხვა გამორთულია (ANTHROPIC_API_KEY არ არის დაყენებული).',
      );
    }
  }

  warnings.push(...buildWarnings(draft));

  return json({
    ok: true,
    draft,
    sources,
    warnings,
    usedAi,
    fileName,
    textPreview: text.slice(0, 1500),
  });
});
