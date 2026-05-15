import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { BookingRow } from './bookings';

function generateVoucherHTML(booking: BookingRow, voucherCode: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; background: #fff; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 28px; font-weight: 900; color: #F5A623; letter-spacing: 3px; }
    .subtitle { color: #888; font-size: 14px; margin-top: 4px; }
    .voucher-box { border: 3px dashed #F5A623; border-radius: 16px; padding: 30px; }
    .voucher-id { font-size: 24px; font-weight: 900; color: #F5A623; margin-bottom: 20px; }
    .divider { border-top: 1px solid #eee; margin: 16px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .label { color: #888; font-size: 13px; }
    .value { color: #111; font-size: 13px; font-weight: 600; }
    .price { font-size: 28px; font-weight: 900; color: #F5A623; text-align: right; margin-top: 16px; }
    .footer { text-align: center; margin-top: 30px; color: #aaa; font-size: 12px; }
    .status { display: inline-block; background: #F5A623; color: #000;
      padding: 4px 16px; border-radius: 20px; font-weight: 700; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">KEKE.MANAGER</div>
    <div class="subtitle">B2B სატრანსპორტო პლატფორმა</div>
  </div>
  <div class="voucher-box">
    <div style="margin-bottom:8px"><span class="status">ვაუჩერი</span></div>
    <div class="voucher-id">${voucherCode}</div>
    <div class="divider"></div>
    <div class="row">
      <span class="label">ტიპი</span>
      <span class="value">${booking.kind === 'transfer' ? 'ტრანსფერი' : booking.kind === 'tour' ? 'ტური' : 'ერთდღიანი ტური'}</span>
    </div>
    ${booking.from_location ? `<div class="row"><span class="label">საიდან</span><span class="value">${booking.from_location}</span></div>` : ''}
    ${booking.to_location ? `<div class="row"><span class="label">სად</span><span class="value">${booking.to_location}</span></div>` : ''}
    ${booking.route ? `<div class="row"><span class="label">მარშრუტი</span><span class="value">${booking.route}</span></div>` : ''}
    <div class="row"><span class="label">თარიღი</span><span class="value">${booking.date_display || '—'}</span></div>
    <div class="row"><span class="label">მგზავრები</span><span class="value">${booking.passengers}</span></div>
    <div class="row"><span class="label">კლასი</span><span class="value">${booking.vehicle_class}</span></div>
    ${booking.passenger_name ? `<div class="row"><span class="label">მგზავრი</span><span class="value">${booking.passenger_name}</span></div>` : ''}
    ${booking.flight_number ? `<div class="row"><span class="label">ფრენა</span><span class="value">${booking.flight_number}</span></div>` : ''}
    ${booking.driver_display_name ? `
    <div class="divider"></div>
    <div class="row"><span class="label">მძღოლი</span><span class="value">${booking.driver_display_name}</span></div>
    <div class="row"><span class="label">ნომერი</span><span class="value">${booking.driver_phone || '—'}</span></div>
    <div class="row"><span class="label">მანქანა</span><span class="value">${booking.driver_plate || '—'}</span></div>` : ''}
    <div class="divider"></div>
    <div class="row"><span class="label">გადახდა</span><span class="value">${booking.payment_method || '—'}</span></div>
    <div class="price">${Number(booking.price_gel).toLocaleString('ka-GE')} ₾</div>
  </div>
  <div class="footer">კეკე მენეჯერი • ${new Date().toLocaleDateString('ka-GE')}</div>
</body>
</html>`;
}

export async function shareVoucherPDF(booking: BookingRow): Promise<void> {
  const voucherCode =
    booking.voucher_code || `KEKE-${booking.id.slice(0, 6).toUpperCase()}`;
  const { uri } = await Print.printToFileAsync({
    html: generateVoucherHTML(booking, voucherCode),
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
