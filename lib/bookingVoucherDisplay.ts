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

/** Strip emoji from voucher/PDF text (UI labels stay emoji-free). */
export function stripVoucherEmojis(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
