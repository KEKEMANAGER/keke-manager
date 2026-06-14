import type { BookingRow } from './bookings';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function meetGreetVoucherFieldsPresent(booking: BookingRow): boolean {
  return !!(
    booking.passenger_name?.trim() ||
    booking.passenger_phone?.trim() ||
    booking.sign_text?.trim() ||
    booking.pickup_sign_logo_url?.trim()
  );
}

type MeetGreetHtmlLabels = {
  sectionTitle: string;
  passengerName: string;
  passengerPhone: string;
  pickupSignName: string;
  pickupSignLogo: string;
  pickupSignPdfHint: string;
};

const DEFAULT_MEET_GREET_LABELS: MeetGreetHtmlLabels = {
  sectionTitle: 'დასახვედრი / ტურისტი',
  passengerName: 'ტურისტის სახელი',
  passengerPhone: 'ტურისტის ტელეფონი',
  pickupSignName: 'დასახვედრი სახელი',
  pickupSignLogo: 'დასახვედრი ნიშანი',
  pickupSignPdfHint: 'PDF — ჩამოტვირთვა და ბეჭდვა',
};

function rowHtml(label: string, value: string): string {
  return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`;
}

/** HTML fragment for voucher PDF / print — tourist name, phone, meet sign + logo. */
export function pickupSignVoucherHtmlSection(
  booking: BookingRow,
  labels: MeetGreetHtmlLabels = DEFAULT_MEET_GREET_LABELS,
): string {
  if (!meetGreetVoucherFieldsPresent(booking)) return '';

  const parts: string[] = [];
  parts.push(`<div class="section-title">${escapeHtml(labels.sectionTitle)}</div>`);

  const passengerName = booking.passenger_name?.trim();
  const passengerPhone = booking.passenger_phone?.trim();
  const signName = booking.sign_text?.trim();
  const logoUrl = booking.pickup_sign_logo_url?.trim();

  if (passengerName) {
    parts.push(rowHtml(labels.passengerName, passengerName));
  }
  if (passengerPhone) {
    parts.push(rowHtml(labels.passengerPhone, passengerPhone));
  }
  if (signName) {
    parts.push(rowHtml(labels.pickupSignName, signName));
  }

  if (logoUrl) {
    const safeUrl = escapeHtml(logoUrl);
    const isPdf = /\.pdf(\?|$)/i.test(logoUrl);
    parts.push('<div style="text-align:center;margin:16px 0">');
    parts.push(
      `<div style="font-size:13px;color:#888;font-weight:600;margin-bottom:10px">${escapeHtml(labels.pickupSignLogo)}</div>`,
    );
    if (isPdf) {
      parts.push(
        `<a href="${safeUrl}" target="_blank" rel="noopener" style="color:#B45309;font-weight:700;font-size:14px">${escapeHtml(labels.pickupSignPdfHint)}</a>`,
      );
    } else {
      parts.push(
        `<img src="${safeUrl}" alt="${escapeHtml(labels.pickupSignLogo)}" style="max-width:400px;max-height:220px;width:auto;height:auto;display:block;margin:0 auto;border-radius:8px" />`,
      );
    }
    parts.push('</div>');
  }

  return parts.join('\n');
}
