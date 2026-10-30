/**
 * The voucher as a PDF, attached to every booking email.
 *
 * Same rows as the email body (render.ts), laid out on A4 pages with the
 * DejaVu Sans faces (they carry Georgian, Latin and the arrows/dashes the
 * voucher uses). Fonts are embedded as subsets, so a voucher stays small.
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import {
  bookingRows,
  clean,
  driverBadges,
  eventRows,
  driverRows,
  formatGel,
  formatTime,
  hostRows,
  lines,
  offeredPriceGel,
  priceNotes,
  tourData,
  vehicleRows,
  voucherCode,
  type EmailInput,
  type Row,
} from './render.ts';

export type PdfFonts = { regular: Uint8Array; bold: Uint8Array };

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 46; // page margin
const HEADER_H = 64;
const FOOTER_H = 34;

const GOLD = rgb(0.961, 0.651, 0.137);
const GOLD_DARK = rgb(0.706, 0.325, 0.035);
const INK = rgb(0.086, 0.094, 0.114);
const MUTED = rgb(0.42, 0.435, 0.47);
const RULE = rgb(0.9, 0.9, 0.9);
const GREEN = rgb(0.082, 0.502, 0.239);
const RED = rgb(0.725, 0.11, 0.11);
const SOFT = rgb(0.976, 0.976, 0.976);

type Glyphs = { has(cp: number): boolean };

/** Mtavruli capitals become ordinary Mkhedruli; anything the font cannot draw is left out. */
function fit(text: string, glyphs: Glyphs): string {
  let out = '';
  for (const ch of text) {
    let cp = ch.codePointAt(0)!;
    if ((cp >= 0x1c90 && cp <= 0x1cba) || (cp >= 0x1cbd && cp <= 0x1cbf)) cp -= 0xbc0;
    if (cp === 0x20be) {
      out += 'GEL';
      continue;
    }
    if (cp === 0x0a || cp === 0x20 || glyphs.has(cp)) out += String.fromCodePoint(cp);
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      // A single word longer than the line is cut where it no longer fits.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

class Layout {
  page!: PDFPage;
  y = 0;
  readonly pages: PDFPage[] = [];

  constructor(
    private doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private glyphs: Glyphs,
    private code: string,
  ) {
    this.addPage();
  }

  t(s: string): string {
    return fit(clean(s), this.glyphs);
  }

  addPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    const p = this.page;
    const brand = 'KEKE MANAGER';
    const bw = this.bold.widthOfTextAtSize(brand, 19);
    p.drawText(brand, { x: (PAGE_W - bw) / 2, y: PAGE_H - M - 14, size: 19, font: this.bold, color: GOLD });
    const sub = this.t('B2B ტურისტული სატრანსპორტო პლატფორმა');
    const sw = this.regular.widthOfTextAtSize(sub, 8.5);
    p.drawText(sub, { x: (PAGE_W - sw) / 2, y: PAGE_H - M - 30, size: 8.5, font: this.regular, color: MUTED });
    if (this.pages.length > 1) {
      const cont = this.t(`ვაუჩერი ${this.code} (გაგრძელება)`);
      p.drawText(cont, { x: M, y: PAGE_H - M - HEADER_H + 6, size: 9, font: this.regular, color: MUTED });
    }
    // the voucher frame, dashed in KEKE gold like the in-app voucher
    p.drawRectangle({
      x: M - 14,
      y: M + FOOTER_H - 6,
      width: PAGE_W - 2 * (M - 14),
      height: PAGE_H - 2 * M - HEADER_H - FOOTER_H + 6 + (this.pages.length > 1 ? -14 : 0),
      borderColor: GOLD,
      borderWidth: 1.4,
      borderDashArray: [6, 4],
    });
    this.y = PAGE_H - M - HEADER_H - 14 - (this.pages.length > 1 ? 14 : 0);
  }

  ensure(h: number): void {
    if (this.y - h < M + FOOTER_H + 8) this.addPage();
  }

  text(s: string, size: number, opts: { font?: PDFFont; color?: RGB; gap?: number; indent?: number } = {}): void {
    const font = opts.font ?? this.regular;
    const x = M + (opts.indent ?? 0);
    const width = PAGE_W - 2 * M - (opts.indent ?? 0);
    const lh = size * 1.35;
    for (const line of wrap(this.t(s), font, size, width)) {
      this.ensure(lh);
      this.y -= lh;
      this.page.drawText(line, { x, y: this.y + size * 0.28, size, font, color: opts.color ?? INK });
    }
    this.y -= opts.gap ?? 0;
  }

  section(title: string): void {
    this.ensure(40);
    this.y -= 10;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: PAGE_W - M, y: this.y }, thickness: 0.7, color: RULE });
    this.y -= 6;
    this.text(title, 12, { font: this.bold, gap: 4 });
  }

  /** Height the rows will take, so a shaded box can be drawn behind them first. */
  measureRows(rows: Row[], inset = 0): number {
    const { labelW, valueW, size, lh } = this.rowGeometry(inset);
    let h = 0;
    for (const [label, value] of this.visible(rows)) {
      const l = wrap(this.t(label), this.regular, size, labelW - 8).length;
      const v = wrap(this.t(value), this.bold, size, valueW).length;
      h += Math.max(l, v) * lh + 4;
    }
    return h;
  }

  rows(rows: Row[], inset = 0): void {
    const { labelW, valueW, size, lh } = this.rowGeometry(inset);
    for (const [label, value] of this.visible(rows)) {
      const l = wrap(this.t(label), this.regular, size, labelW - 8);
      const v = wrap(this.t(value), this.bold, size, valueW);
      const h = Math.max(l.length, v.length) * lh + 4;
      this.ensure(h);
      const top = this.y;
      l.forEach((line, i) =>
        this.page.drawText(line, { x: M + inset, y: top - (i + 1) * lh + size * 0.28, size, font: this.regular, color: MUTED }));
      v.forEach((line, i) =>
        this.page.drawText(line, { x: M + inset + labelW, y: top - (i + 1) * lh + size * 0.28, size, font: this.bold, color: INK }));
      this.y -= h;
    }
  }

  /** Rows on a light panel (one tour day). */
  panel(rows: Row[]): void {
    const pad = 8;
    const h = this.measureRows(rows, pad) + pad * 2 - 4;
    this.ensure(h + 6);
    this.y -= 4;
    this.page.drawRectangle({
      x: M,
      y: this.y - h,
      width: PAGE_W - 2 * M,
      height: h,
      color: SOFT,
      borderColor: RULE,
      borderWidth: 0.7,
    });
    this.y -= pad;
    this.rows(rows, pad);
    this.y -= pad - 4;
  }

  private visible(rows: Row[]): Row[] {
    return rows.filter(([, v]) => v && v !== '—');
  }

  private rowGeometry(inset: number) {
    const inner = PAGE_W - 2 * M - inset * 2;
    const labelW = Math.round(inner * 0.4);
    return { labelW, valueW: inner - labelW, size: 10, lh: 13.5 };
  }
}

export async function renderVoucherPdf(input: EmailInput, fonts: PdfFonts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const face = fontkit.create(fonts.regular);
  const glyphs: Glyphs = { has: (cp) => face.hasGlyphForCodePoint(cp) };
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });

  const b = input.booking;
  const code = voucherCode(b);
  const L = lines(input);
  doc.setTitle(`${code} · KEKE Manager`);
  doc.setAuthor('KEKE Manager');
  doc.setCreator('KEKE Manager');
  doc.setProducer('KEKE Manager');
  doc.setLanguage('ka');

  const w = new Layout(doc, regular, bold, glyphs, code);

  w.text('ვაუჩერი', 10, { color: MUTED });
  w.text(code, 22, { font: bold, color: GOLD, gap: 2 });
  if (input.companyName) w.text(input.companyName, 10, { color: MUTED, gap: 4 });

  const statusColor = input.event === 'completed' || input.event === 'dropoff'
    ? GREEN
    : input.event === 'cancelled' || input.event === 'rejected'
    ? RED
    : GOLD_DARK;
  w.text(L.heading + (b.parent_booking_id && b.leg_index ? ` · მანქანა ${b.leg_index}` : ''), 12.5, { font: bold, color: statusColor });
  if (input.event === 'started' || input.event === 'completed') {
    const at = formatTime(input.eventAt);
    if (at) w.text(`${input.event === 'started' ? 'დაიწყო' : 'დასრულდა'} ${at}-ზე (თბილისის დროით)`, 9.5, { color: MUTED });
  }
  const happened = eventRows(input);
  if (happened.length) {
    w.y -= 2;
    w.rows(happened);
  }
  w.y -= 6;
  w.text(`ფასი: ${formatGel(offeredPriceGel(b))}`, 15, { font: bold, color: GREEN });
  for (const n of priceNotes(b)) w.text(n, 9, { color: MUTED });

  w.section('ჯავშანი');
  w.rows(bookingRows(b));
  const tour = tourData(b);
  if (tour) {
    if (tour.arrival) w.rows([tour.arrival]);
    for (const day of tour.days) w.panel(day);
    if (tour.departure) w.rows([tour.departure]);
  }

  const d = input.driver;
  if (d) {
    w.section('მძღოლი');
    w.text(clean(d.fullName) || '—', 13, { font: bold });
    const badges = driverBadges(d);
    if (badges.length) w.text(badges.join(' · '), 9, { font: bold, color: GOLD_DARK, gap: 2 });
    w.rows(driverRows(d));
  }

  const v = input.vehicle;
  if (v) {
    w.section('მანქანა');
    w.rows(vehicleRows(v));
  }

  if (input.host) {
    w.section('ჰოსტი');
    w.rows(hostRows(input.host));
  }

  w.y -= 10;
  w.text(`ვაუჩერი ონლაინ: ${input.voucherUrl}`, 8.5, { color: MUTED });

  // footer on every page
  const total = w.pages.length;
  const stamp = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tbilisi',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()).replace(/\//g, '.');
  w.pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 18 }, end: { x: PAGE_W - M, y: M + 18 }, thickness: 0.6, color: RULE });
    p.drawText(w.t('KEKE Manager · info@kekemanager.com · +995 551 003 411'), { x: M, y: M + 4, size: 8, font: regular, color: MUTED });
    const right = w.t(`${stamp} · გვერდი ${i + 1} / ${total}`);
    p.drawText(right, { x: PAGE_W - M - regular.widthOfTextAtSize(right, 8), y: M + 4, size: 8, font: regular, color: MUTED });
  });

  return await doc.save();
}
