// deno-lint-ignore-file no-explicit-any
//
// booking-import — turn a tour operator's request into a booking draft.
//
// The request arrives in one of three shapes, and every shape ends in the same
// draft and the same review screen:
//
//   { fileName, contentBase64 }  a PDF / Word / Excel / text file, or a chat
//                                exported from WhatsApp (.txt, or the .zip an
//                                iPhone makes). A PDF is read by the model as
//                                the page itself — tables, columns, stamps —
//                                with its text as the fallback; a scanned PDF
//                                or a picture uploaded as a file is read as an
//                                image.
//   { text }                     a message pasted from WhatsApp, Viber,
//                                Telegram or an email.
//   { images: [{ base64 }] }     up to five photos or screenshots of a chat,
//                                an email or a printed page, in order.
//
// Design rules, in order of importance:
//
//  1. NO BOOKING is ever written here. The function only returns a draft. The
//     company reviews it and the normal booking-creation path runs, so every
//     existing validation, the review gate and the availability check still
//     apply. A bad parse can never create a bad booking. The only two writes
//     this function makes are bookkeeping: one row in `booking_import_log` —
//     what was uploaded and whether it parsed — and the label lesson in rule 4.
//     Both are fire-and-forget: neither changes the answer, neither can fail
//     the request.
//  2. The deterministic template parser runs FIRST and always wins on the
//     fields it recognises. The model is a fallback for free-form documents,
//     not the primary path.
//  3. If the model is unavailable, misconfigured or returns nonsense, the
//     function still succeeds with whatever the template found, plus warnings.
//     The feature degrades, it never breaks.
//  4. The parser LEARNS a company's wording. The model is asked for the
//     document's own heading per field, and any heading the built-in label
//     table does not already know is remembered against that company
//     (`company_import_labels`) and merged into the next parse. A transport
//     company receives the same operators' layouts month after month, so the
//     second file from an operator is usually read for free and exactly.
//     Built-in labels always win a collision, lessons are per company, and a
//     lesson the model marked uncertain is not written down — so no amount of
//     learning can turn a document that parses today into one that does not.
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

/**
 * 11 MB of base64 ≈ 8 MB of file, matching the app's own cap. Base64 is a
 * third larger than the bytes it carries, so this number has to lead the
 * client's — a file the app accepted must not be refused here.
 */
const MAX_BASE64_CHARS = 11 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

/**
 * A chat is read from its END: an exported or long-pasted conversation can run
 * for months, and the request being booked is the latest one. This much of the
 * end is plenty for a whole programme negotiated over a week of messages.
 */
const MAX_CHAT_CHARS = 24_000;

/**
 * A PDF the model reads as the page itself. Past these it is read as its text
 * only — a brochure of fifty pages is not a booking request, and the page
 * pictures of a long one would only make the answer slower and dearer.
 */
const MAX_PDF_DOCUMENT_PAGES = 30;

/** A zip is only ever a chat export here; anything that unpacks past this is not one. */
const MAX_ZIP_ENTRY_BYTES = 20 * 1024 * 1024;

/**
 * How long the model may take. The platform ends a request that has not
 * answered in 150 s, so every call is given what is left of a 140 s budget —
 * never more than AI_TIMEOUT_MS — and a slow read gives up in time for the
 * template's result to still reach the company. A fallback read only starts
 * when there is enough of the budget left for it to finish.
 */
const REQUEST_BUDGET_MS = 140_000;
const AI_TIMEOUT_MS = 100_000;
const MIN_FALLBACK_MS = 25_000;

/**
 * Photos and screenshots. The model takes up to 10 MB of base64 per image and
 * 32 MB per request; these stay well clear of both, and of the function's own
 * memory, while still fitting a long chat spread over several screenshots.
 */
const MAX_IMAGES = 5;
const MAX_IMAGE_BASE64_CHARS = 9_500_000;
const MAX_IMAGES_TOTAL_BASE64_CHARS = 20_000_000;

/** What the import log and the review screen call a pasted message. */
const PASTED_TEXT_NAME = 'ჩასმული ტექსტი';

/** Picture formats a file upload may carry instead of a document. */
const IMAGE_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);

const ANTHROPIC_MODEL = Deno.env.get('BOOKING_IMPORT_MODEL') ?? 'claude-sonnet-4-5';
const ANTHROPIC_VERSION = '2023-06-01';

type FieldSource = 'template' | 'ai' | 'none';

type BookingDraft = {
  kind: 'transfer' | 'tour' | 'day_tour' | null;
  date_display: string | null;
  from_location: string | null;
  to_location: string | null;
  /** What kind of place each end is, as the booking form records it. */
  from_location_type: PlaceType | null;
  to_location_type: PlaceType | null;
  /**
   * A Google Maps link for each end — only one the request itself carries,
   * checked to appear in it character for character. Never built or guessed.
   */
  from_location_link: string | null;
  to_location_link: string | null;
  route: string | null;
  passengers: number | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  flight_number: string | null;
  flight_direction: 'arrival' | 'departure' | null;
  /**
   * A departure flight's own date and time, as an ISO instant. It is context
   * for the pickup and never the pickup itself: a driver sent to the hotel at
   * the time the plane leaves has already missed it.
   */
  flight_at: string | null;
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
    /** The hotel's Google Maps link, when the request carries one. */
    hotel_link: string | null;
  }[] | null;
  /** A tour's arrival transfer (airport -> hotel), part of the same booking. */
  transfer_in: DraftLeg | null;
  /** A tour's departure transfer (hotel -> airport), part of the same booking. */
  transfer_out: DraftLeg | null;
  /** Languages the driver must speak, as the app's language codes. */
  required_languages: string[] | null;
};

/**
 * One transfer leg of a tour. `date_display` is an ISO instant like the
 * booking's own, and `pickup_time` says whether its clock time was actually
 * read — a leg dated without a time is stored at midnight, which is not a time.
 */
type DraftLeg = {
  date_display: string | null;
  pickup_time: string | null;
  from: string | null;
  from_type: PlaceType | null;
  from_link: string | null;
  to: string | null;
  to_type: PlaceType | null;
  to_link: string | null;
  flight: string | null;
  /** A departure leg's flight time (ISO instant) — context for the pickup, never the pickup. */
  flight_at: string | null;
};

/** The booking form's place kinds (lib/bookingLocations.ts LocationType). */
const PLACE_TYPES = ['airport', 'train_station', 'hotel', 'address'] as const;
type PlaceType = (typeof PLACE_TYPES)[number];

/** The app's language codes (lib/spokenLanguages.ts SPOKEN_LANGUAGE_CODES). */
const LANGUAGE_CODES = [
  'ka', 'en', 'ru', 'de', 'fr', 'es', 'it', 'tr', 'ar', 'zh', 'ja', 'ko', 'pt', 'nl', 'pl', 'uk',
  'hy', 'az', 'fa', 'hi', 'sv', 'no', 'da', 'fi', 'cs', 'ro', 'el', 'he', 'th', 'vi', 'id', 'bn', 'ur',
] as const;

const EMPTY_DRAFT: BookingDraft = {
  kind: null,
  date_display: null,
  from_location: null,
  to_location: null,
  from_location_type: null,
  to_location_type: null,
  from_location_link: null,
  to_location_link: null,
  route: null,
  passengers: null,
  vehicle_type: null,
  vehicle_class: null,
  flight_number: null,
  flight_direction: null,
  flight_at: null,
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
  transfer_in: null,
  transfer_out: null,
  required_languages: null,
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

/**
 * The chat text inside a WhatsApp export. An iPhone always zips the export —
 * "_chat.txt", plus the photos when media was included — and the photos are
 * left alone: the request is in the messages.
 */
async function chatTextFromZip(bytes: Uint8Array): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('ZIP_BROKEN');
  }
  const texts = Object.values(zip.files).filter(
    (f) => !f.dir && /\.txt$/i.test(f.name) && !/(^|\/)__MACOSX\//.test(f.name),
  );
  if (texts.length === 0) throw new Error('ZIP_NO_CHAT');

  // The size the entry unpacks to, read before unpacking it: a small archive
  // can hold gigabytes, and this one is not allowed to try.
  const sizeOf = (f: JSZip.JSZipObject) => Number((f as any)._data?.uncompressedSize ?? 0);
  const named =
    texts.find((f) => /(^|\/)_chat\.txt$/i.test(f.name)) ??
    texts.find((f) => /whatsapp/i.test(f.name)) ??
    texts.slice().sort((a, b) => sizeOf(b) - sizeOf(a))[0];
  if (sizeOf(named) > MAX_ZIP_ENTRY_BYTES) throw new Error('ZIP_TOO_BIG');
  return await named.async('string');
}

async function extractText(
  fileName: string,
  bytes: Uint8Array,
  info: { pdfPages?: number } = {},
): Promise<string> {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();

  if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'tsv') {
    return new TextDecoder('utf-8').decode(bytes);
  }

  if (ext === 'zip') return await chatTextFromZip(bytes);

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

  if (ext === 'pdf') return await pdfToText(bytes, info);

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
const SMALL_PRINT = String.fromCharCode(0);
const BLOCK_BREAK = String.fromCharCode(1);

function stripMarks(line: string): string {
  return line.replace(/^[\x00\x01]+/, '');
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
      /** The run currently on the end of the line, and where it starts in it. */
      let base: { start: number; x: number; width: number; len: number } | null = null;

      for (const it of row.items) {
        const inBase = base !== null && base.width > 0 &&
          it.x >= base.x && it.x < base.x + base.width - 0.5;

        /*
         * A glyph painted INSIDE a run already on the line is not the next
         * word. It is a character that run's font could not draw — the slash
         * of a date, the plus of a phone number — which the writer left as a
         * blank advance and painted separately from another font. Sorting by x
         * cannot place it, because it starts after the run that contains it,
         * so it used to land at the end of the line: "27/10/2026" arrived as
         * "27 10 2026/ /" and a company got a date nobody typed.
         *
         * It goes back into its own blank. Only a blank is ever overwritten,
         * so a line that already reads correctly cannot be disturbed — which
         * is what matters here, since most documents never hit this path.
         */
        if (inBase && it.str.trim() && it.str.trim().length <= 3) {
          const b = base as { start: number; x: number; width: number; len: number };
          const rel = (it.x - b.x) / b.width;
          const at = b.start + Math.min(b.len - 1, Math.max(0, Math.round(rel * b.len)));
          if (line[at] === ' ') {
            line = line.slice(0, at) + it.str.trim() + line.slice(at + 1);
            continue;
          }
        }
        // The blank such a glyph was painted over: already represented.
        if (inBase && !it.str.trim()) continue;

        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          if (gap > COLUMN_GAP || atColumnStart(it.x)) line += '\t';
          else if (gap > 1.2) line += ' ';
        }
        if (firstX === null && it.str.trim()) firstX = it.x;
        if (it.str.trim()) maxFont = Math.max(maxFont, it.fontSize || 0);
        if (it.str.trim()) {
          base = { start: line.length, x: it.x, width: it.width || 0, len: it.str.length };
        }
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

async function pdfToText(bytes: Uint8Array, info: { pdfPages?: number } = {}): Promise<string> {
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

  info.pdfPages = pages.length;
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

type LabelField = keyof BookingDraft | 'time' | 'vehicle';

/**
 * The label vocabulary one parse runs against.
 *
 * It used to be the module constants below and nothing else. It is a parameter
 * now because a company's remembered labels (`company_import_labels`) are
 * merged in per request, and this function can serve two companies at once in
 * the same isolate — one global overlay would leak one operator's wording into
 * another's document.
 */
type LabelBook = {
  map: Record<string, LabelField>;
  /** Longest first, so "pickup date" beats "date" and "to". */
  keys: string[];
};

const LABEL_KEYS = Object.keys(LABELS).sort((a, b) => b.length - a.length);

const BUILTIN_LABELS: LabelBook = { map: LABELS, keys: LABEL_KEYS };

/**
 * Built-ins plus what this company's files have taught us.
 *
 * Built-ins win every collision. A learned row may add a wording this table has
 * never seen; it may never redefine one it has, so no amount of learning can
 * break a document that already parsed correctly.
 */
function labelBookWith(learned: Record<string, LabelField> | null | undefined): LabelBook {
  const extra = Object.entries(learned ?? {}).filter(
    ([label, field]) =>
      label.length >= 3 &&
      label.length <= 60 &&
      !Object.prototype.hasOwnProperty.call(LABELS, label) &&
      typeof field === 'string',
  );
  if (extra.length === 0) return BUILTIN_LABELS;

  const map: Record<string, LabelField> = { ...LABELS };
  for (const [label, field] of extra) map[label] = field;
  return { map, keys: Object.keys(map).sort((a, b) => b.length - a.length) };
}

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
function startsWithLabel(normalized: string, book: LabelBook = BUILTIN_LABELS): boolean {
  for (const key of book.keys) {
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
function resolveLabel(
  normalized: string,
  book: LabelBook = BUILTIN_LABELS,
): LabelField | null {
  const direct = book.map[normalized];
  if (direct) return direct;
  // A label cell often carries a hint under the label ("Vehicle / sedan,
  // minivan, microbus, bus"), so the allowance has to cover that.
  if (normalized.length > 160) return null;

  for (const key of book.keys) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(key)}([^\\p{L}\\p{N}]|$)`, 'u');
    if (re.test(normalized)) return book.map[key];
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

/** A cell that is nothing but a known label — "DROP OFF", "PHONE", "TIME". */
function isBareLabel(cell: string, book: LabelBook = BUILTIN_LABELS): boolean {
  const n = normalizeLabel(cell);
  if (!n) return false;
  return Object.prototype.hasOwnProperty.call(book.map, n);
}

/**
 * A printed form usually prints two fields side by side, so the page comes
 * back as a row of LABELS with a row of VALUES under it:
 *
 *   PICK UP <TAB> DROP OFF
 *   Hotel Moxy <TAB> Kutaisi Airport
 *
 * Read one line at a time that first row looks like a single label/value pair
 * and hands "DROP OFF" to the pick-up field. That is worse than reading
 * nothing: the template is authoritative, so a wrong value also locks the
 * model out of the field it could have filled. Pairing the two rows by column
 * is what the form actually means.
 */
function headerRowCells(line: string, book: LabelBook = BUILTIN_LABELS): string[] | null {
  if (line.indexOf('\t') < 0) return null;
  const cells = line.split('\t').map((c) => c.trim());
  if (cells.length < 2 || cells.some((c) => !c)) return null;
  if (!cells.every((c) => isBareLabel(c, book))) return null;
  return cells;
}

/**
 * `prose` is for a pasted message rather than a file. A form prints a label
 * alone and its answer under it; a message writes "Pickup: Rooms Hotel" on one
 * line, and a line that merely CONTAINS a label word is a sentence. Read as a
 * form, "26 October Departure Transfer" became a pickup label and the line
 * under it — "sedan, English-speaking driver" — the pickup place, and the
 * template always wins. So in prose a label needs its colon (or tab), the
 * answer goes on the same line or straight under a label that ends in one,
 * and the whole-text guesses (arrival/departure, meet & greet) are left to the
 * model, which reads them in context.
 */
function parseTemplate(
  text: string,
  book: LabelBook = BUILTIN_LABELS,
  opts: { prose?: boolean } = {},
): {
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

  /** Store one read value under the field its label named. */
  const apply = (field: keyof BookingDraft | 'time' | 'vehicle', value: string) => {
    switch (field) {
      case 'kind': {
        const k = matchKind(value);
        if (k) { draft.kind = k; sources.kind = 'template'; }
        break;
      }
      case 'date_display':
        if (!rawDate) rawDate = value;
        break;
      case 'time':
        if (!rawTime) rawTime = value;
        break;
      case 'vehicle': {
        const t = matchVehicleType(value);
        if (t && !draft.vehicle_type) { draft.vehicle_type = t; sources.vehicle_type = 'template'; }
        const c = matchVehicleClass(value);
        if (c && !draft.vehicle_class) { draft.vehicle_class = c; sources.vehicle_class = 'template'; }
        break;
      }
      case 'vehicle_class': {
        const c = matchVehicleClass(value);
        if (c && !draft.vehicle_class) { draft.vehicle_class = c; sources.vehicle_class = 'template'; }
        break;
      }
      case 'passengers': {
        const n = parseNumber(value);
        if (n !== null && n > 0 && draft.passengers == null) {
          draft.passengers = Math.round(n);
          sources.passengers = 'template';
        }
        break;
      }
      case 'client_price': {
        const n = parseNumber(value);
        if (n !== null && draft.client_price == null) {
          draft.client_price = n;
          sources.client_price = 'template';
        }
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
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = stripMarks(lines[i]);

    // A row of labels with a row of answers under it — pair them by column.
    const header = headerRowCells(line, book);
    if (header) {
      // The blank form's own hint ("dd.mm.yyyy — for example 15.05.2026")
      // can sit between the labels and the answers.
      let j = i + 1;
      if (lines[j] && looksLikeHint(lines[j])) j += 1;
      const valueLine = lines[j] ? stripMarks(lines[j]) : '';
      const values = valueLine ? valueLine.split('\t').map((c) => c.trim()) : [];
      if (values.length === header.length && values.some((v) => v)) {
        for (let k = 0; k < header.length; k += 1) {
          const f = resolveLabel(normalizeLabel(header[k]), book);
          if (f && values[k] && !isBareLabel(values[k], book)) apply(f, values[k]);
        }
        i = j;
        continue;
      }
      // Nothing to pair with: let the ordinary label-then-value-below logic try.
    }

    const pair = splitLabelValue(line);

    let label: string;
    let value: string;

    if (pair) {
      // In a message a label is a few words, not the first half of a sentence.
      if (opts.prose && normalizeLabel(pair[0]).length > 40) continue;
      label = normalizeLabel(pair[0]);
      value = pair[1].replace(/\t/g, ' ').trim();
      // "GUEST NAME <TAB> PHONE" is two labels, not a guest called "PHONE".
      // Clearing it here lets the value-on-the-next-line path, and failing
      // that the model, fill the field instead of inheriting the mistake.
      if (isBareLabel(value, book)) value = '';
    } else {
      // A message line with no separator is a sentence, never a label.
      if (opts.prose) continue;
      // No separator on this line. It may still be a label whose value was
      // printed on the line below (the usual shape of a PDF form). Only a
      // short line qualifies: resolveLabel matches a known word anywhere in
      // the text, so allowing a full sentence here would let ordinary prose
      // ("please note the driver waits 60 minutes") swallow the line after it.
      if (line.length > 40) continue;
      label = normalizeLabel(line);
      value = '';
    }

    const field = resolveLabel(label, book);
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
      if (nextPair && resolveLabel(normalizeLabel(nextPair[0]), book)) continue;
      if (!nextPair && startsWithLabel(normalizeLabel(next), book)) continue;
      value = next.replace(/\t/g, ' ').trim();
      if (!value) continue;
      i += 1;
    }

    apply(field, value);
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

  if (opts.prose) return { draft, sources };

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
      time: {
        type: ['string', 'null'],
        description:
          'Pickup time as HH:MM, 24h: when the driver collects the group. For an arrival that is the landing time. For a departure it is never the flight time.',
      },
      from_location: { type: ['string', 'null'] },
      from_location_type: { type: ['string', 'null'], enum: [...PLACE_TYPES, null] },
      from_location_link: {
        type: ['string', 'null'],
        description: 'A Google Maps link for from_location, copied exactly, only if the request contains one.',
      },
      to_location: { type: ['string', 'null'] },
      to_location_type: { type: ['string', 'null'], enum: [...PLACE_TYPES, null] },
      to_location_link: {
        type: ['string', 'null'],
        description: 'A Google Maps link for to_location, copied exactly, only if the request contains one.',
      },
      route: {
        type: ['string', 'null'],
        description: 'Free-text route if given as one line; for a day_tour, the places visited, as written.',
      },
      passengers: { type: ['integer', 'null'] },
      vehicle_type: { type: ['string', 'null'], enum: ['sedan', 'minivan', 'microbus', 'bus', 'suv', null] },
      vehicle_class: { type: ['string', 'null'], enum: ['economy', 'comfort', 'vip', null] },
      flight_number: { type: ['string', 'null'] },
      flight_direction: { type: ['string', 'null'], enum: ['arrival', 'departure', null] },
      flight_time: {
        type: ['string', 'null'],
        description:
          "For a departure: the flight's own departure time as HH:MM, when the request gives it. Not the pickup time.",
      },
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
        description:
          'For kind "tour": one entry per sightseeing day, in order. The arrival and departure transfers do not go here — they go in transfer_in and transfer_out.',
        items: {
          type: 'object',
          properties: {
            day: { type: 'integer' },
            date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            fromPlace: { type: ['string', 'null'], description: 'Where the day starts, e.g. the city the group slept in.' },
            toPlace: { type: ['string', 'null'], description: 'Where the day ends, e.g. the city the group sleeps in that night.' },
            stops: {
              type: ['string', 'null'],
              description: 'The places visited that day, as written ("Sighnaghi - Bodbe", "Tbilisi City tour").',
            },
            hotel: { type: ['string', 'null'], description: 'Where the group sleeps that night.' },
            hotel_link: {
              type: ['string', 'null'],
              description: "A Google Maps link for that night's hotel, copied exactly, only if the request contains one.",
            },
          },
          required: ['day'],
        },
      },
      transfer_in: {
        type: ['object', 'null'],
        description:
          'For kind "tour" only: the arrival transfer that opens the tour (airport, station or border -> hotel). Null when the request has none.',
        properties: {
          date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
          time: { type: ['string', 'null'], description: 'HH:MM, 24h — the landing time: the driver waits at arrivals' },
          from: { type: ['string', 'null'], description: 'Where the group is collected: the airport, station or border' },
          from_type: { type: ['string', 'null'], enum: [...PLACE_TYPES, null] },
          from_link: { type: ['string', 'null'], description: 'A Google Maps link for from, copied exactly, if the request has one' },
          to: { type: ['string', 'null'], description: 'Where they are taken, usually the hotel' },
          to_type: { type: ['string', 'null'], enum: [...PLACE_TYPES, null] },
          to_link: { type: ['string', 'null'], description: 'A Google Maps link for to, copied exactly, if the request has one' },
          flight: { type: ['string', 'null'] },
        },
      },
      transfer_out: {
        type: ['object', 'null'],
        description:
          'For kind "tour" only: the departure transfer that closes the tour (hotel -> airport, station or border). Null when the request has none.',
        properties: {
          date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
          time: {
            type: ['string', 'null'],
            description: 'HH:MM, 24h — the pickup time at the hotel. Null when the request gives only the flight time.',
          },
          flight_time: {
            type: ['string', 'null'],
            description: "HH:MM, 24h — the flight's own departure time, when the request gives it.",
          },
          from: { type: ['string', 'null'], description: 'Where the group is collected, usually the hotel' },
          from_type: { type: ['string', 'null'], enum: [...PLACE_TYPES, null] },
          from_link: { type: ['string', 'null'], description: 'A Google Maps link for from, copied exactly, if the request has one' },
          to: { type: ['string', 'null'], description: 'The airport, station or border' },
          to_type: { type: ['string', 'null'], enum: [...PLACE_TYPES, null] },
          to_link: { type: ['string', 'null'], description: 'A Google Maps link for to, copied exactly, if the request has one' },
          flight: { type: ['string', 'null'] },
        },
      },
      required_languages: {
        type: ['array', 'null'],
        items: { type: 'string', enum: LANGUAGE_CODES },
        description:
          'Languages the driver must speak, when the request asks for it: "English-speaking driver" -> ["en"], "русскоговорящий водитель" -> ["ru"].',
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
      field_labels: {
        type: ['object', 'null'],
        description:
          "For each field you filled, the document's own HEADING for it — the printed label beside or above the value (\"Pick-up point\", \"მგზავრების რაოდენობა\", \"Nereden\"), copied as printed. The label, never the value. Leave a field out when the document prints no label for it, for example when the value sits in running prose.",
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

The requests arrive in whatever language the operator works in — most often Georgian, English or Russian, sometimes Turkish, Armenian or a European language — and follow no fixed format: a table, a paragraph, an email, a PDF order form, a day-by-day itinerary, or a chat. Text taken from a PDF may have lost some of its layout; read it for meaning rather than position.

Many requests are chat messages, copied or screenshotted from WhatsApp, Viber, Telegram or Messenger, or emails. In those:
- A timestamp and a name in front of a message — "[25/10/2026, 14:03] Nino:" or "25.10.26, 14:03 - Nino:" — say when that message was SENT and who sent it. They are never the service date, the pickup time or the passenger. The sender is usually the tour operator, not the traveller.
- On a screenshot, ignore the phone itself: the clock and battery at the top, the chat's contact name and phone number, the times and ticks under each message, "typing…", buttons and the keyboard. The number at the top of a chat belongs to whoever is writing, not to the passenger.
- Later messages win. When the chat changes the date, time, passengers, vehicle or route ("sorry, 5 people, not 4"), use the latest value and name that field in uncertain_fields so the dispatcher looks at it.
- Replies from the transport company itself — questions, prices it quoted, "ok", "confirmed" — are context, not part of the request.
- A long chat can hold several requests over weeks. Book the one the latest messages are about. A service earlier in the conversation that has already taken place — dated before today — is history, not part of this request.

Rules:
- Only report what the request actually says. If a field is not stated, return null. Never guess a price or a phone number, and never invent a date.
- Dates are DAY FIRST (15/05/2026 is 15 May 2026), unless the format is clearly YYYY-MM-DD.
- Today's date in Tbilisi comes with the request. A date written without a year is in the year that puts it nearest to today: a programme that began a few days ago is this year, and "5 January" written in late December is next year. All the dates of one programme belong to one run of days. A relative date — tomorrow, the day after tomorrow, on Saturday; ხვალ, ზეგ, შაბათს; завтра, послезавтра, в субботу — counts from the day the message was sent when the chat shows it, otherwise from today. Whenever you worked a date out instead of reading it in full, name date in uncertain_fields.
- Times are local Tbilisi time, 24-hour. "At 10", "10-ზე" or "в 10" is 10:00; "7 in the evening" or "საღამოს 7-ზე" is 19:00.
- time is the PICKUP: when the driver collects the group. On an arrival that is the landing time — the driver waits at arrivals. On a departure the pickup comes hours before the flight, so the flight's own time goes in flight_time and never in time; when a departure gives only the flight's time, leave time null and the dispatcher sets the pickup. The same holds for transfer_in and transfer_out.
- Give each place its type: airport; train_station; hotel for a hotel, guesthouse or apartment the group stays in; address for anything else — a street, a restaurant, a city, a border crossing.
- A Google Maps link (maps.app.goo.gl, goo.gl/maps, google.com/maps) given for a place goes in that place's link field, copied character for character. Never build, shorten or guess a link.
- Anything else the driver needs to know — child seats, a lot of luggage, an extra stop, waiting time — goes in comment.
- A PDF whose document mixed fonts can lose punctuation altogether: "0900" is 09:00, and a phone number can arrive without its "+" or glued to the name printed before it. Read the digits for what they plainly are, copy the evidence exactly as it appeared, and name such a field in uncertain_fields so the dispatcher checks it.
- "ტრანსფერი"/transfer = transfer. A single day of sightseeing = day_tour: from_location is where the day starts (the hotel or the city), to_location where it ends, route the places visited as written. Sightseeing on several days = tour: one entry per sightseeing day in tour_days, the arrival transfer that opens it in transfer_in and the departure transfer that closes it in transfer_out — never as tour days. The date of a tour is its first sightseeing day.
- A driver who must speak a language ("English-speaking driver", "ინგლისურენოვანი მძღოლი", "русскоговорящий водитель") goes in required_languages, not in comment.
- Vehicle words: სედანი/sedan, მინივენი/Vito/Viano = minivan, მიკროავტობუსი/Sprinter = microbus, ავტობუსი = bus.
- List in uncertain_fields any field you inferred rather than read.
- Fill evidence with the exact wording you read each field from, copied from the request. A dispatcher checks your reading against it, so copy, never paraphrase.
- Fill field_labels with the document's own printed heading for each field — the label, not the value. This operator will send files in this same layout again, and their wording is remembered so the next one is read without a model. Leave out any field the document does not label.
- Call the submit_booking tool exactly once.`;

/**
 * A tour operator's request is often a whole programme: an arrival, three days
 * of sightseeing, a departure. The transport company books that the way the
 * app's own form does — ONE tour booking, its days in `tour_days`, the arrival
 * and departure as its `transfer_in` / `transfer_out` — because one driver and
 * one car do the whole programme. Read as five separate bookings it became five
 * jobs, each with a date and no time, no passengers and nothing tying them
 * together, and the company had to undo it by hand.
 *
 * Genuinely separate services still exist — a different car asked for one part,
 * parts weeks apart, a lone transfer — and the model is told exactly when.
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

This request may contain MORE THAN ONE service. Return every one of them, in the order they appear.

This is how the transport company books a programme — follow it exactly:
- Sightseeing on consecutive days is ONE service of kind "tour", whether the group returns to the same city every evening or moves on each day. Each sightseeing day is one entry in tour_days, with its own date and that day's places in stops. A free day inside the programme does not split it.
- The arrival transfer that opens such a tour and the departure transfer that closes it belong to that SAME service: they go in its transfer_in and transfer_out — never as separate services, and never as tour days. "Day 1 arrival, days 2-4 sightseeing, day 5 departure" is one tour with three tour days, a transfer_in and a transfer_out.
- One vehicle and one driver do the whole programme unless the request asks otherwise, so a vehicle or a driver's language stated once applies to all of it.
- Make separate services only when the request asks for a different vehicle or driver for a part, when parts are more than two days apart, or for a transfer or a single sightseeing day that stands on its own.
- If the request really describes only one job, return exactly one service. One is a normal answer.

Fill each service completely from the request: its own date, time, route, vehicle, passengers, price and hotel. Details stated once for the whole programme — the vehicle, the driver's language, the passengers, the passenger's name and phone, the hotel — belong on every service they apply to.

Call the submit_program tool exactly once.`;

/** Dates and service words, as a cheap signal that the file may hold a programme. */
function looksLikeMultiService(text: string): boolean {
  const body = text.replace(/[\x00\x01]/g, '');

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

/**
 * The line a chat app puts in front of every message when several are copied
 * or exported together — when it was sent, and by whom.
 */
const CHAT_HEADER_PATTERNS = [
  // WhatsApp on an iPhone: "[25/10/2026, 14:03:12] Nino: …"
  /^\[\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp]\.?\s?[Mm]\.?)?\]\s*[^:\n]{1,80}:/,
  // WhatsApp on Android: "25/10/2026, 14:03 - Nino: …"
  /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}:\d{2}(?:\s?[AaPp]\.?\s?[Mm]\.?)?\s+[-–]\s+[^:\n]{1,80}:/,
  // Telegram on a computer: "Nino, [25.10.2026 14:03]"
  /^[^[\]\n]{1,80},\s*\[\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]$/,
];

/**
 * A pasted conversation rather than one message or an email.
 *
 * It changes how the text is read. The template parser takes the first value
 * it finds under a label, which is right for a form and wrong for a chat, where
 * "5 people, not 4" two messages later is the answer. A chat therefore goes to
 * the model alone, which is told that later messages win and that the stamp in
 * front of each message is not the service date.
 */
function looksLikeChat(text: string): boolean {
  let headers = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (CHAT_HEADER_PATTERNS.some((re) => re.test(line))) {
      headers += 1;
      if (headers >= 2) return true;
    }
  }
  return false;
}

/**
 * The end of a long conversation: the latest messages, starting cleanly at the
 * first message header inside the kept part, so the model never reads half a
 * message out of context. `trimmed` tells the caller to say so.
 */
function trimChat(text: string, max = MAX_CHAT_CHARS): { text: string; trimmed: boolean } {
  if (text.length <= max) return { text, trimmed: false };
  const tail = text.slice(text.length - max);
  const lines = tail.split('\n');
  // The first line is almost always cut through; start at a real message.
  let start = 1;
  for (let i = 1; i < Math.min(lines.length, 400); i += 1) {
    if (CHAT_HEADER_PATTERNS.some((re) => re.test(lines[i].trim()))) {
      start = i;
      break;
    }
  }
  return {
    text: `[… earlier messages of this conversation are left out …]\n${lines.slice(start).join('\n')}`,
    trimmed: true,
  };
}

/**
 * Pasted text as the model and the parser should see it: no direction marks
 * (WhatsApp sprinkles them through copied messages), one kind of line break,
 * and never the parser's own internal marks.
 */
function cleanPastedText(raw: string): string {
  return raw
    .replace(/[\x00\x01]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cf}/gu, '')
    .trim();
}

type AiBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

/** What the model is asked to read: extracted text, or pictures of the request. */
type AiInput = string | AiBlock[];

/**
 * Today's date in Tbilisi (UTC+4 all year), for "tomorrow", "on Saturday" and
 * dates written without a year — the way requests are usually written in a chat.
 */
function tbilisiToday(): string {
  const now = new Date(Date.now() + 4 * 3600 * 1000);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${now.toISOString().slice(0, 10)}, ${days[now.getUTCDay()]}`;
}

/**
 * What a PDF handed to the model is: a scan, which is only a picture, or a
 * PDF with its own text, where the page is read for its layout as well.
 */
type DocumentKind = 'scan' | 'pdf';

function aiUserContent(input: AiInput, documentKind: DocumentKind = 'scan'): string | AiBlock[] {
  const today = `Today in Tbilisi: ${tbilisiToday()}.`;
  if (typeof input === 'string') {
    // The hint marks are an internal signal for the template parser; the
    // model sees the document as printed.
    return `${today}\n\n<document>\n${input.replace(/[\x00\x01]/g, '').slice(0, MAX_TEXT_CHARS)}\n</document>`;
  }
  const images = input.filter((b) => b.type === 'image').length;
  const what = input.some((b) => b.type === 'document')
    ? documentKind === 'pdf'
      ? 'The PDF above is a transport request — an order form, an itinerary or an email saved as a PDF. Read it as it is laid out on the page: a table row by row, columns side by side, each heading with what is printed under it.'
      : 'The PDF above is a scanned or photographed transport request.'
    : images > 1
      ? `The ${images} images above are one transport request — screenshots or photos of a chat, an email or a printed page. They are consecutive parts of the same conversation or document, in the order given.`
      : 'The image above is a transport request — a screenshot or photo of a chat, an email or a printed page.';
  return [...input, { type: 'text', text: `${today}\n\n${what} Read the request from it.` }];
}

/** Why a model call gave nothing: too slow, refused, no usable answer, or it never got there. */
type AiFailure = 'timeout' | 'rejected' | 'empty' | 'error';

type AiCallOptions = { timeoutMs?: number; documentKind?: DocumentKind };

/**
 * One call to the model, never longer than its deadline. A request the
 * platform ends at 150 s loses the template's answer along with the model's,
 * so a slow read is cut off and the company gets what was already read.
 */
async function callModel(
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ json: any | null; warning: string | null; failure: AiFailure | null }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        json: null,
        warning: `AI წაკითხვა ვერ მოხერხდა (${res.status}). შაბლონით წაკითხული ველები დარჩა. ${text.slice(0, 200)}`,
        failure: 'rejected',
      };
    }
    return { json: await res.json(), warning: null, failure: null };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return {
        json: null,
        warning: 'AI წაკითხვამ ძალიან დიდხანს გასტანა — შაბლონით წაკითხული ველები დარჩა.',
        failure: 'timeout',
      };
    }
    return { json: null, warning: `AI წაკითხვა ვერ მოხერხდა: ${String(e).slice(0, 200)}`, failure: 'error' };
  }
}

async function aiExtractProgram(
  input: AiInput,
  apiKey: string,
  opts: AiCallOptions = {},
): Promise<{ services: any[]; warning: string | null; failure: AiFailure | null }> {
  const { json, warning, failure } = await callModel(
    apiKey,
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: PROGRAM_PROMPT,
      tools: [PROGRAM_TOOL],
      tool_choice: { type: 'tool', name: 'submit_program' },
      messages: [{ role: 'user', content: aiUserContent(input, opts.documentKind) }],
    },
    opts.timeoutMs ?? AI_TIMEOUT_MS,
  );
  if (!json) return { services: [], warning, failure };

  const block = (json.content ?? []).find((c: any) => c.type === 'tool_use');
  const services = block?.input?.services;
  if (!Array.isArray(services) || services.length === 0) {
    return { services: [], warning: 'AI-მ სტრუქტურირებული პასუხი არ დააბრუნა.', failure: 'empty' };
  }
  // A document that produced dozens of "services" was misread, not rich.
  return { services: services.slice(0, 25), warning: null, failure: null };
}

async function aiExtract(
  input: AiInput,
  apiKey: string,
  opts: AiCallOptions = {},
): Promise<{ data: any | null; warning: string | null; failure: AiFailure | null }> {
  const { json, warning, failure } = await callModel(
    apiKey,
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_booking' },
      messages: [{ role: 'user', content: aiUserContent(input, opts.documentKind) }],
    },
    opts.timeoutMs ?? AI_TIMEOUT_MS,
  );
  if (!json) return { data: null, warning, failure };

  const block = (json.content ?? []).find((c: any) => c.type === 'tool_use');
  if (!block?.input) {
    return { data: null, warning: 'AI-მ სტრუქტურირებული პასუხი არ დააბრუნა.', failure: 'empty' };
  }
  return { data: block.input, warning: null, failure: null };
}

/** What the model's answer is checked against: the text it read, when it read text. */
type MergeContext = { sourceText: string | null };

const NO_SOURCE: MergeContext = { sourceText: null };

const PLACE_TYPE_SET = new Set<string>(PLACE_TYPES);

function placeType(v: unknown): PlaceType | null {
  return typeof v === 'string' && PLACE_TYPE_SET.has(v) ? (v as PlaceType) : null;
}

/**
 * A place's kind from its own name, for when the model named none. Only the
 * unmistakable words count: a wrong guess puts an airport where a hotel is.
 */
function inferPlaceType(name: string | null | undefined): PlaceType | null {
  const raw = String(name ?? '');
  const s = raw.toLowerCase();
  if (!s.trim()) return null;
  // A bus station is a street address to a driver, not a railway station.
  if (/bus station|ავტოსადგურ|автовокзал|автостанц|otogar/.test(s)) return 'address';
  if (
    /airport|აეროპორტ|аэропорт|havaliman|օդանավակայան|flughafen|aeropuerto|aeroporto|a[ée]roport/.test(s) ||
    /\b(TBS|KUT)\b/.test(raw)
  ) {
    return 'airport';
  }
  if (/railway|train station|სადგურ|вокзал|железнодорож|bahnhof/.test(s)) return 'train_station';
  if (/hotel|სასტუმრო|отель|гостиниц|\botel\b|hostel|guest ?house|resort|apartment|აპარტამენტ|апартамент/.test(s)) {
    return 'hotel';
  }
  return null;
}

/** True for a link that opens Google Maps itself — lib/googleMapsLink.ts isGoogleMapsUrl. */
function isGoogleMapsUrl(url: string): boolean {
  const m = /^https:\/\/([^/?#]+)([^?#]*)/i.exec(url);
  if (!m) return false;
  const host = m[1].toLowerCase();
  const path = m[2] || '/';
  if (host.includes('@') || host.includes(':')) return false;
  if (host === 'maps.app.goo.gl') return path.length > 1;
  if (host === 'goo.gl') return /^\/maps\/./i.test(path);
  if (/^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return true;
  if (/^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return /^\/maps(\/|$)/i.test(path);
  return false;
}

/**
 * A Google Maps link the model reported — kept only when it really opens
 * Google Maps AND appears in the request exactly as reported. A link cannot be
 * read off a picture reliably, where one wrong letter is another place, so
 * with no text to check it against none is kept.
 */
function verifiedMapsLink(raw: unknown, sourceText: string | null): string | null {
  if (typeof raw !== 'string' || !sourceText) return null;
  const link = raw.trim().replace(/[).,;:!?\]}'"»]+$/u, '');
  if (!link || link.length > 2048) return null;
  const withoutScheme = link.replace(/^https?:\/\//i, '');
  if (!sourceText.includes(link) && !sourceText.includes(withoutScheme)) return null;
  const url = `https://${withoutScheme}`;
  return isGoogleMapsUrl(url) ? url : null;
}

/** "9:05", "09.05", "0905" → "09:05". Anything else is not a time. */
function hhmm(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^\s*(\d{1,2})[:.]?(\d{2})\s*$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** The Tbilisi calendar date of an instant, YYYY-MM-DD. */
function tbilisiDate(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  return new Date(t + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

/** The Tbilisi wall-clock time of an instant, HH:MM. */
function tbilisiClock(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  return new Date(t + 4 * 3600 * 1000).toISOString().slice(11, 16);
}

/**
 * When a departure's plane leaves. A flight always leaves after its pickup, so
 * one that reads earlier than a known pickup on the same date is the next day's:
 * a 22:30 pickup for a 01:30 flight.
 */
function flightInstant(
  date: string | null,
  flightTime: string | null,
  pickupIso: string | null,
  pickupKnown: boolean,
): string | null {
  if (!date || !flightTime) return null;
  const at = parseDateTime(date, flightTime);
  if (!at) return null;
  if (pickupKnown && pickupIso && Date.parse(at) <= Date.parse(pickupIso)) {
    return new Date(Date.parse(at) + 86_400_000).toISOString();
  }
  return at;
}

function mergeAi(
  draft: BookingDraft,
  sources: Partial<Record<keyof BookingDraft, FieldSource>>,
  ai: any,
  ctx: MergeContext = NO_SOURCE,
): void {
  const setIfEmpty = (key: keyof BookingDraft, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    if (draft[key] != null) return; // the template already read this one
    (draft as any)[key] = value;
    sources[key] = 'ai';
  };

  // A "Service: transfer" heading over a whole programme names its first part,
  // not the job. Several sightseeing days, each with its own date, are a tour —
  // and booked as a transfer the days would silently vanish.
  const aiDayCount = Array.isArray(ai.tour_days) ? ai.tour_days.length : 0;
  if (sources.kind === 'template' && draft.kind !== 'tour' && ai.kind === 'tour' && aiDayCount >= 2) {
    draft.kind = 'tour';
    sources.kind = 'ai';
  }

  setIfEmpty('kind', ai.kind ?? null);
  setIfEmpty('from_location', ai.from_location ?? null);
  setIfEmpty('to_location', ai.to_location ?? null);
  setIfEmpty('from_location_type', placeType(ai.from_location_type));
  setIfEmpty('to_location_type', placeType(ai.to_location_type));
  setIfEmpty('from_location_link', verifiedMapsLink(ai.from_location_link, ctx.sourceText));
  setIfEmpty('to_location_link', verifiedMapsLink(ai.to_location_link, ctx.sourceText));
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

  // The kind of each end, from its name where the model gave none.
  if (draft.from_location && !draft.from_location_type) {
    draft.from_location_type = inferPlaceType(draft.from_location);
  }
  if (draft.to_location && !draft.to_location_type) {
    draft.to_location_type = inferPlaceType(draft.to_location);
  }

  const isTransfer = draft.kind === 'transfer' || draft.kind == null;
  const fromTerminal = draft.from_location_type === 'airport' || draft.from_location_type === 'train_station';
  const toTerminal = draft.to_location_type === 'airport' || draft.to_location_type === 'train_station';
  // The form books every transfer as an arrival or a departure; an airport at
  // one end says which, when the request did not.
  if (isTransfer && !draft.flight_direction && fromTerminal !== toTerminal) {
    draft.flight_direction = fromTerminal ? 'arrival' : 'departure';
    sources.flight_direction = 'ai';
  }

  let aiTime = hhmm(ai.time);
  let aiFlightTime = isTransfer ? hhmm(ai.flight_time) : null;
  // The driver meets an arrival at the gate: its landing time IS the pickup.
  if (draft.flight_direction === 'arrival') {
    if (!aiTime && aiFlightTime) aiTime = aiFlightTime;
    aiFlightTime = null;
  }

  setIfEmpty('pickup_time', aiTime);

  if (draft.date_display == null && typeof ai.date === 'string') {
    const iso = parseDateTime(ai.date, aiTime ?? draft.pickup_time ?? null);
    if (iso) {
      draft.date_display = iso;
      sources.date_display = 'ai';
    }
  }

  // A departure's flight time is context for the pickup, never the pickup:
  // a driver at the hotel when the plane leaves has missed it. Whatever put
  // the flight's own clock on the booking — the model, or a form's
  // "Departure time" heading — the pickup is then simply not known yet.
  if (aiFlightTime) {
    const bookingClock =
      draft.date_display && !isTbilisiMidnight(draft.date_display) ? tbilisiClock(draft.date_display) : null;
    if ((bookingClock ?? draft.pickup_time) === aiFlightTime) {
      const day = tbilisiDate(draft.date_display);
      draft.date_display = day ? parseDateTime(day, null) : draft.date_display;
      draft.pickup_time = null;
      delete sources.pickup_time;
    }
    const pickupKnown = !!draft.date_display && (!isTbilisiMidnight(draft.date_display) || !!draft.pickup_time);
    const baseDate = typeof ai.date === 'string' ? ai.date : tbilisiDate(draft.date_display);
    draft.flight_at = flightInstant(baseDate, aiFlightTime, draft.date_display, pickupKnown);
    if (draft.flight_at) sources.flight_at = 'ai';
  }

  if (draft.tour_days == null && Array.isArray(ai.tour_days) && ai.tour_days.length > 0) {
    draft.tour_days = normalizeAiTourDays(ai.tour_days, ctx);
    sources.tour_days = 'ai';
  }

  // A tour starts on its first day when the model gave no separate date.
  const firstDay = draft.tour_days?.[0];
  if (draft.date_display == null && draft.kind === 'tour' && firstDay?.date) {
    const iso = parseDateTime(firstDay.date, aiTime);
    if (iso) {
      draft.date_display = iso;
      sources.date_display = 'ai';
    }
  }

  // Days the request listed but did not date follow the start, one a day.
  if (draft.kind === 'tour' && draft.tour_days && draft.date_display) {
    const startMs = Date.parse(draft.date_display);
    if (Number.isFinite(startMs)) {
      const start = new Date(startMs + 4 * 3600 * 1000); // Tbilisi wall clock
      draft.tour_days = draft.tour_days.map((d, i) => {
        if (d.date) return d;
        const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
        return { ...d, date: day.toISOString().slice(0, 10) };
      });
    }
  }

  // Arrival and departure belong to a tour; on any other kind they would be
  // a second, invisible job inside the first.
  if (draft.kind === 'tour') {
    if (draft.transfer_in == null) {
      const leg = normalizeAiLeg(ai.transfer_in, 'in', ctx);
      if (leg) {
        draft.transfer_in = leg;
        sources.transfer_in = 'ai';
      }
    }
    if (draft.transfer_out == null) {
      const leg = normalizeAiLeg(ai.transfer_out, 'out', ctx);
      if (leg) {
        draft.transfer_out = leg;
        sources.transfer_out = 'ai';
      }
    }
    fillLegHotels(draft);

    // A flight read once for the whole programme and again on its leg is one
    // flight, shown where it belongs: on the arrival or the departure.
    const norm = (f: string | null | undefined) => String(f ?? '').replace(/\s+/g, '').toUpperCase();
    const own = norm(draft.flight_number);
    if (own && (norm(draft.transfer_in?.flight) === own || norm(draft.transfer_out?.flight) === own)) {
      draft.flight_number = null;
      delete sources.flight_number;
    }
  }

  if (draft.required_languages == null) {
    const langs = normalizeLanguages(ai.required_languages);
    if (langs) {
      draft.required_languages = langs;
      sources.required_languages = 'ai';
    }
  }
}

/**
 * The hotel end of a tour's arrival and departure, when the request named the
 * group's hotel but not on the transfer itself. Only when there is exactly ONE
 * hotel in the programme: a tour that moves from Tbilisi to Kazbegi has two,
 * and picking one of them would send the driver to the wrong door.
 */
function fillLegHotels(draft: BookingDraft): void {
  const named = [draft.hotel, ...(draft.tour_days ?? []).map((d) => d.hotel)]
    .map((h) => h?.trim())
    .filter((h): h is string => !!h);
  const distinct = [...new Set(named.map((h) => h.toLowerCase()))];
  if (distinct.length !== 1) return;
  const hotel = named[0];
  const link = (draft.tour_days ?? []).find((d) => d.hotel?.trim().toLowerCase() === distinct[0])?.hotel_link ?? null;

  const leg = (l: DraftLeg | null, end: 'from' | 'to'): DraftLeg | null => {
    if (!l || l[end]) return l;
    return end === 'to'
      ? { ...l, to: hotel, to_type: 'hotel', to_link: l.to_link ?? link }
      : { ...l, from: hotel, from_type: 'hotel', from_link: l.from_link ?? link };
  };
  draft.transfer_in = leg(draft.transfer_in, 'to');
  draft.transfer_out = leg(draft.transfer_out, 'from');
}

/**
 * One transfer leg of a tour, or null when the model gave nothing usable. The
 * arrival is timed by its landing; the departure by its pickup, with the
 * flight's own time kept beside it — the same rules as a single transfer.
 */
function normalizeAiLeg(raw: unknown, direction: 'in' | 'out', ctx: MergeContext = NO_SOURCE): DraftLeg | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const date = str(r.date);

  let pickup = hhmm(r.time);
  let flightTime = hhmm(r.flight_time);
  if (direction === 'in') {
    if (!pickup && flightTime) pickup = flightTime;
    flightTime = null;
  } else if (flightTime && pickup === flightTime) {
    // The flight's own time put in both: the pickup is not known yet.
    pickup = null;
  }

  const dateDisplay = date ? parseDateTime(date, pickup) : null;
  const from = str(r.from);
  const to = str(r.to);
  const leg: DraftLeg = {
    date_display: dateDisplay,
    pickup_time: dateDisplay ? pickup : null,
    from,
    from_type: placeType(r.from_type) ?? inferPlaceType(from),
    from_link: verifiedMapsLink(r.from_link, ctx.sourceText),
    to,
    to_type: placeType(r.to_type) ?? inferPlaceType(to),
    to_link: verifiedMapsLink(r.to_link, ctx.sourceText),
    flight: str(r.flight),
    flight_at: direction === 'out' ? flightInstant(date, flightTime, dateDisplay, !!pickup) : null,
  };
  return leg.date_display || leg.from || leg.to || leg.flight || leg.flight_at ? leg : null;
}

const LANGUAGE_SET = new Set<string>(LANGUAGE_CODES);

/** The app's own language codes only; anything else is dropped, not guessed at. */
function normalizeLanguages(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const codes = [
    ...new Set(raw.map((c) => String(c).trim().toLowerCase()).filter((c) => LANGUAGE_SET.has(c))),
  ];
  return codes.length > 0 ? codes : null;
}

function normalizeAiTourDays(raw: unknown, ctx: MergeContext = NO_SOURCE): BookingDraft['tour_days'] {
  if (!Array.isArray(raw)) return null;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const days = raw
    .filter((d: any) => d && typeof d.day === 'number')
    .map((d: any) => ({
      day: d.day,
      // A calendar date only — "2026-10-22" — whatever way the model wrote it.
      date: typeof d.date === 'string' ? tbilisiDate(parseDateTime(d.date, null)) : null,
      fromPlace: text(d.fromPlace),
      toPlace: text(d.toPlace),
      stops: text(d.stops),
      hotel: text(d.hotel),
      hotel_link: verifiedMapsLink(d.hotel_link, ctx.sourceText),
    }));
  return days.length > 0 ? days : null;
}

/**
 * A whole draft built from one entry of a programme. Unlike `mergeAi`, nothing
 * was read from the template for these — the model is the only source, so every
 * field is marked as such and the review screen can show that.
 */
function draftFromAi(ai: any, ctx: MergeContext = NO_SOURCE): {
  draft: BookingDraft;
  sources: Partial<Record<keyof BookingDraft, FieldSource>>;
  evidence: Record<string, string> | null;
} {
  const draft: BookingDraft = { ...EMPTY_DRAFT };
  const sources: Partial<Record<keyof BookingDraft, FieldSource>> = {};
  mergeAi(draft, sources, ai ?? {}, ctx);
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

  const KIND_KA: Record<string, string> = {
    transfer: 'ტრანსფერი',
    day_tour: 'ერთდღიანი ტური',
    tour: 'მრავალდღიანი ტური',
  };
  if (fromTemplate('kind') && typeof ai.kind === 'string' && draft.kind && ai.kind !== draft.kind) {
    w.push(
      `სერვისის ტიპი გადაამოწმე: ${KIND_KA[draft.kind] ?? draft.kind} თუ ${KIND_KA[ai.kind] ?? ai.kind}?`,
    );
  }

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

/**
 * Midnight in Tbilisi with no separate pickup time is how a date that came
 * without a time is stored. A real 00:00 pickup is rare enough that asking is
 * the right default — a driver sent at midnight for a noon arrival is not.
 */
function timeMissing(draft: BookingDraft): boolean {
  if (!draft.date_display || draft.pickup_time) return false;
  // A tour's start is a date, as on the booking form; its clock times belong
  // to its arrival and departure, which are asked about on their own.
  if (draft.kind === 'tour') return false;
  return isTbilisiMidnight(draft.date_display);
}

/** "28.10 01:30" in Tbilisi time, for a sentence about a flight. */
function shortTbilisi(iso: string): string {
  const day = tbilisiDate(iso) ?? '';
  return `${day.slice(8, 10)}.${day.slice(5, 7)} ${tbilisiClock(iso) ?? ''}`.trim();
}

function isTbilisiMidnight(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const local = new Date(t + 4 * 3600 * 1000);
  return local.getUTCHours() === 0 && local.getUTCMinutes() === 0;
}

function buildWarnings(draft: BookingDraft): string[] {
  const w: string[] = [];
  if (!draft.date_display) w.push('თარიღი ვერ წავიკითხე — ხელით მიუთითე');
  if (timeMissing(draft)) {
    w.push(
      draft.flight_at
        ? `აყვანის დრო მიუთითე — რეისი ${shortTbilisi(draft.flight_at)}-ზეა`
        : 'დრო ვერ წავიკითხე — მიუთითე, რომელ საათზე',
    );
  }
  if (!draft.vehicle_type) w.push('ტრანსპორტის ტიპი ვერ წავიკითხე');
  if (!draft.passengers) w.push('მგზავრების რაოდენობა ვერ წავიკითხე');
  const tourWithDays = draft.kind === 'tour' && (draft.tour_days?.length ?? 0) > 0;
  if (!draft.from_location && !draft.route && !tourWithDays) w.push('აყვანის ადგილი ვერ წავიკითხე');
  for (const [leg, name] of [
    [draft.transfer_in, 'ჩამოსვლის ტრანსფერის'],
    [draft.transfer_out, 'გამგზავრების ტრანსფერის'],
  ] as const) {
    if (!leg) continue;
    if (!leg.date_display) w.push(`${name} თარიღი ვერ წავიკითხე — მიუთითე`);
    else if (isTbilisiMidnight(leg.date_display) && !leg.pickup_time) {
      w.push(
        leg.flight_at
          ? `${name} აყვანის დრო მიუთითე — რეისი ${shortTbilisi(leg.flight_at)}-ზეა`
          : `${name} დრო ვერ წავიკითხე — მიუთითე`,
      );
    }
  }

  // The arrival opens the tour and the departure closes it. A leg on the other
  // side of the days was read against the wrong day somewhere.
  const dayDates = (draft.tour_days ?? []).map((d) => d.date).filter((d): d is string => !!d).sort();
  if (draft.kind === 'tour' && dayDates.length > 0) {
    const inDay = tbilisiDate(draft.transfer_in?.date_display);
    const outDay = tbilisiDate(draft.transfer_out?.date_display);
    if (inDay && inDay > dayDates[0]) {
      w.push('ჩამოსვლის ტრანსფერი ტურის პირველი დღის შემდეგაა — თარიღები შეამოწმე');
    }
    if (outDay && outDay < dayDates[dayDates.length - 1]) {
      w.push('გამგზავრების ტრანსფერი ტურის ბოლო დღემდეა — თარიღები შეამოწმე');
    }
  }

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

/** Nothing a booking could be made from — no date, no place, no people, no car. */
function draftIsEmpty(d: BookingDraft): boolean {
  return (
    !d.date_display &&
    !d.from_location &&
    !d.to_location &&
    !d.route &&
    d.passengers == null &&
    !d.vehicle_type &&
    !d.flight_number &&
    !d.passenger_name &&
    !d.passenger_phone &&
    !d.hotel &&
    d.client_price == null &&
    !(d.tour_days && d.tour_days.length > 0) &&
    !d.transfer_in &&
    !d.transfer_out
  );
}

/** The model's field names, as the review screen calls them. */
const FIELD_NAMES_KA: Record<string, string> = {
  kind: 'სერვისი',
  date: 'თარიღი',
  time: 'დრო',
  from_location: 'საიდან',
  to_location: 'სად',
  from_location_type: 'საიდან (ტიპი)',
  to_location_type: 'სად (ტიპი)',
  from_location_link: 'საიდან (რუკის ბმული)',
  to_location_link: 'სად (რუკის ბმული)',
  flight_time: 'გაფრენის დრო',
  route: 'მარშრუტი',
  passengers: 'მგზავრები',
  vehicle_type: 'ტრანსპორტი',
  vehicle_class: 'კლასი',
  flight_number: 'რეისი',
  flight_direction: 'ჩამოფრენა / გაფრენა',
  passenger_name: 'მგზავრის სახელი',
  passenger_phone: 'ტელეფონი',
  meet_greet: 'შეხვედრა ტაბლოთი',
  sign_text: 'ტაბლოს ტექსტი',
  client_price: 'ფასი',
  payment_method: 'გადახდა',
  comment: 'კომენტარი',
  hotel: 'სასტუმრო',
  tour_days: 'ტურის დღეები',
  transfer_in: 'ჩამოსვლის ტრანსფერი',
  transfer_out: 'გამგზავრების ტრანსფერი',
  required_languages: 'მძღოლის ენა',
};

/** "Check these" for the fields the model worked out rather than read. */
function uncertainNote(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const names = [
    ...new Set(
      raw
        .map((f) => String(f).trim())
        .filter(Boolean)
        .map((f) => FIELD_NAMES_KA[f] ?? f),
    ),
  ];
  return names.length > 0 ? `ეს ველები AI-მ დაასკვნა, პირდაპირ არ ეწერა — გადაამოწმე: ${names.join(', ')}` : null;
}

/** Base64 without a data-URL prefix or line breaks, as the model expects it. */
function cleanBase64(raw: string): string {
  const body = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  return /\s/.test(body) ? body.replace(/\s+/g, '') : body;
}

/**
 * The picture's real format, read from its first bytes. A phone's own label is
 * not trusted: a PNG screenshot saved as .jpg is common, and the model refuses
 * an image whose declared type does not match its content.
 */
function sniffImageType(b64: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'unsupported' | null {
  let head: string;
  try {
    head = atob(b64.slice(0, 32));
  } catch {
    return null;
  }
  const byte = (i: number) => head.charCodeAt(i);
  if (byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff) return 'image/jpeg';
  if (head.startsWith('\x89PNG')) return 'image/png';
  if (head.startsWith('GIF8')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  // HEIC / HEIF / AVIF — an iPhone's own photo format, which the model cannot open.
  if (/^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)/.test(head.slice(4, 12))) return 'unsupported';
  return null;
}

const IMAGE_FORMAT_ERROR =
  'ამ ფორმატის ფოტო ვერ იკითხება. გადაიღე სქრინშოტი ან აირჩიე JPG / PNG ფოტო.';
const IMAGE_TOO_BIG_ERROR =
  'ფოტო ძალიან დიდია. სცადე სქრინშოტი ან ნაკლები ფოტო ერთად.';

/** One picture for the model, or the reason it cannot be one. */
function imageBlock(b64: string): { block: AiBlock } | { error: string } {
  if (b64.length > MAX_IMAGE_BASE64_CHARS) return { error: IMAGE_TOO_BIG_ERROR };
  const type = sniffImageType(b64);
  if (type === null || type === 'unsupported') return { error: IMAGE_FORMAT_ERROR };
  return { block: { type: 'image', source: { type: 'base64', media_type: type, data: b64 } } };
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
    case 'ZIP_BROKEN':
      return 'ფაილი ცარიელია ან დაზიანებულია.';
    case 'ZIP_NO_CHAT':
      return 'ამ არქივში ჩატის ტექსტი ვერ ვიპოვე. WhatsApp-ში აირჩიე „ჩატის ექსპორტი“ → „მედიის გარეშე“ და ატვირთე ის ფაილი, ან უბრალოდ ჩასვი შეტყობინებები.';
    case 'ZIP_TOO_BIG':
      return 'არქივი ძალიან დიდია. WhatsApp-ში ჩატი „მედიის გარეშე“ გამოიტანე.';
    default:
      return 'ეს ფორმატი არ იკითხება. ატვირთე PDF, .docx, .xlsx, .txt ან WhatsApp-ის ჩატი.';
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

  const startedAt = Date.now();
  const companyId = userData.user.id;

  /**
   * What a model call may still spend: the rest of the request's budget, less
   * room to log and answer, and never more than one call's own cap.
   */
  const aiTimeLeft = () =>
    Math.max(5_000, Math.min(AI_TIMEOUT_MS, REQUEST_BUDGET_MS - (Date.now() - startedAt) - 6_000));
  let logFileName = '';
  let logBytes = 0;

  /**
   * One row per upload, written with the service role so a company cannot
   * forge or suppress its own history.
   *
   * Two guards, because logging must never cost the company its import:
   * the try/catch, and the deadline below. supabase-js sets no fetch timeout,
   * so an unreachable database would otherwise hold a draft that has already
   * been computed until the function hits its wall-clock limit — the answer
   * lost to the bookkeeping about it.
   */
  const LOG_DEADLINE_MS = 2500;

  async function logImport(
    status: 'ok' | 'empty' | 'error',
    extra: { error?: string; usedAi?: boolean; services?: number; warnings?: string[] } = {},
  ): Promise<void> {
    const write = (async () => {
      try {
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        if (!serviceKey) return;
        const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
        const { error } = await admin.from('booking_import_log').insert({
          company_id: companyId,
          file_name: logFileName || null,
          file_bytes: logBytes || null,
          status,
          error: extra.error ?? null,
          used_ai: extra.usedAi === true,
          service_count: extra.services ?? 0,
          warnings: (extra.warnings ?? []).slice(0, 20),
          duration_ms: Date.now() - startedAt,
        });
        if (error) console.error('booking-import: log insert failed', error.message);
      } catch (e) {
        console.error('booking-import: log failed', String(e));
      }
    })();

    let timer: number | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        console.error('booking-import: log timed out, answering anyway');
        resolve();
      }, LOG_DEADLINE_MS);
    });

    await Promise.race([write, deadline]);
    if (timer !== undefined) clearTimeout(timer);
  }

  /**
   * This company's remembered label wordings — see
   * `supabase/migrations/..._company_import_labels.sql` for why they exist.
   *
   * Bounded and deadlined like the log above, for the same reason: the import
   * must never wait on its own memory. An empty answer means the built-in label
   * table alone, which is exactly what every import did before this existed.
   */
  const LEARNED_DEADLINE_MS = 1500;
  const LEARNED_LIMIT = 200;

  async function loadLearnedLabels(): Promise<Record<string, LabelField>> {
    const read = (async (): Promise<Record<string, LabelField>> => {
      try {
        // The caller's own client: the row-level policy already scopes this to
        // the company's own vocabulary, so no service role is needed to read.
        const { data, error } = await supabase
          .from('company_import_labels')
          .select('label, field')
          .eq('company_id', companyId)
          .order('last_seen_at', { ascending: false })
          .limit(LEARNED_LIMIT);
        if (error || !Array.isArray(data)) return {};
        const out: Record<string, LabelField> = {};
        for (const row of data as { label?: string; field?: string }[]) {
          const label = String(row.label ?? '').trim().toLowerCase();
          const field = String(row.field ?? '').trim();
          if (label && field) out[label] = field as LabelField;
        }
        return out;
      } catch (e) {
        console.error('booking-import: learned labels read failed', String(e));
        return {};
      }
    })();

    let timer: number | undefined;
    const deadline = new Promise<Record<string, LabelField>>((resolve) => {
      timer = setTimeout(() => {
        console.error('booking-import: learned labels timed out, using built-ins');
        resolve({});
      }, LEARNED_DEADLINE_MS);
    });

    const result = await Promise.race([read, deadline]);
    if (timer !== undefined) clearTimeout(timer);
    return result;
  }

  /**
   * The AI reports a heading per field under its own names; the parser keys
   * labels by draft field, with `time` and `vehicle` as its two pseudo-fields.
   * Anything not on this list is not remembered.
   */
  const LEARNABLE_FIELDS: Record<string, LabelField> = {
    date: 'date_display',
    time: 'time',
    from_location: 'from_location',
    to_location: 'to_location',
    passengers: 'passengers',
    vehicle_type: 'vehicle',
    client_price: 'client_price',
    flight_number: 'flight_number',
    passenger_name: 'passenger_name',
    passenger_phone: 'passenger_phone',
    hotel: 'hotel',
  };

  /**
   * Remember the wordings the built-in table does not already know.
   *
   * Only the gaps are worth storing: a label the parser handles needs no
   * lesson, and storing it would make a wrong lesson able to shadow a right
   * answer. Fire-and-forget — a lesson lost costs nothing but a model call on
   * the next file.
   */
  function rememberLabels(labels: unknown, uncertain: unknown): void {
    if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return;

    // A field the model says it inferred rather than read teaches nothing: its
    // "heading" is a guess, and a guess written down would be applied as fact
    // to every later file from this company.
    const guessed = new Set(
      (Array.isArray(uncertain) ? uncertain : []).map((f) => String(f).trim()),
    );

    const lesson: Record<string, string> = {};
    for (const [aiField, raw] of Object.entries(labels as Record<string, unknown>)) {
      const field = LEARNABLE_FIELDS[aiField];
      if (!field) continue;
      if (guessed.has(aiField)) continue;
      if (typeof raw !== 'string') continue;
      const label = normalizeLabel(raw);
      if (label.length < 3 || label.length > 60) continue;
      // A heading, not a sentence and not a value.
      if (/\d{2}/.test(label)) continue;
      if (Object.prototype.hasOwnProperty.call(LABELS, label)) continue;
      lesson[label] = field;
    }

    const count = Object.keys(lesson).length;
    if (count === 0) return;

    void (async () => {
      try {
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        if (!serviceKey) return;
        const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
        const { error } = await admin.rpc('remember_import_labels', {
          p_company_id: companyId,
          p_labels: lesson,
        });
        if (error) console.error('booking-import: remember failed', error.message);
        else console.log(`booking-import: remembered ${count} label(s)`);
      } catch (e) {
        console.error('booking-import: remember threw', String(e));
      }
    })();
  }

  /** Answer with a failure, and leave a trace of it. */
  async function failWith(
    status: 'empty' | 'error',
    httpStatus: number,
    message: string,
  ): Promise<Response> {
    await logImport(status, { error: message });
    return json({ ok: false, error: message }, httpStatus);
  }

  let payload: {
    fileName?: unknown;
    contentBase64?: unknown;
    text?: unknown;
    images?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return await failWith('error', 400, 'არასწორი მოთხოვნა');
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

  type ServiceOut = {
    draft: BookingDraft;
    sources: Partial<Record<keyof BookingDraft, FieldSource>>;
    evidence: Record<string, string> | null;
    warnings: string[];
  };

  /**
   * Text — from a file or pasted from a chat — goes through both readers: the
   * template parser for labelled forms, then the model.
   */
  async function answerFromText(
    fullText: string,
    opts: { fileName: string; pasted: boolean; pdfBase64?: string | null },
  ): Promise<Response> {
    // A conversation is read by the model alone — see looksLikeChat. That is a
    // pasted chat or an exported one: WhatsApp's "Export chat" is a .txt file.
    const chat = looksLikeChat(fullText);
    // ...and from its end, where the request being booked is.
    const { text, trimmed } = chat ? trimChat(fullText) : { text: fullText, trimmed: false };

    // Built-in labels plus whatever this company's earlier files have taught us.
    const labelBook = chat ? BUILTIN_LABELS : labelBookWith(await loadLearnedLabels());

    const { draft, sources } = chat
      ? { draft: { ...EMPTY_DRAFT }, sources: {} as Partial<Record<keyof BookingDraft, FieldSource>> }
      : parseTemplate(text, labelBook, { prose: opts.pasted });

    /** Warnings about the whole read rather than one service. */
    const generalWarnings: string[] = [];
    if (trimmed) generalWarnings.push('ჩატი გრძელია — წავიკითხე ბოლო შეტყობინებები, სადაც ჯავშანია.');

    // The model's links are kept only where they appear in what it read.
    const ctx: MergeContext = { sourceText: text };

    // The template is authoritative. The model only fills what is still missing.
    const missingCore =
      !draft.date_display || !draft.vehicle_type || !draft.passengers ||
      (!draft.from_location && !draft.route);

    // A message or a chat is short and often a whole programme, so it is always
    // read as one: the model decides how many services there really are, and
    // one is a valid answer. Files keep the cheaper signal.
    const maybeProgram = opts.pasted || chat || looksLikeMultiService(text);

    /**
     * What the model reads. A PDF is handed over as the page itself — the model
     * sees the table, the columns and the stamp as printed, which its flattened
     * text cannot carry — and if that read fails outright, the text is read
     * instead. A read that timed out is not repeated: there is no time left.
     */
    const pdfInput: AiBlock[] | null = opts.pdfBase64
      ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: opts.pdfBase64 } }]
      : null;

    let usedAi = false;
    let aiFailed = false;
    /** Services 2..n of a programme. The first one is `draft` itself. */
    let extraServices: ServiceOut[] = [];
    let evidence: Record<string, string> | null = null;
    let firstGuessed: string | null = null;
    const crossWarnings: string[] = [];

    /**
     * The model runs on every document now, not only when the template came up
     * short. Two readers of the same page is what lets the importer catch itself:
     * where they agree the value is almost certainly right, and where they differ
     * the company is told to look. A silent misreading is the one failure this
     * feature cannot afford, and it is worth a few tetri per file to prevent.
     */
    if (!apiKey) {
      if (missingCore || maybeProgram) {
        generalWarnings.push(
          'ფაილი შაბლონს არ ემთხვევა და AI წაკითხვა გამორთულია (ANTHROPIC_API_KEY არ არის დაყენებული).',
        );
      }
    } else if (maybeProgram) {
      // Looks like it holds more than one job. Ask for all of them — the model
      // decides how many there really are, and one is a valid answer.
      let read = pdfInput
        ? await aiExtractProgram(pdfInput, apiKey, { documentKind: 'pdf', timeoutMs: aiTimeLeft() })
        : await aiExtractProgram(text, apiKey, { timeoutMs: aiTimeLeft() });
      if (pdfInput && read.services.length === 0 && read.failure !== 'timeout' && aiTimeLeft() >= MIN_FALLBACK_MS) {
        console.error('booking-import: pdf page read failed, reading its text', read.warning);
        read = await aiExtractProgram(text, apiKey, { timeoutMs: aiTimeLeft() });
      }
      const { services: found, warning } = read;
      if (warning) {
        generalWarnings.push(warning);
        aiFailed = true;
      }
      if (found.length > 0) {
        usedAi = true;
        crossWarnings.push(...disagreementWarnings(draft, sources, found[0]));
        // The template read the first service off the actual layout, so it wins.
        mergeAi(draft, sources, found[0] ?? {}, ctx);
        evidence = normalizeEvidence(found[0]?.evidence);
        firstGuessed = uncertainNote(found[0]?.uncertain_fields);
        extraServices = found.slice(1).map((ai) => {
          const s = draftFromAi(ai, ctx);
          const guessed = uncertainNote(ai?.uncertain_fields);
          return { ...s, warnings: [...(guessed ? [guessed] : []), ...buildWarnings(s.draft)] };
        });

        // Every service in a programme shares the document's layout, so the
        // first one carries all the vocabulary there is to learn. A chat has
        // no layout to learn.
        if (!chat) rememberLabels(found[0]?.field_labels, found[0]?.uncertain_fields);
      }
    } else {
      let read = pdfInput
        ? await aiExtract(pdfInput, apiKey, { documentKind: 'pdf', timeoutMs: aiTimeLeft() })
        : await aiExtract(text, apiKey, { timeoutMs: aiTimeLeft() });
      if (pdfInput && !read.data && read.failure !== 'timeout' && aiTimeLeft() >= MIN_FALLBACK_MS) {
        console.error('booking-import: pdf page read failed, reading its text', read.warning);
        read = await aiExtract(text, apiKey, { timeoutMs: aiTimeLeft() });
      }
      const { data, warning } = read;
      if (warning) {
        generalWarnings.push(warning);
        aiFailed = true;
      }
      if (data) {
        usedAi = true;
        crossWarnings.push(...disagreementWarnings(draft, sources, data));
        mergeAi(draft, sources, data, ctx);
        evidence = normalizeEvidence(data.evidence);
        firstGuessed = uncertainNote(data.uncertain_fields);
        rememberLabels(data.field_labels, data.uncertain_fields);
      }
    }

    const services: ServiceOut[] = [
      {
        draft,
        sources,
        evidence,
        warnings: [...(firstGuessed ? [firstGuessed] : []), ...crossWarnings, ...buildWarnings(draft)],
      },
      ...extraServices,
    ];

    // A pasted message with nothing in it to book is a wrong paste or a failed
    // read, and an empty form would only hide which.
    if (opts.pasted && services.every((s) => draftIsEmpty(s.draft))) {
      return await failWith(
        'empty',
        422,
        aiFailed || !apiKey
          ? 'შეტყობინების წაკითხვა ახლა ვერ მოხერხდა — სცადე ხელახლა.'
          : 'ამ ტექსტში ჯავშნის დეტალები ვერ ვიპოვე — თარიღი, ადგილი ან მგზავრები. შეამოწმე, სწორი შეტყობინება ჩასვი თუ არა.',
      );
    }

    const warnings = [
      ...(services.length > 1
        ? [`${opts.pasted ? 'შეტყობინებაში' : 'ფაილში'} ${services.length} სერვისი ვიპოვე — ყველა ქვემოთ ჩანს.`]
        : []),
      ...generalWarnings,
      ...services[0].warnings,
    ];

    await logImport('ok', { usedAi, services: services.length, warnings });

    return json({
      ok: true,
      // `draft` stays the first service so older app builds keep working unchanged.
      draft,
      sources,
      warnings,
      usedAi,
      /** Every service the request asks for. Always at least one. */
      services,
      fileName: opts.fileName,
      textPreview: text.replace(/[\x00\x01]/g, '').slice(0, 1500),
    });
  }

  /**
   * A photo, a screenshot or a scanned page has no text for the template, so
   * the model reads the picture itself. It is always asked for a programme: a
   * photographed itinerary is as likely to hold five jobs as one. Nothing is
   * learned from a picture — the lessons come from text the parser can check.
   */
  async function answerFromVisual(
    blocks: AiBlock[],
    fileName: string,
    opts: { documentKind?: DocumentKind; failMessage?: string } = {},
  ): Promise<Response> {
    if (!apiKey) {
      return await failWith(
        'error',
        503,
        opts.failMessage ??
          'ფოტოს წაკითხვა ახლა მიუწვდომელია. ჩასვი შეტყობინების ტექსტი ან შეავსე ჯავშანი ხელით.',
      );
    }

    const { services: found, warning } = await aiExtractProgram(blocks, apiKey, {
      documentKind: opts.documentKind,
      timeoutMs: aiTimeLeft(),
    });
    if (found.length === 0) {
      if (warning) console.error('booking-import: picture read failed', warning);
      return await failWith('error', 502, opts.failMessage ?? 'წაკითხვა ვერ მოხერხდა — სცადე ხელახლა.');
    }

    const services: ServiceOut[] = found.map((ai) => {
      // Nothing to check a link against on a picture, so none is kept.
      const s = draftFromAi(ai, NO_SOURCE);
      const guessed = uncertainNote(ai?.uncertain_fields);
      return { ...s, warnings: [...(guessed ? [guessed] : []), ...buildWarnings(s.draft)] };
    });

    if (services.every((s) => draftIsEmpty(s.draft))) {
      return await failWith(
        'empty',
        422,
        'ჯავშნის დეტალები ვერ ვიპოვე — სცადე უფრო მკაფიო ფოტო, ან ჩასვი შეტყობინების ტექსტი.',
      );
    }

    const warnings = [
      ...(services.length > 1 ? [`${services.length} სერვისი ვიპოვე — ყველა ქვემოთ ჩანს.`] : []),
      ...services[0].warnings,
    ];

    await logImport('ok', { usedAi: true, services: services.length, warnings });

    return json({
      ok: true,
      draft: services[0].draft,
      sources: services[0].sources,
      warnings,
      usedAi: true,
      services,
      fileName,
      textPreview: '',
    });
  }

  // ------------------------------------------------- photos and screenshots

  if (Array.isArray(payload.images) && payload.images.length > 0) {
    const images = payload.images as { base64?: unknown }[];
    logFileName = images.length === 1 ? 'ფოტო' : `ფოტო ×${images.length}`;
    if (images.length > MAX_IMAGES) {
      return await failWith('error', 413, `ერთად მაქსიმუმ ${MAX_IMAGES} ფოტო აირჩიე.`);
    }

    const blocks: AiBlock[] = [];
    let total = 0;
    for (const image of images) {
      const b64 = cleanBase64(String(image?.base64 ?? ''));
      if (!b64) return await failWith('error', 400, 'ფოტო ცარიელია — აირჩიე თავიდან.');
      total += b64.length;
      if (total > MAX_IMAGES_TOTAL_BASE64_CHARS) {
        return await failWith('error', 413, IMAGE_TOO_BIG_ERROR);
      }
      const read = imageBlock(b64);
      if ('error' in read) return await failWith('error', 415, read.error);
      blocks.push(read.block);
    }
    logBytes = Math.round((total * 3) / 4);
    return await answerFromVisual(blocks, logFileName);
  }

  // ---------------------------------------------------------- pasted text

  if (typeof payload.text === 'string') {
    const pasted = cleanPastedText(payload.text);
    logFileName = PASTED_TEXT_NAME;
    logBytes = new TextEncoder().encode(pasted).length;
    if (pasted.replace(/\s/g, '').length < 8) {
      return await failWith('empty', 422, 'ჩასვი შეტყობინების ტექსტი.');
    }
    // A long conversation is fine — it is read from its end. A long anything
    // else is not a booking request.
    if (pasted.length > MAX_TEXT_CHARS && !looksLikeChat(pasted)) {
      return await failWith(
        'error',
        413,
        'ტექსტი ძალიან გრძელია — ჩასვი მხოლოდ ის შეტყობინებები, სადაც ჯავშანია.',
      );
    }
    return await answerFromText(pasted, { fileName: PASTED_TEXT_NAME, pasted: true });
  }

  // ----------------------------------------------------------------- file

  const fileName = String(payload.fileName ?? '').trim();
  const b64 = cleanBase64(String(payload.contentBase64 ?? ''));
  logFileName = fileName;
  // Base64 carries a third more than the bytes it encodes.
  logBytes = Math.round((b64.length * 3) / 4);
  if (!fileName || !b64) {
    return await failWith('error', 400, 'ფაილი არ არის');
  }
  if (b64.length > MAX_BASE64_CHARS) {
    return await failWith('error', 413, 'ფაილი ძალიან დიდია (მაქს. ~8 MB)');
  }

  // A photo picked as a file is still a photo.
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (IMAGE_FILE_EXTENSIONS.has(ext)) {
    const read = imageBlock(b64);
    if ('error' in read) return await failWith('error', 415, read.error);
    return await answerFromVisual([read.block], fileName);
  }

  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return await failWith('error', 400, 'ფაილი დაზიანებულია');
  }
  logBytes = bytes.length;

  let text: string;
  const fileInfo: { pdfPages?: number } = {};
  try {
    text = await extractText(fileName, bytes, fileInfo);
  } catch (e) {
    const code = String((e as Error).message);
    const pdfBlock: AiBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: b64 },
    };
    // A scanned or photographed PDF has no text layer, but the model reads the
    // page itself — so the one file that used to be refused outright is read.
    if (code === 'PDF_NO_TEXT' && apiKey) {
      return await answerFromVisual([pdfBlock], fileName, { documentKind: 'scan' });
    }
    // The text reader could not open it, but the model may: it reads PDFs
    // itself. Only if that fails too does the company hear why.
    if ((code === 'PDF_ENGINE' || code === 'PDF_BROKEN') && apiKey) {
      return await answerFromVisual([pdfBlock], fileName, {
        documentKind: 'pdf',
        failMessage: friendlyExtractError(code),
      });
    }
    return await failWith('error', 415, friendlyExtractError(code));
  }

  if (!text.trim()) {
    return await failWith('empty', 422, 'ფაილში ტექსტი ვერ ვიპოვე');
  }

  // A PDF with text is still read by the model as the page itself, which is
  // where its tables and columns are; its text stays the template's to read,
  // and the fallback if the page read fails.
  const isPdf = (fileName.split('.').pop() ?? '').toLowerCase() === 'pdf';
  const readPage = isPdf && !!apiKey && (fileInfo.pdfPages ?? 0) <= MAX_PDF_DOCUMENT_PAGES;

  return await answerFromText(text, { fileName, pasted: false, pdfBase64: readPage ? b64 : null });
});
