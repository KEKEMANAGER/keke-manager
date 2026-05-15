import { isTransferKind, type BookingRow } from './bookings';
import { formatStoredDateForDisplay } from './dateTime';
import { vehicleClassLabel, vehicleTypeLabel } from './vehicleCatalog';

function bookingKindLabel(kind: BookingRow['kind']): string {
  if (isTransferKind(kind)) {
    if (kind === 'transfer_arrival') return 'ტრანსფერი — ჩამოსვლა';
    if (kind === 'transfer_departure') return 'ტრანსფერი — გამგზავრება';
    return 'ტრანსფერი';
  }
  if (kind === 'tour') return 'ტური';
  return 'ერთდღიანი ტური';
}

function generateVoucherHTML(booking: BookingRow, voucherCode: string): string {
  const tag = 'div';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    .logo { font-size: 28px; font-weight: 900; color: #F5A623; letter-spacing: 3px; }
    .subtitle { color: #888; font-size: 14px; }
    .voucher-box { border: 3px dashed #F5A623; border-radius: 16px; padding: 30px; margin-top: 20px; }
    .voucher-id { font-size: 24px; font-weight: 900; color: #F5A623; margin-bottom: 16px; }
    .divider { border-top: 1px solid #eee; margin: 12px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .label { color: #888; font-size: 13px; }
    .value { font-size: 13px; font-weight: 600; }
    .price { font-size: 28px; font-weight: 900; color: #F5A623; text-align: right; margin-top: 12px; }
    .status { display: inline-block; background: #F5A623; color: #000;
      padding: 4px 16px; border-radius: 20px; font-weight: 700; font-size: 13px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <${tag} class="logo">KEKE.MANAGER</${tag}>
  <${tag} class="subtitle">B2B სატრანსპორტო პლატფორმა</${tag}>
  <${tag} class="voucher-box">
    <span class="status">ვაუჩერი</span>
    <${tag} class="voucher-id">${voucherCode}</${tag}>
    <${tag} class="divider"></${tag}>
    ${booking.company_name ? `<${tag} class="row"><span class="label">კომპანია</span><span class="value">${booking.company_name}</span></${tag}>` : ''}
    ${booking.created_by_name ? `<${tag} class="row"><span class="label">ოპერატორი</span><span class="value">${booking.created_by_name}</span></${tag}>` : ''}
    <${tag} class="row"><span class="label">ტიპი</span><span class="value">${bookingKindLabel(booking.kind)}</span></${tag}>
    ${booking.vehicle_type ? `<${tag} class="row"><span class="label">ტრანსპორტი</span><span class="value">${vehicleTypeLabel(booking.vehicle_type)}</span></${tag}>` : ''}
    <${tag} class="row"><span class="label">კლასი</span><span class="value">${vehicleClassLabel(booking.vehicle_class)}</span></${tag}>
    ${booking.from_location ? `<${tag} class="row"><span class="label">საიდან</span><span class="value">${booking.from_location}</span></${tag}>` : ''}
    ${booking.to_location ? `<${tag} class="row"><span class="label">სად</span><span class="value">${booking.to_location}</span></${tag}>` : ''}
    ${booking.route ? `<${tag} class="row"><span class="label">მარშრუტი</span><span class="value">${booking.route}</span></${tag}>` : ''}
    <${tag} class="row"><span class="label">თარიღი</span><span class="value">${formatStoredDateForDisplay(booking.date_display)}</span></${tag}>
    <${tag} class="row"><span class="label">მგზავრები</span><span class="value">${booking.passengers}</span></${tag}>
    ${booking.passenger_name ? `<${tag} class="row"><span class="label">მგზავრი</span><span class="value">${booking.passenger_name}</span></${tag}>` : ''}
    ${booking.flight_number ? `<${tag} class="row"><span class="label">ფრენა</span><span class="value">${booking.flight_number}</span></${tag}>` : ''}
    ${booking.driver_display_name ? `
    <${tag} class="divider"></${tag}>
    <${tag} class="row"><span class="label">მძღოლი</span><span class="value">${booking.driver_display_name}</span></${tag}>
    <${tag} class="row"><span class="label">ნომერი</span><span class="value">${booking.driver_phone || '—'}</span></${tag}>` : ''}
    <${tag} class="divider"></${tag}>
    <${tag} class="row"><span class="label">გადახდა</span><span class="value">${booking.payment_method || '—'}</span></${tag}>
    <${tag} class="price">${Number(booking.price_gel).toLocaleString('ka-GE')} ₾</${tag}>
  </${tag}>
</body>
</html>`;
}

export async function shareVoucherPDF(booking: BookingRow): Promise<void> {
  const voucherCode =
    booking.voucher_code || `KEKE-${booking.id.slice(0, 6).toUpperCase()}`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(generateVoucherHTML(booking, voucherCode));
  win.document.close();
  win.print();
}
