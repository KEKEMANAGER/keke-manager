// deno-lint-ignore-file no-explicit-any
//
// booking-import — turn a company's own PDF/Word/Excel/text file into a booking draft.
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
  /** Where the group sleeps / is collected from. Drivers ask for this before anything else. */
  hotel: string | null;
  tour_days: {
    day: number;
    date: string | null;
    fromPlace: string | null;
    toPlace: string | null;
    stops: string | null;
    hotel: string | null;
  }[] | null;
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
  hotel: null,
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

  if (ext === 'pdf') return await pdfToText(bytes);

  if (ext === 'doc') throw new Error('OLD_DOC');
  throw new Error('UNSUPPORTED_TYPE');
}

// ----------------------------------------------------------------------- pdf

type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
};

/**
 * Two geometric notes the PDF reader leaves on a line for the parser. Both are
 * stripped before any text is read, so neither can reach the draft.
 *
 * SMALL_PRINT — this line is in a noticeably smaller font than the line above
 * and starts at the same left edge. Directly under a label that is the grey
 * hint a blank form prints for whoever fills it in ("dd.mm.yyyy — for example
 * 15.05.2026"), which must never be mistaken for that field's answer.
 *
 * BLOCK_BREAK — this line is separated from the one above by much more than
 * the page's usual line spacing, so it starts a new block. A value is printed
 * tight under its label; anything a paragraph away belongs to something else.
 *
 * They are only consulted where they mean something — when deciding whether
 * the line under a label is that label's value. A line carrying a mark is
 * still read as a label or a value in its own right.
 */
const SMALL_PRINT = '\u0000';
const BLOCK_BREAK = '\u0001';

function stripMarks(line: string): string {
  return line.replace(/^[\u0000\u0001]+/, '');
}

/**
 * Finds the x positions where table cells begin, by looking for left edges
 * that repeat down the page.
 *
 * A gap threshold alone cannot do this: in "Passenger    Mehmet Yilmaz" the
 * label happens to run close to the column edge, so the space before the value
 * is no wider than a word space, while in "Price        180" it is huge. What
 * actually separates a cell from its neighbour is that every value in that
 * column starts at the SAME x — so that is what we look for.
 */
function columnStarts(rows: { items: PdfTextItem[] }[]): number[] {
  // Only runs that follow something on their line can start a second column;
  // the left margin is where every line begins and proves nothing.
  const xs: number[] = [];
  for (const row of rows) {
    const visible = row.items.filter((it) => it.str.trim());
    for (let i = 1; i < visible.length; i += 1) xs.push(visible[i].x);
  }
  xs.sort((a, b) => a - b);

  // A real value column is where MOST filled rows put their value. English
  // words inside bilingual labels ("… / From", "… / Price") line up by chance
  // a handful of times, so a low threshold would cut labels in half.
  const minHits = Math.max(4, Math.round(rows.length * 0.15));

  const starts: number[] = [];
  let i = 0;
  while (i < xs.length) {
    let j = i;
    while (j < xs.length && xs[j] - xs[i] <= 2) j += 1;
    if (j - i >= minHits) starts.push(xs[i]);
    i = j;
  }
  return starts;
}

/**
 * A PDF has no lines — only text runs with coordinates. Rebuilding the lines
 * from that geometry is the whole trick: a request sheet puts the label and
 * the value at the same height, so grouping runs by y and separating the
 * columns with a tab turns the page back into the "label<TAB>value" shape the
 * template parser already understands, exactly like the .docx table walk above.
 *
 * Joining the runs in raw reading order instead would interleave the two
 * columns and lose every pairing.
 */
function pdfItemsToText(pages: PdfTextItem[][]): string {
  /** A gap this wide is a column break even where no column was detected. */
  const COLUMN_GAP = 14;
  const out: string[] = [];

  for (const items of pages) {
    const rows: { y: number; items: PdfTextItem[] }[] = [];

    for (const it of items) {
      if (!it.str) continue;
      // Tolerance scales with the font: a 10pt label and an 8pt hint printed
      // under it must stay two lines, while runs on one baseline must merge.
      const tol = Math.max(2, (it.fontSize || 10) * 0.35);
      let row = rows.find((r) => Math.abs(r.y - it.y) <= tol);
      if (!row) {
        row = { y: it.y, items: [] };
        rows.push(row);
      }
      row.items.push(it);
    }

    // PDF coordinates start at the bottom-left, so the top of the page is the
    // highest y.
    rows.sort((a, b) => b.y - a.y);

    const starts = columnStarts(rows);
    const atColumnStart = (x: number) => starts.some((c) => Math.abs(x - c) <= 2);

    // The usual line step on this page, used to tell a wrapped line from a new
    // block. The median is the right statistic here: a page with two or three
    // large section gaps would drag an average far past every normal line.
    const steps: number[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const d = rows[i - 1].y - rows[i].y;
      if (d > 0) steps.push(d);
    }
    steps.sort((a, b) => a - b);
    const medianStep = steps.length ? steps[Math.floor(steps.length / 2)] : 0;

    let prev: { x: number; y: number; fontSize: number } | null = null;

    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);

      let line = '';
      let prevEnd: number | null = null;
      let firstX: number | null = null;
      let maxFont = 0;

      for (const it of row.items) {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          if (gap > COLUMN_GAP || atColumnStart(it.x)) line += '\t';
          else if (gap > 1.2) line += ' ';
        }
        if (firstX === null && it.str.trim()) firstX = it.x;
        if (it.str.trim()) maxFont = Math.max(maxFont, it.fontSize || 0);
        line += it.str;
        prevEnd = it.x + (it.width || 0);
      }

      line = line.replace(/[ \t]+$/, '').replace(/ {2,}/g, ' ');
      if (!line.trim() || firstX === null) continue;

      let marks = '';
      if (prev !== null) {
        if (maxFont > 0 && maxFont < prev.fontSize * 0.9 && Math.abs(firstX - prev.x) <= 3) {
          marks += SMALL_PRINT;
        }
        if (medianStep > 0 && prev.y - row.y > medianStep * 1.5) {
          marks += BLOCK_BREAK;
        }
      }

      out.push(marks + line);
      prev = { x: firstX, y: row.y, fontSize: maxFont || (prev?.fontSize ?? 10) };
    }
  }

  return out.join('\n');
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  let extractTextItems: (
    data: Uint8Array,
  ) => Promise<{ totalPages: number; items: PdfTextItem[][] }>;

  // Loaded on demand, and never at module scope: a .docx import should not pay
  // for the PDF engine, and if the engine cannot load at all the rest of the
  // function must keep working. Two literal specifiers rather than one built
  // from a variable, so the deploy bundler can still see both.
  let mod: any = null;
  try {
    mod = await import('npm:unpdf@1.8.1');
  } catch {
    try {
      mod = await import('https://esm.sh/unpdf@1.8.1');
    } catch {
      mod = null;
    }
  }
  if (!mod || typeof mod.extractTextItems !== 'function') throw new Error('PDF_ENGINE');
  extractTextItems = mod.extractTextItems as typeof extractTextItems;

  let pages: PdfTextItem[][];
  try {
    const res = await extractTextItems(bytes);
    pages = res.items ?? [];
  } catch {
    throw new Error('PDF_BROKEN');
  }

  const text = pdfItemsToText(pages);
  // A photographed or scanned request has no text layer at all. That is a
  // different problem from a broken file and deserves its own message.
  if (text.replace(/\s/g, '').length < 12) throw new Error('PDF_NO_TEXT');
  return text;
}

// ------------------------------------------------------------ template parser

/**
 * Label → canonical field, lower-cased.
 *
 * Operators send their own sheets in whatever language they work in, so this
 * covers the ones that actually reach a Georgian transport company: Georgian,
 * English, Russian, Turkish, Armenian, plus the European languages tour groups
 * arrive with. Short words that are common in ordinary prose ("to", "not",
 * "da") are deliberately kept out or kept exact-only — resolveLabel matches on
 * word boundaries anywhere in the line, so a loose token here would turn a
 * sentence into a false field.
 */
const LABELS: Record<string, keyof BookingDraft | 'time' | 'vehicle'> = {
  'სერვისი': 'kind', 'მომსახურება': 'kind', 'ჯავშნის ტიპი': 'kind', 'ტიპი': 'kind',
  'service': 'kind', 'service type': 'kind', 'transfer type': 'kind',
  'услуга': 'kind', 'тип услуги': 'kind', 'вид услуги': 'kind',
  'hizmet': 'kind', 'ծառայություն': 'kind',

  'თარიღი': 'date_display', 'გამგზავრების თარიღი': 'date_display',
  'მომსახურების თარიღი': 'date_display',
  'date': 'date_display', 'pickup date': 'date_display', 'pick up date': 'date_display',
  'service date': 'date_display', 'date of service': 'date_display',
  'transfer date': 'date_display', 'tour date': 'date_display',
  'departure date': 'date_display', 'arrival date': 'date_display',
  'дата': 'date_display', 'дата подачи': 'date_display', 'дата трансфера': 'date_display',
  'tarih': 'date_display', 'ամսաթիվ': 'date_display',
  'datum': 'date_display', 'fecha': 'date_display', 'data': 'date_display',

  'დრო': 'time', 'საათი': 'time', 'აყვანის დრო': 'time',
  'time': 'time', 'pickup time': 'time', 'pick up time': 'time',
  'departure time': 'time', 'время': 'time', 'время подачи': 'time',
  'saat': 'time', 'ժամ': 'time', 'uhrzeit': 'time', 'hora': 'time', 'ora': 'time',

  'საიდან': 'from_location', 'აყვანის ადგილი': 'from_location', 'აყვანა': 'from_location',
  'from': 'from_location', 'pickup': 'from_location', 'pick up': 'from_location',
  'pick-up': 'from_location', 'pickup location': 'from_location',
  'pickup point': 'from_location', 'departure': 'from_location', 'origin': 'from_location',
  'откуда': 'from_location', 'подача': 'from_location', 'место подачи': 'from_location',
  'nereden': 'from_location', 'alış yeri': 'from_location', 'որտեղից': 'from_location',
  'von': 'from_location', 'desde': 'from_location',

  'სად': 'to_location', 'სადამდე': 'to_location', 'ჩაყვანის ადგილი': 'to_location',
  'ჩაყვანა': 'to_location', 'დანიშნულება': 'to_location',
  'to': 'to_location', 'dropoff': 'to_location', 'drop off': 'to_location',
  'drop-off': 'to_location', 'destination': 'to_location', 'arrival': 'to_location',
  'куда': 'to_location', 'назначение': 'to_location',
  'nereye': 'to_location', 'varış': 'to_location', 'ուր': 'to_location',
  'nach': 'to_location', 'hasta': 'to_location',

  'მარშრუტი': 'route', 'route': 'route', 'itinerary': 'route',
  'маршрут': 'route', 'güzergah': 'route', 'երթուղի': 'route', 'ruta': 'route',

  'სასტუმრო': 'hotel', 'განთავსება': 'hotel', 'სასტუმროს დასახელება': 'hotel',
  'ღამისთევა': 'hotel',
  'hotel': 'hotel', 'hotel name': 'hotel', 'accommodation': 'hotel', 'stay': 'hotel',
  'overnight': 'hotel', 'lodging': 'hotel',
  'отель': 'hotel', 'гостиница': 'hotel', 'размещение': 'hotel', 'ночлег': 'hotel',
  'otel': 'hotel', 'konaklama': 'hotel', 'հյուրանոց': 'hotel',
  'unterkunft': 'hotel', 'hotelname': 'hotel', 'alojamiento': 'hotel',

  'მგზავრი': 'passengers', 'მგზავრები': 'passengers', 'მგზავრების რაოდენობა': 'passengers',
  'ადამიანი': 'passengers', 'რაოდენობა': 'passengers',
  'pax': 'passengers', 'passengers': 'passengers', 'number of passengers': 'passengers',
  'no of pax': 'passengers', 'adults': 'passengers', 'persons': 'passengers',
  'пассажиры': 'passengers', 'кол-во пассажиров': 'passengers', 'количество': 'passengers',
  'yolcu': 'passengers', 'kişi': 'passengers', 'ուղևորներ': 'passengers',
  'personen': 'passengers', 'personas': 'passengers',

  'ავტომობილი': 'vehicle', 'ტრანსპორტი': 'vehicle', 'მანქანა': 'vehicle',
  'ავტომობილის ტიპი': 'vehicle',
  'vehicle': 'vehicle', 'vehicle type': 'vehicle', 'car': 'vehicle', 'car type': 'vehicle',
  'транспорт': 'vehicle', 'автомобиль': 'vehicle', 'тип авто': 'vehicle',
  'araç': 'vehicle', 'ավտոմեքենա': 'vehicle', 'fahrzeug': 'vehicle', 'vehículo': 'vehicle',

  'კლასი': 'vehicle_class', 'class': 'vehicle_class', 'vehicle class': 'vehicle_class',
  'класс': 'vehicle_class', 'sınıf': 'vehicle_class', 'դաս': 'vehicle_class',

  'რეისი': 'flight_number', 'ფრენა': 'flight_number', 'ფრენის ნომერი': 'flight_number',
  'flight': 'flight_number', 'flight number': 'flight_number', 'flight no': 'flight_number',
  'рейс': 'flight_number', 'номер рейса': 'flight_number',
  'uçuş': 'flight_number', 'uçuş no': 'flight_number', 'չվերթ': 'flight_number',
  'flug': 'flight_number', 'vuelo': 'flight_number',

  'მგზავრის სახელი': 'passenger_name', 'სტუმარი': 'passenger_name',
  'სახელი და გვარი': 'passenger_name', 'სტუმრის სახელი': 'passenger_name',
  'passenger': 'passenger_name', 'guest': 'passenger_name',
  'passenger name': 'passenger_name', 'guest name': 'passenger_name',
  'lead passenger': 'passenger_name', 'client name': 'passenger_name',
  'full name': 'passenger_name',
  'гость': 'passenger_name', 'имя': 'passenger_name', 'фио': 'passenger_name',
  'ad soyad': 'passenger_name', 'misafir': 'passenger_name', 'անուն': 'passenger_name',
  'nombre': 'passenger_name',

  'ტელეფონი': 'passenger_phone', 'მობილური': 'passenger_phone', 'ნომერი': 'passenger_phone',
  'phone': 'passenger_phone', 'phone number': 'passenger_phone', 'mobile': 'passenger_phone',
  'contact': 'passenger_phone', 'contact number': 'passenger_phone', 'tel': 'passenger_phone',
  'whatsapp': 'passenger_phone',
  'телефон': 'passenger_phone', 'моб': 'passenger_phone', 'контакт': 'passenger_phone',
  'telefon': 'passenger_phone', 'հեռախոս': 'passenger_phone', 'teléfono': 'passenger_phone',

  'ტაბლო': 'sign_text', 'შესახვედრი ტაბლო': 'sign_text',
  'sign': 'sign_text', 'sign text': 'sign_text', 'name board': 'sign_text',
  'meeting sign': 'sign_text', 'paging sign': 'sign_text',
  'табличка': 'sign_text', 'tabela': 'sign_text',

  'ფასი': 'client_price', 'ღირებულება': 'client_price', 'თანხა': 'client_price',
  'price': 'client_price', 'amount': 'client_price', 'total': 'client_price',
  'cost': 'client_price', 'fare': 'client_price', 'rate': 'client_price',
  'цена': 'client_price', 'стоимость': 'client_price', 'сумма': 'client_price',
  'fiyat': 'client_price', 'ücret': 'client_price', 'գին': 'client_price',
  'preis': 'client_price', 'precio': 'client_price', 'prezzo': 'client_price',

  'გადახდა': 'payment_method', 'ანგარიშსწორება': 'payment_method',
  'payment': 'payment_method', 'payment method': 'payment_method',
  'оплата': 'payment_method', 'способ оплаты': 'payment_method',
  'ödeme': 'payment_method', 'վճարում': 'payment_method',

  'კომენტარი': 'comment', 'შენიშვნა': 'comment', 'დამატებითი ინფორმაცია': 'comment',
  'comment': 'comment', 'comments': 'comment', 'note': 'comment', 'notes': 'comment',
  'remarks': 'comment', 'special requests': 'comment', 'additional info': 'comment',
  'комментарий': 'comment', 'примечание': 'comment', 'пожелания': 'comment',
  'açıklama': 'comment', 'նշում': 'comment', 'bemerkung': 'comment',
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
 * Whether the line OPENS with a label, which is how a label is written and
 * how a value usually is not.
 *
 * resolveLabel deliberately finds a known word anywhere in the text, so that
 * "Pickup date (dd/mm)" resolves. That reach is wrong when the question is
 * "is the line under this label another label, or is it the answer?" — there,
 * "Kakheti wine route" would resolve on "route" and a perfectly good value
 * would be thrown away.
 */
function startsWithLabel(normalized: string): boolean {
  for (const key of LABEL_KEYS) {
    if (!normalized.startsWith(key)) continue;
    const after = normalized.charAt(key.length);
    if (after === '' || !/[\p{L}\p{N}]/u.test(after)) return true;
  }
  return false;
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

/**
 * Printed forms often put the value UNDER its label rather than beside it, so
 * a bare "Date" line is not a dead end — the next line is its value. It is
 * only a value, though, if it isn't a label itself (an empty field followed by
 * the next one) and doesn't read like the blank form's own hint text.
 */
function looksLikeHint(markedLine: string): boolean {
  // Smaller print tight under a label is that label's hint; anything a
  // paragraph away is a different part of the document altogether.
  if (markedLine.startsWith(SMALL_PRINT) || markedLine.startsWith(BLOCK_BREAK)) return true;
  const line = stripMarks(markedLine);
  if (line.length > 120) return true;
  // "sedan / minivan / microbus / bus" is a list of choices, not an answer —
  // but only when the slashes separate words. "03/11/2026" is a date.
  if ((line.match(/\p{L}\s*\/\s*\p{L}/gu) ?? []).length >= 2) return true;
  return /მაგალითად|მაგ\.|for example|e\.g\.|например|напр\./i.test(line);
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

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (let i = 0; i < lines.length; i += 1) {
    const line = stripMarks(lines[i]);
    const pair = splitLabelValue(line);

    let label: string;
    let value: string;

    if (pair) {
      label = normalizeLabel(pair[0]);
      value = pair[1].replace(/\t/g, ' ').trim();
    } else {
      // No separator on this line. It may still be a label whose value was
      // printed on the line below (the usual shape of a PDF form). Only a
      // short line qualifies: resolveLabel matches a known word anywhere in
      // the text, so allowing a full sentence here would let ordinary prose
      // ("please note the driver waits 60 minutes") swallow the line after it.
      if (line.length > 40) continue;
      label = normalizeLabel(line);
      value = '';
    }

    const field = resolveLabel(label);
    if (!field) continue;

    if (!value) {
      const marked = lines[i + 1];
      if (!marked) continue;
      if (looksLikeHint(marked)) continue;
      const next = stripMarks(marked);
      // The next line belongs to another field if it is a label of its own —
      // either "Phone: +995 …" or a bare "PHONE". A value that merely happens
      // to contain a colon ("08:00") or a label word ("Kakheti wine route")
      // is still this label's answer.
      const nextPair = splitLabelValue(next);
      if (nextPair && resolveLabel(normalizeLabel(nextPair[0]))) continue;
      if (!nextPair && startsWithLabel(normalizeLabel(next))) continue;
      value = next.replace(/\t/g, ' ').trim();
      if (!value) continue;
      i += 1;
    }

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
      hotel: {
        type: ['string', 'null'],
        description: 'Hotel the group stays at or is collected from, if the document names one.',
      },
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
            hotel: { type: ['string', 'null'], description: 'Where the group sleeps that night.' },
          },
          required: ['day'],
        },
      },
      uncertain_fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Field names you guessed rather than read directly.',
      },
      evidence: {
        type: ['object', 'null'],
        description:
          'For each field you filled, the exact text from the document you read it from, copied character for character. The company checks your reading against this, so a paraphrase is worse than nothing.',
        properties: {
          date: { type: ['string', 'null'] },
          time: { type: ['string', 'null'] },
          from_location: { type: ['string', 'null'] },
          to_location: { type: ['string', 'null'] },
          passengers: { type: ['string', 'null'] },
          vehicle_type: { type: ['string', 'null'] },
          client_price: { type: ['string', 'null'] },
          flight_number: { type: ['string', 'null'] },
          passenger_name: { type: ['string', 'null'] },
          passenger_phone: { type: ['string', 'null'] },
          hotel: { type: ['string', 'null'] },
        },
      },
    },
    required: [],
  },
} as const;

const SYSTEM_PROMPT = `You read transport booking requests that Georgian tour operators send to a transport company, and turn them into structured data.

The documents arrive in whatever language the operator works in — most often Georgian, English or Russian, sometimes Turkish, Armenian or a European language — and follow no fixed format: they may be a table, a paragraph, an email pasted into Word, a PDF order form, or a day-by-day itinerary. Text taken from a PDF may have lost some of its layout; read it for meaning rather than position.

Rules:
- Only report what the document actually says. If a field is not stated, return null. Never guess a price, a phone number or a date.
- Dates in these documents are DAY FIRST (15/05/2026 is 15 May 2026), unless the format is clearly YYYY-MM-DD.
- Times are local Tbilisi time, 24-hour.
- "ტრანსფერი"/transfer = transfer. A single day of sightseeing = day_tour. Several days = tour, and then fill tour_days.
- Vehicle words: სედანი/sedan, მინივენი/Vito/Viano = minivan, მიკროავტობუსი/Sprinter = microbus, ავტობუსი = bus.
- List in uncertain_fields any field you inferred rather than read.
- Fill evidence with the exact wording you read each field from, copied from the document. A dispatcher checks your reading against it, so copy, never paraphrase.
- Call the submit_booking tool exactly once.`;

/**
 * A tour operator rarely sends one service. The file that lands in a transport
 * company's inbox is a whole programme: an arrival transfer, three days of
 * sightseeing, a departure transfer — five jobs that go to different drivers on
 * different days, arriving as one document. Reading only the first one is how a
 * company ends up typing the other four by hand.
 *
 * Telling a programme from a single multi-day tour is the hard part, and it is
 * a judgement about meaning, not layout — which is exactly what the model is
 * for. The rule it is given: separate services are ones that would be
 * dispatched separately. A day-by-day itinerary the same vehicle drives
 * straight through is one service with `tour_days`.
 */
const PROGRAM_TOOL = {
  name: 'submit_program',
  description:
    'Return every transport service the document asks for, in order. Use null for anything not stated. Never invent a value.',
  input_schema: {
    type: 'object',
    properties: {
      services: {
        type: 'array',
        description: 'One entry per separately dispatched service.',
        items: EXTRACT_TOOL.input_schema,
      },
    },
    required: ['services'],
  },
} as const;

const PROGRAM_PROMPT = `${SYSTEM_PROMPT}

This document may contain MORE THAN ONE service. Return every one of them, in the order they appear.

What counts as a separate service — the test is whether a dispatcher would send a different vehicle:
- An arrival transfer, a departure transfer, and sightseeing days in between are SEPARATE services, even when they are listed in one table and paid for as one package.
- Services on dates that are not consecutive are SEPARATE.
- A day-by-day itinerary that one vehicle drives straight through — "Day 1 Tbilisi → Kazbegi, Day 2 Kazbegi → Tbilisi" — is ONE service of kind "tour", with the days in tour_days. Do not split it.
- If the document really describes only one job, return exactly one service. One is a normal answer.

Fill each service completely from the document: its own date, time, route, vehicle, passengers, price and hotel. Details stated once for the whole programme — the passenger's name and phone, the hotel the group stays at — belong on every service they apply to.

Call the submit_program tool exactly once.`;

/** Dates and service words, as a cheap signal that the file may hold a programme. */
function looksLikeMultiService(text: string): boolean {
  const body = text.replace(/[\u0000\u0001]/g, '');

  const dates = new Set<string>();
  const dmy = body.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g) ?? [];
  for (const d of dmy) dates.add(d.replace(/[.\-]/g, '/'));
  const iso = body.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  for (const d of iso) dates.add(d);

  const serviceWords =
    body.match(
      /(ტრანსფერ|ექსკურსი|ტური\b|трансфер|экскурс|тур\b|transfer|excursion|sightseeing|day tour|city tour)/gi,
    ) ?? [];

  // Deliberately generous. A false positive costs one model call and the model
  // then answers "one service"; a false negative silently loses four bookings.
  return dates.size >= 2 || serviceWords.length >= 2;
}

async function aiExtractProgram(
  text: string,
  apiKey: string,
): Promise<{ services: any[]; warning: string | null }> {
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
        max_tokens: 8192,
        system: PROGRAM_PROMPT,
        tools: [PROGRAM_TOOL],
        tool_choice: { type: 'tool', name: 'submit_program' },
        messages: [
          {
            role: 'user',
            content: `<document>\n${text.replace(/[\u0000\u0001]/g, '').slice(0, MAX_TEXT_CHARS)}\n</document>`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        services: [],
        warning: `AI წაკითხვა ვერ მოხერხდა (${res.status}). შაბლონით წაკითხული ველები დარჩა. ${body.slice(0, 200)}`,
      };
    }

    const json = await res.json();
    const block = (json.content ?? []).find((c: any) => c.type === 'tool_use');
    const services = block?.input?.services;
    if (!Array.isArray(services) || services.length === 0) {
      return { services: [], warning: 'AI-მ სტრუქტურირებული პასუხი არ დააბრუნა.' };
    }
    // A document that produced dozens of "services" was misread, not rich.
    return { services: services.slice(0, 25), warning: null };
  } catch (e) {
    return { services: [], warning: `AI წაკითხვა ვერ მოხერხდა: ${String(e).slice(0, 200)}` };
  }
}

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
            // The hint marks are an internal signal for the template parser;
            // the model sees the document as printed.
            content: `<document>\n${text.replace(/[\u0000\u0001]/g, '').slice(0, MAX_TEXT_CHARS)}\n</document>`,
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
  setIfEmpty('hotel', ai.hotel ?? null);
  setIfEmpty('pickup_time', typeof ai.time === 'string' ? ai.time : null);

  if (draft.date_display == null && typeof ai.date === 'string') {
    const iso = parseDateTime(ai.date, ai.time ?? draft.pickup_time ?? null);
    if (iso) {
      draft.date_display = iso;
      sources.date_display = 'ai';
    }
  }

  if (draft.tour_days == null && Array.isArray(ai.tour_days) && ai.tour_days.length > 0) {
    draft.tour_days = normalizeAiTourDays(ai.tour_days);
    sources.tour_days = 'ai';
  }
}

function normalizeAiTourDays(raw: unknown): BookingDraft['tour_days'] {
  if (!Array.isArray(raw)) return null;
  const days = raw
    .filter((d: any) => d && typeof d.day === 'number')
    .map((d: any) => ({
      day: d.day,
      date: typeof d.date === 'string' ? d.date : null,
      fromPlace: d.fromPlace ?? null,
      toPlace: d.toPlace ?? null,
      stops: d.stops ?? null,
      hotel: typeof d.hotel === 'string' && d.hotel.trim() ? d.hotel.trim() : null,
    }));
  return days.length > 0 ? days : null;
}

/**
 * A whole draft built from one entry of a programme. Unlike `mergeAi`, nothing
 * was read from the template for these — the model is the only source, so every
 * field is marked as such and the review screen can show that.
 */
function draftFromAi(ai: any): {
  draft: BookingDraft;
  sources: Partial<Record<keyof BookingDraft, FieldSource>>;
  evidence: Record<string, string> | null;
} {
  const draft: BookingDraft = { ...EMPTY_DRAFT };
  const sources: Partial<Record<keyof BookingDraft, FieldSource>> = {};
  mergeAi(draft, sources, ai);
  return { draft, sources, evidence: normalizeEvidence(ai?.evidence) };
}

/**
 * The document's own words for each field, so the company can check the
 * reading without opening the file. Anything the model paraphrased into
 * nothing useful is dropped rather than shown as fake proof.
 */
function normalizeEvidence(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const quote = value.trim().replace(/\s+/g, ' ').slice(0, 160);
    if (quote) out[key] = quote;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ------------------------------------------------------------------ validate

/**
 * Physical seats, not comfortable ones — a sedan seats four passengers even if
 * three is what you would sell. This only ever fires on the impossible, because
 * a warning that cries wolf teaches the company to skip the ones that matter.
 */
const VEHICLE_CAPACITY: Record<string, number> = {
  sedan: 4,
  suv: 6,
  minivan: 8,
  microbus: 20,
  bus: 55,
  special: 20,
};

/**
 * Two readers looked at this document: the template parser, which reads layout,
 * and the model, which reads meaning. Where they agree, the value is almost
 * certainly right. Where they DISAGREE, something is wrong — a day-first date
 * read month-first, a price column read as a passenger count, two numbers on
 * one line — and that disagreement is the cheapest mistake detector there is,
 * because both readings already exist.
 *
 * Only the fields where being wrong actually costs something are compared.
 * Place names are left alone: "TBS" and "Tbilisi International Airport" are not
 * a disagreement, and crying wolf about them would train the company to skip
 * the warnings that matter.
 */
function disagreementWarnings(
  draft: BookingDraft,
  sources: Partial<Record<keyof BookingDraft, FieldSource>>,
  ai: any,
): string[] {
  const w: string[] = [];
  if (!ai) return w;

  const fromTemplate = (k: keyof BookingDraft) => sources[k] === 'template';

  if (fromTemplate('date_display') && typeof ai.date === 'string' && draft.date_display) {
    const template = draft.date_display.slice(0, 10);
    const model = parseDateTime(ai.date, null)?.slice(0, 10) ?? null;
    if (model && model !== template) {
      w.push(
        `თარიღი გადაამოწმე: ფაილის სტრუქტურამ ${template} აჩვენა, ტექსტის წაკითხვამ — ${model}`,
      );
    }
  }

  if (fromTemplate('passengers') && typeof ai.passengers === 'number' && draft.passengers != null) {
    if (Math.round(ai.passengers) !== draft.passengers) {
      w.push(
        `მგზავრების რაოდენობა გადაამოწმე: ${draft.passengers} თუ ${Math.round(ai.passengers)}?`,
      );
    }
  }

  if (fromTemplate('client_price') && typeof ai.client_price === 'number' && draft.client_price != null) {
    const a = Number(draft.client_price);
    const b = Number(ai.client_price);
    // Rounding and currency symbols are not a disagreement; a different number is.
    if (a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) > 0.02) {
      w.push(`ფასი გადაამოწმე: ${a} თუ ${b}?`);
    }
  }

  if (fromTemplate('vehicle_type') && typeof ai.vehicle_type === 'string' && draft.vehicle_type) {
    if (ai.vehicle_type !== draft.vehicle_type) {
      w.push(`ტრანსპორტის ტიპი გადაამოწმე: ${draft.vehicle_type} თუ ${ai.vehicle_type}?`);
    }
  }

  return w;
}

/** Things that are simply impossible, whichever reader produced them. */
function sanityWarnings(draft: BookingDraft): string[] {
  const w: string[] = [];

  const capacity = draft.vehicle_type ? VEHICLE_CAPACITY[draft.vehicle_type] : null;
  if (capacity && draft.passengers != null && draft.passengers > capacity) {
    w.push(
      `${draft.passengers} მგზავრი ${draft.vehicle_type}-ში არ ჩაჯდება (მაქს. ${capacity}) — ტრანსპორტი ან რაოდენობა შეამოწმე`,
    );
  }

  const from = draft.from_location?.trim().toLowerCase();
  const to = draft.to_location?.trim().toLowerCase();
  if (draft.kind === 'transfer' && from && to && from === to) {
    w.push('ტრანსფერის საიდან და სად ერთი და იგივეა — შეამოწმე');
  }

  // A five-day itinerary whose dates span two days was read wrong somewhere.
  const days = draft.tour_days ?? [];
  if (days.length > 1) {
    const stamps = days
      .map((d) => (d.date ? Date.parse(d.date) : NaN))
      .filter((n) => Number.isFinite(n));
    if (stamps.length > 1) {
      const span = (Math.max(...stamps) - Math.min(...stamps)) / 86_400_000 + 1;
      if (Math.abs(span - days.length) > 1) {
        w.push(
          `ტურის დღეები ${days.length}-ია, თარიღები კი ${Math.round(span)} დღეს ფარავს — შეამოწმე`,
        );
      }
    }
  }

  return w;
}

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
  w.push(...sanityWarnings(draft));
  return w;
}

function friendlyExtractError(code: string): string {
  switch (code) {
    case 'OLD_DOC':
      return 'ძველი .doc ფორმატი არ იკითხება. Word-ში შეინახე როგორც .docx და თავიდან ატვირთე.';
    case 'PDF_NO_TEXT':
      return 'ამ PDF-ში ტექსტი არ არის — სკანირებული ან გადაღებული ჩანს. გამოგვიგზავნე ორიგინალი PDF, .docx ან .xlsx.';
    case 'PDF_BROKEN':
      return 'PDF ვერ გაიხსნა — შესაძლოა დაზიანებულია ან პაროლით არის დაცული.';
    case 'PDF_ENGINE':
      return 'PDF-ის წამკითხველი დროებით მიუწვდომელია. სცადე ხელახლა, ან გამოგვიგზავნე .docx.';
    case 'EMPTY_DOCX':
    case 'EMPTY_XLSX':
      return 'ფაილი ცარიელია ან დაზიანებულია.';
    default:
      return 'ეს ფორმატი არ იკითხება. ატვირთე PDF, .docx, .xlsx ან .txt.';
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

  const maybeProgram = looksLikeMultiService(text);

  let usedAi = false;
  /** Services 2..n of a programme. The first one is `draft` itself. */
  let extraServices: {
    draft: BookingDraft;
    sources: Partial<Record<keyof BookingDraft, FieldSource>>;
    evidence: Record<string, string> | null;
  }[] = [];
  let evidence: Record<string, string> | null = null;
  const crossWarnings: string[] = [];

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

  /**
   * The model runs on every document now, not only when the template came up
   * short. Two readers of the same page is what lets the importer catch itself:
   * where they agree the value is almost certainly right, and where they differ
   * the company is told to look. A silent misreading is the one failure this
   * feature cannot afford, and it is worth a few tetri per file to prevent.
   */
  if (!apiKey) {
    if (missingCore || maybeProgram) {
      warnings.push(
        'ფაილი შაბლონს არ ემთხვევა და AI წაკითხვა გამორთულია (ANTHROPIC_API_KEY არ არის დაყენებული).',
      );
    }
  } else if (maybeProgram) {
    // Looks like it holds more than one job. Ask for all of them — the model
    // decides how many there really are, and one is a valid answer.
    const { services: found, warning } = await aiExtractProgram(text, apiKey);
    if (warning) warnings.push(warning);
    if (found.length > 0) {
      usedAi = true;
      crossWarnings.push(...disagreementWarnings(draft, sources, found[0]));
      // The template read the first service off the actual layout, so it wins.
      mergeAi(draft, sources, found[0]);
      evidence = normalizeEvidence(found[0]?.evidence);
      extraServices = found.slice(1).map(draftFromAi);

      const uncertain = found[0]?.uncertain_fields;
      if (Array.isArray(uncertain) && uncertain.length > 0) {
        warnings.push(`ეს ველები AI-მ დაასკვნა, არ ეწერა პირდაპირ: ${uncertain.join(', ')}`);
      }
    }
  } else {
    const { data, warning } = await aiExtract(text, apiKey);
    if (warning) warnings.push(warning);
    if (data) {
      usedAi = true;
      crossWarnings.push(...disagreementWarnings(draft, sources, data));
      mergeAi(draft, sources, data);
      evidence = normalizeEvidence(data.evidence);
      if (Array.isArray(data.uncertain_fields) && data.uncertain_fields.length > 0) {
        warnings.push(
          `ეს ველები AI-მ დაასკვნა, არ ეწერა პირდაპირ: ${data.uncertain_fields.join(', ')}`,
        );
      }
    }
  }

  warnings.push(...crossWarnings, ...buildWarnings(draft));

  const services = [
    { draft, sources, evidence, warnings: [...crossWarnings, ...buildWarnings(draft)] },
    ...extraServices.map((s) => ({ ...s, warnings: buildWarnings(s.draft) })),
  ];

  if (services.length > 1) {
    warnings.unshift(`ფაილში ${services.length} სერვისი ვიპოვე — ყველა ქვემოთ ჩანს.`);
  }

  return json({
    ok: true,
    // `draft` stays the first service so older app builds keep working unchanged.
    draft,
    sources,
    warnings,
    usedAi,
    /** Every service the document asks for. Always at least one. */
    services,
    fileName,
    textPreview: text.replace(/[\u0000\u0001]/g, '').slice(0, 1500),
  });
});
