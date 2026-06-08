import { formatLocationDisplay } from './bookingLocations';
import { bookingKindLabel } from './bookingLabels';
import { formatBookingDisplayNumber, stripVoucherEmojis } from './bookingVoucherDisplay';
import type { CompanyVoucherData } from './companyVoucherData';
import { vehicleMakeModelYearLine } from './companyVoucherData';
import { formatStoredDateForDisplay, parseStoredDateTime } from './dateTime';
import { tourVoucherHtmlRows, type TourVoucherHtmlLabels } from './tourDays';
import {
  touristVoucherDateLocale,
  touristVoucherStrings,
  type TouristVoucherLocale,
} from './touristVoucherLocale';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label: string, value: string): string {
  const clean = stripVoucherEmojis(value);
  if (!clean.trim()) return '';
  return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(clean)}</span></div>`;
}

function sectionTitle(title: string): string {
  return `<div class="section-title">${escapeHtml(stripVoucherEmojis(title))}</div>`;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''));
}

function formatBookingDateForLocale(dateDisplay: string | null | undefined, locale: TouristVoucherLocale): string {
  const parsed = parseStoredDateTime(dateDisplay);
  const d = parsed ?? (dateDisplay?.trim() ? new Date(dateDisplay.trim()) : null);
  if (!d || Number.isNaN(d.getTime())) return dateDisplay?.trim() || '—';
  return d.toLocaleString(touristVoucherDateLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayDateForLocale(date: string, locale: TouristVoucherLocale): string {
  const parsed = parseStoredDateTime(date);
  const d = parsed ?? new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(touristVoucherDateLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function pickupSignHtml(
  booking: CompanyVoucherData['booking'],
  s: ReturnType<typeof touristVoucherStrings>,
): string {
  const parts: string[] = [];
  const signName = booking.sign_text?.trim();
  const logoUrl = booking.pickup_sign_logo_url?.trim();

  if (signName) {
    parts.push(row(s.pickupSignName, signName));
  }

  if (logoUrl) {
    const safeUrl = escapeHtml(logoUrl);
    const isPdf = /\.pdf(\?|$)/i.test(logoUrl);
    parts.push('<div class="divider"></div>');
    parts.push('<div style="text-align:center;margin:16px 0">');
    parts.push(
      `<div style="font-size:13px;color:#888;font-weight:600;margin-bottom:10px">${escapeHtml(s.pickupSignLogo)}</div>`,
    );
    if (isPdf) {
      parts.push(
        `<a href="${safeUrl}" target="_blank" rel="noopener" style="color:#B45309;font-weight:700;font-size:14px">${escapeHtml(s.pickupSignPdfHint)}</a>`,
      );
    } else {
      parts.push(
        `<img src="${safeUrl}" alt="" style="max-width:400px;max-height:200px;width:auto;height:auto;display:block;margin:0 auto;border-radius:8px" />`,
      );
    }
    parts.push('</div>');
  }

  return parts.join('\n');
}

function tourLabels(
  s: ReturnType<typeof touristVoucherStrings>,
  locale: TouristVoucherLocale,
): TourVoucherHtmlLabels {
  return {
    transferArrival: s.transferArrival,
    transferDeparture: s.transferDeparture,
    dateDay: (day) => `${interpolate(s.day, { day })} · ${s.date}`,
    route: s.route,
    stops: s.stops,
    touristHotel: s.hotel,
    driverOvernight: s.overnight,
    totalNights: s.totalNights,
    formatDayDate: (date) => formatDayDateForLocale(date, locale),
  };
}

const VOUCHER_STYLES = `
  body { font-family: Arial, sans-serif; padding: 32px; background: #fff; color: #111; }
  .header { text-align: center; margin-bottom: 24px; }
  .logo { font-size: 26px; font-weight: 900; color: #F5A623; letter-spacing: 3px; }
  .subtitle { color: #666; font-size: 13px; margin-top: 4px; }
  .voucher-box { border: 3px dashed #F5A623; border-radius: 16px; padding: 24px; }
  .voucher-id { font-size: 22px; font-weight: 900; color: #F5A623; margin: 8px 0 16px; }
  .booking-number { font-size: 15px; font-weight: 800; color: #111; margin: 12px 0 6px; }
  .company-line { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 8px; }
  .status { display: inline-block; background: #F5A623; color: #000;
    padding: 4px 14px; border-radius: 20px; font-weight: 700; font-size: 12px; }
  .divider { border-top: 1px solid #eee; margin: 14px 0; }
  .section-title { font-size: 14px; font-weight: 800; color: #111; margin: 12px 0 8px; }
  .row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .label { color: #888; font-size: 12px; flex: 1; }
  .value { color: #111; font-size: 12px; font-weight: 600; flex: 1.2; text-align: right; }
  .driver-card { display: flex; gap: 14px; align-items: flex-start; margin-top: 8px; }
  .avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; background: #f3f3f3; }
  .avatar-ph { width: 56px; height: 56px; border-radius: 50%; background: #F5A623; color: #000;
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; }
  .driver-meta { flex: 1; }
  .driver-name { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
  .badge { font-size: 11px; font-weight: 700; margin-right: 6px; }
  .vehicle-img { max-width: 100%; max-height: 180px; border-radius: 10px; margin: 8px 0; display: block; }
  .footer { text-align: center; margin-top: 24px; color: #aaa; font-size: 11px; }
`;

export function generateTouristVoucherHTML(
  data: CompanyVoucherData,
  locale: TouristVoucherLocale,
): string {
  const { booking, driver, vehicle } = data;
  const s = touristVoucherStrings(locale);
  const voucherCode =
    booking.voucher_code?.trim() || `KEKE-${booking.id.slice(0, 6).toUpperCase()}`;
  const tag = 'div';
  const bookingNumber = formatBookingDisplayNumber(booking.id);
  const companyName = booking.company_name?.trim() || '—';
  const isTour = booking.kind === 'tour' || booking.kind === 'day_tour';

  const bookingSection = [
    row(s.type, bookingKindLabel(booking.kind, booking.flight_direction, locale)),
    row(s.date, formatBookingDateForLocale(booking.date_display, locale)),
    booking.from_location
      ? row(s.from, formatLocationDisplay(booking.from_location, booking.from_location_type, { withIcon: false }))
      : '',
    booking.to_location
      ? row(s.to, formatLocationDisplay(booking.to_location, booking.to_location_type, { withIcon: false }))
      : '',
    row(s.passengers, String(booking.passengers ?? 1)),
    booking.flight_number?.trim() ? row(s.flightNumber, booking.flight_number.trim()) : '',
    pickupSignHtml(booking, s),
    booking.comment?.trim() ? row(s.notes, booking.comment.trim()) : '',
    isTour ? tourVoucherHtmlRows(booking, tourLabels(s, locale)) : '',
  ].join('\n');

  let driverSection = '';
  if (driver) {
    const initials = (driver.fullName ?? '?')
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const avatarHtml = driver.avatarUrl
      ? `<img class="avatar" src="${escapeHtml(driver.avatarUrl)}" alt="" />`
      : `<div class="avatar-ph">${escapeHtml(initials)}</div>`;
    const badges = [
      driver.isGuideDriver ? `<span class="badge">${escapeHtml(s.guideDriver)}</span>` : '',
      driver.isVerified ? `<span class="badge">${escapeHtml(s.verified)}</span>` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const ratingLine =
      driver.ratingCount > 0
        ? interpolate(s.ratingFormat, {
            avg: driver.ratingAverage.toFixed(1),
            count: driver.ratingCount,
          })
        : '—';
    driverSection = `
      ${sectionTitle(s.sectionDriver)}
      <div class="driver-card">
        ${avatarHtml}
        <div class="driver-meta">
          <div class="driver-name">${escapeHtml(driver.fullName ?? '—')}</div>
          <div>${badges}</div>
          <div style="font-size:12px;margin-top:4px">${escapeHtml(ratingLine)}</div>
          ${driver.phone ? `<div style="font-size:12px;margin-top:4px"><a href="tel:${escapeHtml(driver.phone.replace(/\s/g, ''))}">${escapeHtml(driver.phone)}</a></div>` : `<div style="font-size:12px;margin-top:4px;color:#888">${escapeHtml(s.phoneMissing)}</div>`}
          ${driver.languagesLabel ? row(s.languages, driver.languagesLabel) : ''}
          ${driver.city ? row(s.city, driver.city) : ''}
        </div>
      </div>`;
  }

  let vehicleSection = '';
  if (vehicle) {
    const mmY = vehicleMakeModelYearLine(vehicle);
    const img = vehicle.mainPhotoUrl
      ? `<img class="vehicle-img" src="${escapeHtml(vehicle.mainPhotoUrl)}" alt="vehicle" />`
      : '';
    vehicleSection = `
      ${sectionTitle(s.sectionVehicle)}
      ${img}
      ${row(s.makeModelYear, mmY)}
      ${vehicle.plate ? row(s.plate, vehicle.plate) : ''}
      ${vehicle.color ? row(s.color, vehicle.color) : ''}
      ${vehicle.typeLabel ? row(s.vehicleType, vehicle.typeLabel) : ''}
      ${vehicle.classLabel ? row(s.vehicleClass, vehicle.classLabel) : ''}`;
  }

  const footerDate = new Date().toLocaleDateString(touristVoucherDateLocale(locale));

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <style>${VOUCHER_STYLES}</style>
</head>
<body>
  <${tag} class="header">
    <${tag} class="logo">KEKE MANAGER</${tag}>
    <${tag} class="subtitle">${escapeHtml(s.brandSubtitle)}</${tag}>
  </${tag}>
  <${tag} class="voucher-box">
    <span class="status">${escapeHtml(s.badge)}</span>
    <${tag} class="booking-number">${escapeHtml(stripVoucherEmojis(`${s.bookingNumber} ${bookingNumber}`))}</${tag}>
    <${tag} class="company-line">${escapeHtml(s.company)}: ${escapeHtml(companyName)}</${tag}>
    <${tag} class="voucher-id">${escapeHtml(voucherCode)}</${tag}>
    <${tag} class="divider"></${tag}>
    ${sectionTitle(s.sectionBooking)}
    ${bookingSection}
    ${driverSection ? `<${tag} class="divider"></${tag}>${driverSection}` : ''}
    ${vehicleSection ? `<${tag} class="divider"></${tag}>${vehicleSection}` : ''}
  </${tag}>
  <${tag} class="footer">${escapeHtml(s.footer)} • ${escapeHtml(footerDate)}</${tag}>
</body>
</html>`;
}

export function formatTouristBookingDate(
  dateDisplay: string | null | undefined,
  locale: TouristVoucherLocale,
): string {
  return formatBookingDateForLocale(dateDisplay, locale);
}

export { formatStoredDateForDisplay };
