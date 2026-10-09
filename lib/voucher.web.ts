import type { BookingRow } from './bookings';
import type { CompanyVoucherData } from './companyVoucherData';
import { convoyVoucherCode, fetchCompanyVoucherData } from './companyVoucherData';
import { generateCompanyVoucherHTML } from './companyVoucherHtml';
import { generatePickupSignHTML, pickupSignName } from './pickupSignSheetHtml';
import { generateTouristVoucherHTML } from './touristVoucherHtml';
import {
  touristVoucherPdfDialogTitle,
  type TouristVoucherLocale,
} from './touristVoucherLocale';

function voucherDisplayCode(data: CompanyVoucherData): string {
  if (data.convoyLegs?.length) return convoyVoucherCode(data.booking);
  return (
    data.booking.voucher_code?.trim() ||
    `KEKE-${data.booking.id.slice(0, 6).toUpperCase()}`
  );
}

export async function shareCompanyVoucherPDF(data: CompanyVoucherData): Promise<void> {
  const voucherCode = voucherDisplayCode(data);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(generateCompanyVoucherHTML(data));
  win.document.close();
  win.document.title = `ვაუჩერი ${voucherCode}`;
  win.print();
}

export async function shareTouristVoucherPDF(
  data: CompanyVoucherData,
  locale: TouristVoucherLocale,
): Promise<void> {
  const voucherCode = voucherDisplayCode(data);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(generateTouristVoucherHTML(data, locale));
  win.document.close();
  win.document.title = touristVoucherPdfDialogTitle(locale, voucherCode);
  win.print();
}

export async function shareVoucherPDF(
  booking: BookingRow,
  companyUserId?: string,
  viewerUserId?: string,
): Promise<void> {
  const viewerId = viewerUserId ?? companyUserId;
  const { data, error } = await fetchCompanyVoucherData(booking.id, companyUserId, viewerId);
  if (data) {
    await shareCompanyVoucherPDF(data);
    return;
  }
  if (__DEV__ && error) {
    console.warn('[voucher.web] fetchCompanyVoucherData', error.message);
  }
}
/** Opens the pickup sign in a new tab and sends it straight to the printer. */
export async function sharePickupSignPDF(booking: BookingRow): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(generatePickupSignHTML(booking));
  win.document.close();
  win.document.title = pickupSignName(booking) || 'KEKE';
  win.print();
}
