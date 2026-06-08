import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { BookingRow } from './bookings';
import type { CompanyVoucherData } from './companyVoucherData';
import { fetchCompanyVoucherData } from './companyVoucherData';
import { generateCompanyVoucherHTML } from './companyVoucherHtml';
import { generateTouristVoucherHTML } from './touristVoucherHtml';
import {
  touristVoucherPdfDialogTitle,
  type TouristVoucherLocale,
} from './touristVoucherLocale';

export async function shareCompanyVoucherPDF(data: CompanyVoucherData): Promise<void> {
  const voucherCode =
    data.booking.voucher_code?.trim() ||
    `KEKE-${data.booking.id.slice(0, 6).toUpperCase()}`;
  const { uri } = await Print.printToFileAsync({
    html: generateCompanyVoucherHTML(data),
    base64: false,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `ვაუჩერი ${voucherCode}`,
      UTI: 'com.adobe.pdf',
    });
  }
}

export async function shareTouristVoucherPDF(
  data: CompanyVoucherData,
  locale: TouristVoucherLocale,
): Promise<void> {
  const voucherCode =
    data.booking.voucher_code?.trim() ||
    `KEKE-${data.booking.id.slice(0, 6).toUpperCase()}`;
  const { uri } = await Print.printToFileAsync({
    html: generateTouristVoucherHTML(data, locale),
    base64: false,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: touristVoucherPdfDialogTitle(locale, voucherCode),
      UTI: 'com.adobe.pdf',
    });
  }
}

/** Company full voucher PDF (fetches driver + vehicle details). */
export async function shareVoucherPDF(
  booking: BookingRow,
  companyUserId?: string,
): Promise<void> {
  const { data, error } = await fetchCompanyVoucherData(booking.id, companyUserId);
  if (data) {
    await shareCompanyVoucherPDF(data);
    return;
  }
  if (__DEV__ && error) {
    console.warn('[voucher] fetchCompanyVoucherData', error.message);
  }
}
