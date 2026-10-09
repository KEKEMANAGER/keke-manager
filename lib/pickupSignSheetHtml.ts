import type { BookingRow } from './bookings';

/**
 * The sheet a driver holds up in the arrivals hall.
 *
 * It is deliberately not the voucher. The voucher is for reading — flight,
 * price, phone numbers, notes. This is for being read, from across a hall, by
 * someone who has just walked out of passport control and is looking for their
 * name. So it carries the name, the logo, and nothing else: one landscape page,
 * black on white, with the name set as large as it will fit.
 */

const A4_LANDSCAPE_WIDTH_MM = 297;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The name on the sign: what the company wrote for the board, else the guest. */
export function pickupSignName(booking: BookingRow): string {
  return booking.sign_text?.trim() || booking.passenger_name?.trim() || '';
}

export function pickupSignLogoImageUrl(booking: BookingRow): string | null {
  const url = booking.pickup_sign_logo_url?.trim();
  if (!url) return null;
  // A PDF logo cannot be placed in the page; it stays the separate file it is.
  return /\.pdf(\?|$)/i.test(url) ? null : url;
}

export function pickupSignSheetAvailable(booking: BookingRow): boolean {
  return pickupSignName(booking).length > 0 || pickupSignLogoImageUrl(booking) !== null;
}

/**
 * One line of a few characters can be enormous; „Familie Weber und Begleitung"
 * cannot. Rather than measure text in a print context we cannot script, the
 * size steps down as the name grows — chosen so the longest name in each band
 * still fits one landscape line.
 */
function nameFontSizeMm(name: string, hasLogo: boolean): number {
  const n = name.length;
  const base =
    n <= 10 ? 46 : n <= 16 ? 38 : n <= 24 ? 30 : n <= 34 ? 24 : n <= 48 ? 18 : 14;
  // A logo takes the top third of the page, so the name gets what is left
  // rather than pushing itself off the bottom of the sheet.
  return hasLogo ? Math.round(base * 0.72) : base;
}

type SheetLabels = {
  /** Small line under the name, e.g. the company that booked the transfer. */
  footer?: string | null;
};

export function generatePickupSignHTML(booking: BookingRow, labels: SheetLabels = {}): string {
  const name = pickupSignName(booking);
  const logoUrl = pickupSignLogoImageUrl(booking);
  const footer = labels.footer?.trim() || booking.company_name?.trim() || '';
  const fontMm = nameFontSizeMm(name, logoUrl !== null);

  const logoBlock = logoUrl
    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="" />`
    : '';

  const nameBlock = name
    ? `<div class="name" style="font-size:${fontMm}mm">${escapeHtml(name)}</div>`
    : '';

  const footerBlock = footer ? `<div class="footer">${escapeHtml(footer)}</div>` : '';

  return `<!doctype html>
<html lang="ka">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(name || 'KEKE')}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${A4_LANDSCAPE_WIDTH_MM}mm;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: ${A4_LANDSCAPE_WIDTH_MM}mm;
    height: 209mm;
    padding: 14mm 16mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10mm;
    text-align: center;
  }
  .logo {
    max-width: 180mm;
    max-height: 65mm;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  .name {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-weight: 800;
    line-height: 1.1;
    color: #000000;
    letter-spacing: 0.5mm;
    word-break: break-word;
    max-width: 100%;
  }
  .footer {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 7mm;
    font-weight: 600;
    color: #444444;
  }
</style>
</head>
<body>
  <div class="sheet">
    ${logoBlock}
    ${nameBlock}
    ${footerBlock}
  </div>
</body>
</html>`;
}
