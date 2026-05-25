import type { BookingRow } from './bookings';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** HTML fragment for voucher PDF / print (Georgian labels per product spec). */
export function pickupSignVoucherHtmlSection(booking: BookingRow): string {
  const parts: string[] = [];
  const signName = booking.sign_text?.trim();
  const logoUrl = booking.pickup_sign_logo_url?.trim();

  if (signName) {
    parts.push(
      `<div class="row"><span class="label">დასახვედრი სახელი</span><span class="value">${escapeHtml(signName)}</span></div>`,
    );
  }

  if (logoUrl) {
    const safeUrl = escapeHtml(logoUrl);
    const isPdf = /\.pdf(\?|$)/i.test(logoUrl);
    parts.push('<div class="divider"></div>');
    parts.push('<div style="text-align:center;margin:16px 0">');
    parts.push(
      '<div style="font-size:13px;color:#888;font-weight:600;margin-bottom:10px">დასახვედრი ნიშანი</div>',
    );
    if (isPdf) {
      parts.push(
        `<a href="${safeUrl}" target="_blank" rel="noopener" style="color:#B45309;font-weight:700;font-size:14px">PDF ვაუჩერი — ჩამოტვირთვა</a>`,
      );
    } else {
      parts.push(
        `<img src="${safeUrl}" alt="დასახვედრი ლოგო" style="max-width:400px;max-height:200px;width:auto;height:auto;display:block;margin:0 auto;border-radius:8px" />`,
      );
    }
    parts.push('</div>');
  }

  return parts.join('\n');
}
