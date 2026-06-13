import { formatLocationDisplay } from './bookingLocations';
import { bookingOfferedPriceGel } from './bookingPrice';
import { formatBookingDisplayNumber, formatVoucherPriceGel, stripVoucherEmojis } from './bookingVoucherDisplay';
import type { CompanyVoucherConvoyLeg, CompanyVoucherData } from './companyVoucherData';
import { convoyVoucherCode, vehicleMakeModelYearLine } from './companyVoucherData';
import type { ConvoyPeerLeg } from './convoyPeers';
import { vehicleClassLabel, vehicleTypeLabel } from './vehicleCatalog';
import { bookingKindLabel } from './bookingLabels';
import { formatStoredDateForDisplay } from './dateTime';
import { tourVoucherHtmlRows } from './tourDays';
import { pickupSignVoucherHtmlSection } from './voucherPickupSign';

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

const VOUCHER_STYLES = `
  body { font-family: Arial, sans-serif; padding: 32px; background: #fff; color: #111; }
  .header { text-align: center; margin-bottom: 24px; }
  .logo { font-size: 26px; font-weight: 900; color: #F5A623; letter-spacing: 3px; }
  .subtitle { color: #666; font-size: 13px; margin-top: 4px; }
  .voucher-box { border: 3px dashed #F5A623; border-radius: 16px; padding: 24px; }
  .voucher-id { font-size: 22px; font-weight: 900; color: #F5A623; margin: 8px 0 16px; }
  .booking-number { font-size: 15px; font-weight: 800; color: #111; margin: 12px 0 6px; }
  .price-offer { font-size: 20px; font-weight: 900; color: #16a34a; margin: 0 0 14px; }
  .status { display: inline-block; background: #F5A623; color: #000;
    padding: 4px 14px; border-radius: 20px; font-weight: 700; font-size: 12px; }
  .updated-badge { display: inline-block; background: #FEE2E2; color: #B91C1C;
    padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-left: 8px; }
  .divider { border-top: 1px solid #eee; margin: 14px 0; }
  .section-title { font-size: 14px; font-weight: 800; color: #111; margin: 12px 0 8px; }
  .row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .label { color: #888; font-size: 12px; flex: 1; }
  .value { color: #111; font-size: 12px; font-weight: 600; flex: 1.2; text-align: right; }
  .price { font-size: 26px; font-weight: 900; color: #F5A623; text-align: right; margin-top: 12px; }
  .driver-card { display: flex; gap: 14px; align-items: flex-start; margin-top: 8px; }
  .avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; background: #f3f3f3; }
  .avatar-ph { width: 56px; height: 56px; border-radius: 50%; background: #F5A623; color: #000;
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; }
  .driver-meta { flex: 1; }
  .driver-name { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
  .badge { font-size: 11px; font-weight: 700; margin-right: 6px; }
  .vehicle-img { max-width: 100%; max-height: 180px; border-radius: 10px; margin: 8px 0; display: block; }
  .footer { text-align: center; margin-top: 24px; color: #aaa; font-size: 11px; }
  .tour-day { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 10px; margin-bottom: 8px; }
  .tour-day-title { font-weight: 700; font-size: 12px; color: #B45309; }
  .tour-day-body { font-size: 12px; color: #333; margin-top: 4px; }
  .convoy-leg { border: 1px solid #eee; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #fafafa; }
  .convoy-leg-title { font-weight: 800; font-size: 13px; color: #B45309; margin-bottom: 8px; }
`;

function convoyLegHtml(leg: CompanyVoucherConvoyLeg): string {
  const { booking, driver, vehicle } = leg;
  const legPrice = formatVoucherPriceGel(bookingOfferedPriceGel(booking));
  const typeLabel = booking.vehicle_type
    ? vehicleTypeLabel(booking.vehicle_type)
    : vehicle?.typeLabel ?? '—';
  const classLabel = booking.vehicle_class
    ? vehicleClassLabel(booking.vehicle_class)
    : vehicle?.classLabel ?? '—';

  let driverBlock = '<div style="font-size:12px;color:#888">მძღოლი ჯერ არ არის მინიჭებული</div>';
  if (driver) {
    driverBlock = `
      <div style="font-size:12px;font-weight:700">${escapeHtml(driver.fullName ?? '—')}</div>
      ${driver.phone ? `<div style="font-size:12px"><a href="tel:${escapeHtml(driver.phone.replace(/\s/g, ''))}">${escapeHtml(driver.phone)}</a></div>` : ''}`;
  }

  let vehicleBlock = '';
  if (vehicle) {
    const mmY = vehicleMakeModelYearLine(vehicle);
    vehicleBlock = `
      ${vehicle.plate ? row('ნომერი', vehicle.plate) : ''}
      ${row('მარკა / მოდელი / წელი', mmY)}`;
  }

  return `
    <div class="convoy-leg">
      <div class="convoy-leg-title">მანქანა ${leg.legIndex}</div>
      ${row('ტიპი', typeLabel)}
      ${row('კლასი', classLabel)}
      ${row('მგზავრები', String(booking.passengers ?? 1))}
      ${row('ფასი', legPrice)}
      ${row('სტატუსი', booking.status ?? 'pending')}
      ${sectionTitle('მძღოლი')}
      ${driverBlock}
      ${vehicleBlock ? `${sectionTitle('მანქანა')}${vehicleBlock}` : ''}
    </div>`;
}

function convoyPeerLegHtml(leg: ConvoyPeerLeg): string {
  const typeLabel = leg.vehicleTypeLabel ?? leg.vehicleType ?? '—';
  const classLabel = leg.vehicleClassLabel ?? leg.vehicleClass ?? '—';
  const ownMark = leg.isOwnLeg ? ' · თქვენი მანქანა' : '';

  return `
    <div class="convoy-leg${leg.isOwnLeg ? ' convoy-peer-own' : ''}">
      <div class="convoy-leg-title">მანქანა ${leg.legIndex}${escapeHtml(ownMark)}</div>
      ${row('ტიპი', typeLabel)}
      ${row('კლასი', classLabel)}
      ${row('მგზავრები', String(leg.passengers))}
      ${row('მძღოლი', leg.driverName ?? '—')}
    </div>`;
}

export function generateCompanyVoucherHTML(data: CompanyVoucherData): string {
  const { booking, driver, vehicle, host, convoyLegs, convoyPeerLegs } = data;
  const isConvoy = !!(booking.is_group_master && convoyLegs && convoyLegs.length > 0);
  const hasConvoyPeers = !!(convoyPeerLegs && convoyPeerLegs.length > 0);
  const voucherCode = isConvoy
    ? convoyVoucherCode(booking)
    : booking.group_code?.trim() ||
      booking.voucher_code?.trim() ||
      `KEKE-${booking.id.slice(0, 6).toUpperCase()}`;
  const tag = 'div';

  const updatedBadge =
    booking.driver_update_pending && booking.updated_at
      ? `<span class="updated-badge">განახლდა ${escapeHtml(formatStoredDateForDisplay(booking.updated_at.slice(0, 10)))}</span>`
      : '';

  const bookingNumber = formatBookingDisplayNumber(booking.id);
  const offeredGel = bookingOfferedPriceGel(booking);
  const priceLine = formatVoucherPriceGel(offeredGel);

  const bookingSection = [
    row('ტიპი', bookingKindLabel(booking.kind, booking.flight_direction)),
    row('თარიღი', formatStoredDateForDisplay(booking.date_display)),
    booking.from_location
      ? row('საიდან', formatLocationDisplay(booking.from_location, booking.from_location_type, { withIcon: false }))
      : '',
    booking.to_location
      ? row('სად', formatLocationDisplay(booking.to_location, booking.to_location_type, { withIcon: false }))
      : '',
    row('მგზავრები', String(booking.passengers ?? 1)),
    booking.flight_number?.trim()
      ? row('ფრენის ნომერი', booking.flight_number.trim())
      : '',
    booking.sign_text?.trim() ? row('დასახვედრი სახელი', booking.sign_text.trim()) : '',
    pickupSignVoucherHtmlSection(booking),
    booking.comment?.trim() ? row('შენიშვნა', booking.comment.trim()) : '',
    booking.kind === 'tour' || booking.kind === 'day_tour' ? tourVoucherHtmlRows(booking) : '',
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
      driver.isGuideDriver ? '<span class="badge">გიდ-მძღოლი</span>' : '',
      driver.isVerified ? '<span class="badge">Verified</span>' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const ratingLine =
      driver.ratingCount > 0
        ? `${driver.ratingAverage.toFixed(1)} (${driver.ratingCount} შეფასება)`
        : '—';
    driverSection = `
      ${sectionTitle('მძღოლი')}
      <div class="driver-card">
        ${avatarHtml}
        <div class="driver-meta">
          <div class="driver-name">${escapeHtml(driver.fullName ?? '—')}</div>
          <div>${badges}</div>
          <div style="font-size:12px;margin-top:4px">${escapeHtml(ratingLine)}</div>
          ${driver.phone ? `<div style="font-size:12px;margin-top:4px"><a href="tel:${escapeHtml(driver.phone.replace(/\s/g, ''))}">${escapeHtml(driver.phone)}</a></div>` : '<div style="font-size:12px;margin-top:4px;color:#888">ტელეფონი არ არის მითითებული</div>'}
          ${driver.languagesLabel ? row('ენები', driver.languagesLabel) : ''}
          ${driver.city ? row('ქალაქი', driver.city) : ''}
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
      ${sectionTitle('მანქანა')}
      ${img}
      ${row('მარკა / მოდელი / წელი', mmY)}
      ${vehicle.plate ? row('ნომერი', vehicle.plate) : ''}
      ${vehicle.color ? row('ფერი', vehicle.color) : ''}
      ${vehicle.typeLabel ? row('ტიპი', vehicle.typeLabel) : ''}
      ${vehicle.classLabel ? row('კლასი', vehicle.classLabel) : ''}`;
  }

  let hostSection = '';
  if (host) {
    hostSection = `
      ${sectionTitle('ჰოსტი')}
      ${row('სახელი', host.fullName ?? '—')}
      ${host.phone ? row('ტელეფონი', host.phone) : ''}`;
  }

  let convoySection = '';
  if (isConvoy && convoyLegs) {
    convoySection = `
      ${sectionTitle(`მანქანები (${convoyLegs.length})`)}
      ${convoyLegs.map(convoyLegHtml).join('\n')}`;
  }

  let convoyPeerSection = '';
  if (hasConvoyPeers && convoyPeerLegs) {
    convoyPeerSection = `
      ${sectionTitle(`სხვა მანქანები (${convoyPeerLegs.length})`)}
      ${convoyPeerLegs.map(convoyPeerLegHtml).join('\n')}`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${VOUCHER_STYLES}</style>
</head>
<body>
  <${tag} class="header">
    <${tag} class="logo">KEKE MANAGER</${tag}>
    <${tag} class="subtitle">B2B სატრანსპორტო პლატფორმა</${tag}>
  </${tag}>
  <${tag} class="voucher-box">
    <span class="status">ვაუჩერი</span>${updatedBadge}
    <${tag} class="booking-number">${escapeHtml(stripVoucherEmojis(`ჯავშანი ${bookingNumber}`))}</${tag}>
    <${tag} class="price-offer">${escapeHtml(stripVoucherEmojis(`კლიენტის ფასი: ${priceLine}`))}</${tag}>
    <${tag} class="price-offer">${escapeHtml(stripVoucherEmojis(`მძღოლი: ${priceLine}`))}</${tag}>
    <${tag} class="voucher-id">${escapeHtml(voucherCode)}</${tag}>
    <${tag} class="divider"></${tag}>
    ${sectionTitle('ჯავშანი')}
    ${bookingSection}
    ${convoySection ? `<${tag} class="divider"></${tag}>${convoySection}` : ''}
    ${convoyPeerSection ? `<${tag} class="divider"></${tag}>${convoyPeerSection}` : ''}
    ${!isConvoy && driverSection ? `<${tag} class="divider"></${tag}>${driverSection}` : ''}
    ${!isConvoy && vehicleSection ? `<${tag} class="divider"></${tag}>${vehicleSection}` : ''}
    ${!isConvoy && hostSection ? `<${tag} class="divider"></${tag}>${hostSection}` : ''}
  </${tag}>
  <${tag} class="footer">KEKE Manager • ${new Date().toLocaleDateString('ka-GE')}</${tag}>
</body>
</html>`;
}
