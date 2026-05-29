import type { ItineraryDay, TourDayPersisted, TourTransferLeg } from './bookings';
import { formatLocationDisplay } from './bookingLocations';
import { formatDisplayDateTime, formatStoredDateForDisplay, parseStoredDateTime, toIsoString } from './dateTime';

/** Form state for one calendar day in a multi-day tour. */
export type TourDayForm = {
  day: number;
  /** YYYY-MM-DD */
  date: string;
  from: string;
  to: string;
  stops: string;
  touristHotel: string;
  driverOvernight: string;
};

const MAX_TOUR_DAYS = 45;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function toDateOnlyString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateOnly(value: string | null | undefined): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }
  return startOfDay(new Date(raw));
}

export function countTourOvernights(dayCount: number): number {
  return Math.max(0, dayCount - 1);
}

export function generateTourDaysFromRange(
  start: Date,
  end: Date,
  previous: TourDayForm[],
): TourDayForm[] {
  const s = startOfDay(start);
  const e = startOfDay(end);
  if (e.getTime() < s.getTime()) return [];

  const count = Math.min(
    MAX_TOUR_DAYS,
    Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1,
  );

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(s);
    d.setDate(d.getDate() + i);
    const date = toDateOnlyString(d);
    const prev =
      previous.find((p) => p.date === date) ??
      previous[i];
    return {
      day: i + 1,
      date,
      from: prev?.from ?? '',
      to: prev?.to ?? '',
      stops: prev?.stops ?? '',
      touristHotel: prev?.touristHotel ?? '',
      driverOvernight: prev?.driverOvernight ?? '',
    };
  });
}

function stopsToString(stops: string | string[] | undefined): string {
  if (Array.isArray(stops)) return stops.filter(Boolean).join(', ');
  return String(stops ?? '').trim();
}

function readTourDayHotel(d: TourDayPersisted): string {
  const v =
    d.touristHotel ??
    (d as { tourist_hotel?: string }).tourist_hotel ??
    '';
  return String(v).trim();
}

function readTourDayOvernight(d: TourDayPersisted): string {
  const v =
    d.driverOvernight ??
    (d as { driver_overnight?: string }).driver_overnight ??
    '';
  return String(v).trim();
}

export function persistTourDaysForDb(days: TourDayForm[]): TourDayPersisted[] {
  const lastIdx = days.length - 1;
  return days.map((d, idx) => ({
    day: idx + 1,
    date: d.date,
    fromPlace: d.from.trim(),
    toPlace: d.to.trim(),
    stops: d.stops.trim(),
    ...(idx < lastIdx
      ? {
          touristHotel: d.touristHotel.trim() || undefined,
          driverOvernight: d.driverOvernight.trim() || undefined,
        }
      : {}),
  }));
}

export function itineraryFromTourDays(days: TourDayPersisted[]): ItineraryDay[] {
  return days.map((d) => ({
    day: d.day,
    from: d.fromPlace,
    to: d.toPlace,
    stops: stopsToString(d.stops),
  }));
}

export function tourEndpointsFromDays(days: TourDayPersisted[]): {
  from: string | null;
  to: string | null;
} {
  if (!days.length) return { from: null, to: null };
  return {
    from: days[0].fromPlace.trim() || null,
    to: days[days.length - 1].toPlace.trim() || null,
  };
}

export function buildTourRouteText(
  days: TourDayPersisted[],
  formatDayLine: (day: number, from: string, to: string) => string,
): string | null {
  const parts = days
    .map((d) => {
      const f = d.fromPlace.trim();
      const t = d.toPlace.trim();
      if (!f && !t) return null;
      return formatDayLine(d.day, f || '—', t || '—');
    })
    .filter((x): x is string => !!x);
  return parts.length ? parts.join(' | ') : null;
}

function formatDayDate(date: string): string {
  const parsed = parseDateOnly(date);
  if (!parsed) return date;
  return parsed.toLocaleDateString('ka-GE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTransferLeg(label: string, leg: TourTransferLeg | null | undefined): string | null {
  if (!leg) return null;
  const when = leg.date ? formatStoredDateForDisplay(leg.date) : '—';
  const airport = formatLocationDisplay(leg.airport, leg.airport_type);
  const hotel = formatLocationDisplay(leg.hotel, leg.hotel_type);
  const route =
    airport !== '—' && hotel !== '—'
      ? `${airport} → ${hotel}`
      : airport !== '—'
        ? airport
        : hotel !== '—'
          ? hotel
          : leg.flight?.trim() || '';
  if (!route && !when) return null;
  return `${label}: ${when}${route ? ` · ${route}` : ''}`;
}

/** Short multiline summary for push / in-app notifications. */
export function formatTourBookingNotificationBody(booking: {
  tour_days?: TourDayPersisted[] | null;
  transfer_in?: TourTransferLeg | null;
  transfer_out?: TourTransferLeg | null;
}): string {
  const lines: string[] = [];
  const tin = formatTransferLeg('ჩამოსვლა', booking.transfer_in);
  const tout = formatTransferLeg('გამგზავრება', booking.transfer_out);
  if (tin) lines.push(tin);
  (booking.tour_days ?? []).forEach((d, idx, arr) => {
    const route = `${d.fromPlace || '—'} → ${d.toPlace || '—'}`;
    let line = `დღე ${d.day} (${formatDayDate(d.date)}): ${route}`;
    const stops = stopsToString(d.stops);
    if (stops) line += ` · გაჩ.: ${stops}`;
    const isLast = idx === arr.length - 1;
    const hotel = readTourDayHotel(d);
    const overnight = readTourDayOvernight(d);
    if (!isLast && hotel) line += ` · სასტ.: ${hotel}`;
    if (!isLast && overnight) line += ` · მძღ.ღამე: ${overnight}`;
    lines.push(line);
  });
  if (tout) lines.push(tout);
  const nights = countTourOvernights(booking.tour_days?.length ?? 0);
  if (nights > 0) lines.push(`სულ ღამე: ${nights}`);
  return lines.join('\n').slice(0, 900);
}

/** HTML rows for voucher PDF. */
export function tourVoucherHtmlRows(booking: {
  tour_days?: TourDayPersisted[] | null;
  transfer_in?: TourTransferLeg | null;
  transfer_out?: TourTransferLeg | null;
}): string {
  const rows: string[] = [];
  const tin = booking.transfer_in;
  if (tin && (tin.date || tin.airport || tin.hotel)) {
    const from = formatLocationDisplay(tin.airport, tin.airport_type);
    const to = formatLocationDisplay(tin.hotel, tin.hotel_type);
    const route =
      from !== '—' && to !== '—'
        ? `${from} → ${to}`
        : [from !== '—' ? from : '', to !== '—' ? to : ''].filter(Boolean).join(' → ');
    rows.push(
      `<div class="row"><span class="label">ჩამოსვლის ტრანსფერი</span><span class="value">${escapeHtml(
        [formatStoredDateForDisplay(tin.date), route].filter((x) => x && x !== '—').join(' · '),
      )}</span></div>`,
    );
  }
  const tourDays = booking.tour_days ?? [];
  tourDays.forEach((d, idx) => {
    const isLast = idx === tourDays.length - 1;
    if (idx > 0) {
      rows.push('<div class="divider"></div>');
    }
    rows.push(
      `<div class="row"><span class="label">თარიღი (დღე ${d.day})</span><span class="value">${escapeHtml(
        formatDayDate(d.date),
      )}</span></div>`,
    );
    rows.push(
      `<div class="row"><span class="label">მარშრუტი</span><span class="value">${escapeHtml(
        `${d.fromPlace || '—'} → ${d.toPlace || '—'}`,
      )}</span></div>`,
    );
    rows.push(
      `<div class="row"><span class="label">გაჩერებები</span><span class="value">${escapeHtml(
        stopsToString(d.stops) || '—',
      )}</span></div>`,
    );
    if (!isLast) {
      rows.push(
        `<div class="row"><span class="label">ტურისტების სასტუმრო</span><span class="value">${escapeHtml(
          readTourDayHotel(d) || '—',
        )}</span></div>`,
      );
      rows.push(
        `<div class="row"><span class="label">მძღოლის ღამისთევა</span><span class="value">${escapeHtml(
          readTourDayOvernight(d) || '—',
        )}</span></div>`,
      );
    }
  });
  const nights = countTourOvernights(tourDays.length);
  if (nights > 0) {
    rows.push('<div class="divider"></div>');
    rows.push(
      `<div class="row"><span class="label">სულ ღამე</span><span class="value">${nights}</span></div>`,
    );
  }
  const tout = booking.transfer_out;
  if (tout && (tout.date || tout.airport || tout.hotel)) {
    const from = formatLocationDisplay(tout.hotel, tout.hotel_type);
    const to = formatLocationDisplay(tout.airport, tout.airport_type);
    const route =
      from !== '—' && to !== '—'
        ? `${from} → ${to}`
        : [from !== '—' ? from : '', to !== '—' ? to : ''].filter(Boolean).join(' → ');
    rows.push(
      `<div class="row"><span class="label">გამგზავრების ტრანსფერი</span><span class="value">${escapeHtml(
        [formatStoredDateForDisplay(tout.date), route].filter((x) => x && x !== '—').join(' · '),
      )}</span></div>`,
    );
  }
  return rows.join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function tourBookingPrimaryDateIso(
  tourStart: Date | null,
  transferInAt: Date | null,
  transferOutAt: Date | null,
): string | null {
  if (tourStart) return toIsoString(tourStart);
  if (transferInAt) return toIsoString(transferInAt);
  if (transferOutAt) return toIsoString(transferOutAt);
  return null;
}
