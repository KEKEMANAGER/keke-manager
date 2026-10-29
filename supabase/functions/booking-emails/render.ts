/**
 * The company's booking email: one voucher, three moments.
 *
 *   confirmed  — a driver accepted the booking (the voucher now has a driver and a car)
 *   started    — the driver started the transfer / tour
 *   completed  — the driver finished it
 *
 * Pure functions only (no Deno, no database), so the same file renders in the
 * edge function, in tests and in a local preview. Labels follow the app's own
 * Georgian voucher (lib/companyVoucherHtml.ts) so the email and the in-app
 * voucher never disagree. The layout is tables and inline styles because that
 * is what Gmail, Outlook and phone mail apps all draw the same way.
 */

export type EmailEvent = 'confirmed' | 'started' | 'completed';

export type TourDay = {
  day?: number;
  date?: string;
  fromPlace?: string;
  toPlace?: string;
  stops?: string | string[];
  touristHotel?: string;
  tourist_hotel?: string;
  driverOvernight?: string;
  driver_overnight?: string;
};

export type TransferLeg = {
  date?: string;
  airport?: string;
  hotel?: string;
  flight?: string;
} | null;

export type EmailBooking = {
  id: string;
  kind?: string | null;
  booking_type?: string | null;
  flight_direction?: string | null;
  date_display?: string | null;
  from_location?: string | null;
  to_location?: string | null;
  passengers?: number | null;
  vehicle_type?: string | null;
  vehicle_class?: string | null;
  requested_capacity_tier?: string | null;
  required_languages?: string[] | null;
  pickup_time?: string | null;
  hotel?: string | null;
  flight_number?: string | null;
  comment?: string | null;
  price_gel?: number | string | null;
  client_price?: number | string | null;
  price_includes_fuel?: boolean | null;
  driver_overnight_by?: string | null;
  voucher_code?: string | null;
  group_code?: string | null;
  leg_index?: number | null;
  parent_booking_id?: string | null;
  tour_days?: TourDay[] | null;
  transfer_in?: TransferLeg;
  transfer_out?: TransferLeg;
};

export type EmailDriver = {
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isKekeCertified: boolean;
  isGuideDriver: boolean;
  ratingAverage: number | null;
  ratingCount: number;
  languages: string[];
};

export type EmailVehicle = {
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  color: string | null;
  type: string | null;
  vehicleClass: string | null;
  photoUrl: string | null;
};

export type EmailHost = { fullName: string | null; phone: string | null } | null;

export type EmailInput = {
  event: EmailEvent;
  /** When the status changed (ISO). */
  eventAt: string;
  companyName: string | null;
  booking: EmailBooking;
  driver: EmailDriver | null;
  vehicle: EmailVehicle | null;
  host: EmailHost;
  /** Link to the voucher on kekemanager.com. */
  voucherUrl: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

// ── labels (same words as the app) ──────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  transfer: 'ტრანსფერი',
  transfer_arrival: 'ტრანსფერი — ჩამოსვლა',
  transfer_departure: 'ტრანსფერი — გამგზავრება',
  tour: 'ტური',
  day_tour: 'ერთდღიანი ტური',
};

const VEHICLE_TYPE: Record<string, string> = {
  sedan: 'სედანი',
  minivan: 'მინივენი',
  suv: 'ჯიპი (SUV)',
  offroad: '4x4 (ოფროუდი)',
  microbus: 'მიკროავტობუსი',
  bus: 'ავტობუსი',
  special: 'სპეც. ტრანსპორტი',
};

const VEHICLE_CLASS: Record<string, string> = {
  economy: 'ეკონომი',
  comfort: 'კომფორტი',
  vip: 'VIP',
  business: 'VIP',
  premium: 'VIP',
};

const CAPACITY_TIER: Record<string, string> = {
  minivan_3_5: '3–5 კაცი',
  minivan_6_8: '6–8 კაცი (დიდი მინივენი)',
  microbus_10: '10 კაცი',
  microbus_13: '13 კაცი',
  microbus_16: '16 კაცი',
  microbus_17: '17 კაცი',
  microbus_18: '18 კაცი',
  microbus_20: '20 კაცი',
};

const LANGUAGE: Record<string, string> = {
  ka: 'ქართული', en: 'ინგლისური', ru: 'რუსული', de: 'გერმანული', fr: 'ფრანგული',
  es: 'ესპანური', it: 'იტალიური', tr: 'თურქული', ar: 'არაბული', zh: 'ჩინური',
  ja: 'იაპონური', ko: 'კორეული', pt: 'პორტუგალიური', nl: 'ჰოლანდიური', pl: 'პოლონური',
  uk: 'უკრაინული', hy: 'სომხური', az: 'აზერბაიჯანული', fa: 'სპარსული', hi: 'ჰინდი',
  sv: 'შვედური', no: 'ნორვეგიული', da: 'დანიური', fi: 'ფინური', cs: 'ჩეხური',
  ro: 'რუმინული', el: 'ბერძნული', he: 'ივრით', th: 'ტაილანდური', vi: 'ვიეტნამური',
  id: 'ინდონეზიური', bn: 'ბენგალური', ur: 'ურდუ',
};

/** transfer | transfer_arrival | transfer_departure | tour | day_tour — like resolveBookingKindLabelCode. */
export function kindCode(b: EmailBooking): string {
  const k = String(b.kind ?? b.booking_type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (k === 'tour') return 'tour';
  if (k === 'day_tour' || k === 'daytour' || (k.includes('day') && k.includes('tour'))) return 'day_tour';
  if (k === 'transfer_arrival' || k === 'transfer_departure') return k;
  const dir = String(b.flight_direction ?? '').trim().toLowerCase();
  if (dir === 'arrival') return 'transfer_arrival';
  if (dir === 'departure') return 'transfer_departure';
  return 'transfer';
}

export function isTour(b: EmailBooking): boolean {
  const c = kindCode(b);
  return c === 'tour' || c === 'day_tour';
}

// ── formatting ──────────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Emoji and pictographs are dropped, as on the printed voucher. */
export function clean(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const TBILISI = 'Asia/Tbilisi';

function parts(d: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: TBILISI,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)) {
    out[p.type] = p.value;
  }
  return out;
}

/** "03.11.2026, 13:20" in Tbilisi time; free text that is not a date is kept as typed. */
export function formatDateTime(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-');
    return `${d}.${m}.${y}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const p = parts(d);
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}`;
}

export function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

function formatDay(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return raw || '—';
}

export function offeredPriceGel(b: EmailBooking): number {
  const a = Number(b.price_gel);
  if (Number.isFinite(a) && a > 0) return a;
  const c = Number(b.client_price);
  if (Number.isFinite(c) && c > 0) return c;
  return 0;
}

export function formatGel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${new Intl.NumberFormat('ka-GE').format(n)} GEL`;
}

export function voucherCode(b: EmailBooking): string {
  return clean(b.group_code) || clean(b.voucher_code) || `KEKE-${b.id.slice(0, 6).toUpperCase()}`;
}

export function priceNotes(b: EmailBooking): string[] {
  const notes: string[] = [];
  if (b.price_includes_fuel === false) notes.push('ფასში საწვავი არ შედის — ცალკე ანაზღაურდება');
  else if (b.price_includes_fuel === true) notes.push('ფასში საწვავი შედის');
  if (b.driver_overnight_by === 'company') notes.push('ღამისთევას აწყობს კომპანია');
  else if (b.driver_overnight_by === 'keke') {
    notes.push('ღამისთევის დაჯავშნაში KEKE Manager დაგეხმარებათ, ან მძღოლი თვითონ პოულობს');
  }
  return notes;
}

function phoneHref(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '');
}

function vehicleLine(v: EmailVehicle): string {
  const mm = [clean(v.make), clean(v.model)].filter(Boolean).join(' ');
  return [mm, v.year ? String(v.year) : ''].filter(Boolean).join(' · ');
}

// ── wording per moment ──────────────────────────────────────────────────────

export type Lines = { subject: string; heading: string; intro: string };

export function lines(input: EmailInput): Lines {
  const b = input.booking;
  const code = voucherCode(b);
  const noun = isTour(b) ? 'ტური' : 'ტრანსფერი';
  const driver = clean(input.driver?.fullName);
  const when = formatDateTime(b.date_display);
  const at = formatTime(input.eventAt);
  if (input.event === 'confirmed') {
    return {
      subject: `ჯავშანი დადასტურდა · ${code}${when !== '—' ? ` · ${when}` : ''}`,
      heading: 'ჯავშანი დადასტურდა',
      intro: `თქვენი ჯავშანი მძღოლმა მიიღო.${driver ? ` მძღოლი: ${driver}.` : ''} ვაუჩერი ქვემოთაა.`,
    };
  }
  if (input.event === 'started') {
    return {
      subject: `${noun} დაიწყო · ${code}`,
      heading: `${noun} დაიწყო`,
      intro: `${at ? `${at}-ზე ` : ''}მძღოლმა ${noun} დაიწყო.${driver ? ` მძღოლი: ${driver}.` : ''}`,
    };
  }
  return {
    subject: `${noun} დასრულდა · ${code}`,
    heading: `${noun} დასრულდა`,
    intro: `${at ? `${at}-ზე ` : ''}${noun} დასრულდა. გთხოვთ, შეაფასოთ მძღოლი KEKE Manager-ში. შეფასების გარეშე ახალი ჯავშნის შექმნა შეიზღუდება.`,
  };
}

// ── building blocks ─────────────────────────────────────────────────────────

const C = {
  ink: '#16181d',
  muted: '#6b6f78',
  line: '#ececec',
  gold: '#F5A623',
  goldDark: '#B45309',
  green: '#15803d',
  page: '#f4f4f5',
};

const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

export type Row = [string, string, string?]; // label, value (text), optional href

function rowsTable(rows: Row[]): string {
  const body = rows
    .filter(([, v]) => v && v !== '—')
    .map(([label, value, href]) => {
      const shown = href
        ? `<a href="${escapeHtml(href)}" style="color:${C.ink};text-decoration:underline">${escapeHtml(value)}</a>`
        : escapeHtml(value);
      return `<tr>
<td style="padding:5px 12px 5px 0;color:${C.muted};font-size:13px;vertical-align:top;width:42%">${escapeHtml(label)}</td>
<td style="padding:5px 0;color:${C.ink};font-size:13px;font-weight:bold;vertical-align:top">${shown}</td>
</tr>`;
    })
    .join('');
  if (!body) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${body}</table>`;
}

function section(title: string, inner: string): string {
  if (!inner.trim()) return '';
  return `<tr><td style="padding:14px 0 0 0;border-top:1px solid ${C.line}">
<div style="font-size:14px;font-weight:bold;color:${C.ink};margin:0 0 6px 0">${escapeHtml(title)}</div>
${inner}
</td></tr>`;
}

export function bookingRows(b: EmailBooking): Row[] {
  const langs = (b.required_languages ?? []).map((c) => LANGUAGE[c] ?? c).filter(Boolean).join(', ');
  const rows: Row[] = [
    ['ტიპი', KIND_LABEL[kindCode(b)] ?? 'ტრანსფერი'],
    ['თარიღი', formatDateTime(b.date_display)],
    ['საიდან', clean(b.from_location) || '—'],
    ['სად', clean(b.to_location) || '—'],
    ['მგზავრები', String(b.passengers ?? 1)],
    ['ტრანსპორტი', [VEHICLE_TYPE[String(b.vehicle_type ?? '')] ?? '', VEHICLE_CLASS[String(b.vehicle_class ?? '')] ?? ''].filter(Boolean).join(' · ') || '—'],
    ['კატეგორია', CAPACITY_TIER[String(b.requested_capacity_tier ?? '')] ?? '—'],
    ['მძღოლის ენები', langs || '—'],
    ['აყვანის დრო', clean(b.pickup_time) || '—'],
    ['სასტუმრო', clean(b.hotel) || '—'],
    ['ფრენის ნომერი', clean(b.flight_number) || '—'],
    ['შენიშვნა', clean(b.comment) || '—'],
  ];
  return rows;
}

function legRoute(from: string | undefined, to: string | undefined): string {
  return [clean(from), clean(to)].filter(Boolean).join(' → ');
}

export type TourData = { arrival: Row | null; days: Row[][]; departure: Row | null };

/** Arrival transfer, each day, departure transfer: the same rows the in-app voucher shows. */
export function tourData(b: EmailBooking): TourData | null {
  if (!isTour(b)) return null;
  const tin = b.transfer_in;
  const tout = b.transfer_out;
  const arrival: Row | null = tin && (tin.date || tin.airport || tin.hotel)
    ? ['ჩამოსვლის ტრანსფერი', [formatDateTime(tin.date), legRoute(tin.airport, tin.hotel), clean(tin.flight)].filter((x) => x && x !== '—').join(' · ')]
    : null;
  const departure: Row | null = tout && (tout.date || tout.airport || tout.hotel)
    ? ['გამგზავრების ტრანსფერი', [formatDateTime(tout.date), legRoute(tout.hotel, tout.airport), clean(tout.flight)].filter((x) => x && x !== '—').join(' · ')]
    : null;
  const list = Array.isArray(b.tour_days) ? b.tour_days : [];
  const days = list.map((d, i) => {
    const last = i === list.length - 1;
    const stops = Array.isArray(d.stops) ? d.stops.filter(Boolean).join(', ') : clean(d.stops as string);
    const rows: Row[] = [
      [`თარიღი (დღე ${d.day ?? i + 1})`, formatDay(d.date)],
      ['მარშრუტი', `${clean(d.fromPlace) || '—'} → ${clean(d.toPlace) || '—'}`],
      ['გაჩერებები', stops || '—'],
    ];
    if (!last) {
      rows.push(['ტურისტების სასტუმრო', clean(d.touristHotel ?? d.tourist_hotel) || '—']);
      rows.push(['მძღოლის ღამისთევა', clean(d.driverOvernight ?? d.driver_overnight) || '—']);
    }
    return rows;
  });
  return { arrival, days, departure };
}

function tourRows(b: EmailBooking): string {
  const data = tourData(b);
  if (!data) return '';
  const blocks: string[] = [];
  if (data.arrival) blocks.push(rowsTable([data.arrival]));
  for (const rows of data.days) {
    blocks.push(`<div style="background:#fafafa;border:1px solid ${C.line};border-radius:8px;padding:8px 10px;margin:6px 0">${rowsTable(rows)}</div>`);
  }
  if (data.departure) blocks.push(rowsTable([data.departure]));
  return blocks.join('');
}

export function driverBadges(d: EmailDriver): string[] {
  return [d.isKekeCertified ? 'KEKE Certified' : '', d.isGuideDriver ? 'გიდ-მძღოლი' : ''].filter(Boolean);
}

export function driverRows(d: EmailDriver): Row[] {
  const rating = d.ratingCount > 0 && d.ratingAverage
    ? `${d.ratingAverage.toFixed(1)} (${d.ratingCount} შეფასება)`
    : '';
  const langs = d.languages.map((c) => LANGUAGE[c] ?? c).filter(Boolean).join(', ');
  return [
    ['ტელეფონი', clean(d.phone) || '—', d.phone ? phoneHref(d.phone) : undefined],
    ['შეფასება', rating || '—'],
    ['ენები', langs || '—'],
  ];
}

export function vehicleRows(v: EmailVehicle): Row[] {
  return [
    ['მარკა / მოდელი / წელი', vehicleLine(v) || '—'],
    ['ნომერი', clean(v.plate) || '—'],
    ['ფერი', clean(v.color) || '—'],
    ['ტიპი', VEHICLE_TYPE[String(v.type ?? '')] ?? '—'],
    ['კლასი', VEHICLE_CLASS[String(v.vehicleClass ?? '')] ?? '—'],
  ];
}

export function hostRows(h: NonNullable<EmailHost>): Row[] {
  return [
    ['სახელი', clean(h.fullName) || '—'],
    ['ტელეფონი', clean(h.phone) || '—', h.phone ? phoneHref(h.phone) : undefined],
  ];
}

function driverBlock(d: EmailDriver | null): string {
  if (!d) return '';
  const badges = driverBadges(d);
  const avatar = d.avatarUrl
    ? `<img src="${escapeHtml(d.avatarUrl)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:28px;object-fit:cover;border:0">`
    : '';
  const rows = rowsTable(driverRows(d));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${avatar ? `<td style="width:68px;vertical-align:top;padding:2px 12px 0 0">${avatar}</td>` : ''}
<td style="vertical-align:top">
<div style="font-size:16px;font-weight:bold;color:${C.ink}">${escapeHtml(clean(d.fullName) || '—')}</div>
${badges.length ? `<div style="margin:4px 0 2px 0">${badges.map((x) => `<span style="display:inline-block;background:#FFF4DE;color:${C.goldDark};font-size:11px;font-weight:bold;padding:2px 8px;border-radius:10px;margin:0 4px 4px 0">${escapeHtml(x)}</span>`).join('')}</div>` : ''}
${rows}
</td></tr></table>`;
}

function vehicleBlock(v: EmailVehicle | null): string {
  if (!v) return '';
  const img = v.photoUrl
    ? `<img src="${escapeHtml(v.photoUrl)}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:10px;margin:4px 0 8px 0;border:0">`
    : '';
  return img + rowsTable(vehicleRows(v));
}

// ── the email ───────────────────────────────────────────────────────────────

export function renderBookingEmail(input: EmailInput): RenderedEmail {
  const b = input.booking;
  const L = lines(input);
  const code = voucherCode(b);
  const price = formatGel(offeredPriceGel(b));
  const notes = priceNotes(b);
  const legTag = b.parent_booking_id && b.leg_index ? ` · მანქანა ${b.leg_index}` : '';
  const accent = input.event === 'completed' ? C.green : C.gold;

  const html = `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(L.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(L.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:14px">
<tr><td style="padding:24px 24px 8px 24px;text-align:center">
<div style="font-size:22px;font-weight:900;letter-spacing:3px;color:${C.gold}">KEKE MANAGER</div>
<div style="font-size:12px;color:${C.muted};margin-top:4px">B2B ტურისტული სატრანსპორტო პლატფორმა</div>
</td></tr>
<tr><td style="padding:8px 24px 0 24px">
<div style="border-left:4px solid ${accent};padding:6px 0 6px 12px">
<div style="font-size:20px;font-weight:bold;color:${C.ink}">${escapeHtml(L.heading)}${escapeHtml(legTag)}</div>
<div style="font-size:14px;color:${C.ink};margin-top:6px;line-height:1.5">${escapeHtml(L.intro)}</div>
</div>
</td></tr>
<tr><td style="padding:16px 24px 8px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px dashed ${C.gold};border-radius:14px">
<tr><td style="padding:16px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 0 12px 0">
<div style="font-size:12px;color:${C.muted}">ვაუჩერი</div>
<div style="font-size:22px;font-weight:900;color:${C.gold};letter-spacing:1px">${escapeHtml(code)}</div>
${input.companyName ? `<div style="font-size:13px;color:${C.muted};margin-top:2px">${escapeHtml(clean(input.companyName))}</div>` : ''}
<div style="font-size:18px;font-weight:bold;color:${C.green};margin-top:8px">ფასი: ${escapeHtml(price)}</div>
${notes.map((n) => `<div style="font-size:12px;color:${C.muted};margin-top:2px">${escapeHtml(n)}</div>`).join('')}
</td></tr>
${section('ჯავშანი', rowsTable(bookingRows(b)) + tourRows(b))}
${section('მძღოლი', driverBlock(input.driver))}
${section('მანქანა', vehicleBlock(input.vehicle))}
${input.host ? section('ჰოსტი', rowsTable(hostRows(input.host))) : ''}
</table>
</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:12px 24px 24px 24px">
<a href="${escapeHtml(input.voucherUrl)}" style="display:inline-block;background:${C.gold};color:#111111;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:10px">ვაუჩერი KEKE Manager-ში</a>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td style="padding:14px 24px;text-align:center;font-size:11px;color:${C.muted};line-height:1.6">
ეს წერილი ავტომატურად გამოიგზავნა KEKE Manager-იდან.<br>
კითხვები: <a href="mailto:info@kekemanager.com" style="color:${C.muted}">info@kekemanager.com</a> · +995 551 003 411
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textRows = (rows: Row[]) =>
    rows.filter(([, v]) => v && v !== '—').map(([l, v]) => `${l}: ${v}`).join('\n');
  const d = input.driver;
  const v = input.vehicle;
  const text = [
    'KEKE MANAGER',
    '',
    `${L.heading}${legTag}`,
    L.intro,
    '',
    `ვაუჩერი: ${code}`,
    `ფასი: ${price}`,
    ...notes,
    '',
    textRows(bookingRows(b)),
    d ? `\nმძღოლი: ${clean(d.fullName) || '—'}${d.phone ? `, ${clean(d.phone)}` : ''}` : '',
    v ? `მანქანა: ${[vehicleLine(v), clean(v.plate), clean(v.color)].filter(Boolean).join(', ') || '—'}` : '',
    '',
    `ვაუჩერი ონლაინ: ${input.voucherUrl}`,
    '',
    'KEKE Manager · info@kekemanager.com · +995 551 003 411',
  ].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');

  return { subject: L.subject, html, text };
}
