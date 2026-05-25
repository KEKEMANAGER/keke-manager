/** Display id for vouchers: #KEKE-{last 8 hex chars of uuid}. */
export function formatBookingDisplayNumber(bookingId: string): string {
  const compact = bookingId.replace(/-/g, '').toUpperCase();
  const suffix = compact.length >= 8 ? compact.slice(-8) : compact;
  return `#KEKE-${suffix}`;
}

export function formatVoucherPriceGel(price: number | null | undefined): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return '—';
  return `${n.toLocaleString('ka-GE')} GEL`;
}
