function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseBookingDate(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Count bookings whose primary datetime falls on the same local calendar day as `ref`. */
export function countBookingsToday<T extends { pickupTime: string | null }>(
  items: T[],
  ref: Date = new Date(),
): number {
  const day = startOfLocalDay(ref).getTime();
  const next = day + 86400000;
  let n = 0;
  for (const it of items) {
    const d = parseBookingDate(it.pickupTime);
    if (!d) continue;
    const t = d.getTime();
    if (t >= day && t < next) n += 1;
  }
  return n;
}

/**
 * Sum money for bookings in the last 7 local days (inclusive of today).
 * Uses `amount` when finite; otherwise skips.
 */
export function sumWeeklyAmount<T extends { pickupTime: string | null; amount: number | null }>(
  items: T[],
  ref: Date = new Date(),
): number {
  const end = startOfLocalDay(ref).getTime() + 86400000;
  const start = end - 7 * 86400000;
  let sum = 0;
  for (const it of items) {
    const d = parseBookingDate(it.pickupTime);
    if (!d) continue;
    const t = d.getTime();
    if (t < start || t >= end) continue;
    const a = it.amount;
    if (a != null && Number.isFinite(a)) sum += a;
  }
  return Math.round(sum * 100) / 100;
}

/** Sum `amount` for bookings in the same calendar month as `ref` (local time). */
export function sumCalendarMonthAmount<T extends { pickupTime: string | null; amount: number | null }>(
  items: T[],
  ref: Date = new Date(),
): number {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const start = new Date(y, m, 1).getTime();
  const end = new Date(y, m + 1, 1).getTime();
  let sum = 0;
  for (const it of items) {
    const d = parseBookingDate(it.pickupTime);
    if (!d) continue;
    const t = d.getTime();
    if (t < start || t >= end) continue;
    const a = it.amount;
    if (a != null && Number.isFinite(a)) sum += a;
  }
  return Math.round(sum * 100) / 100;
}

function statusIsConfirmedLike(status: string | null | undefined): boolean {
  const raw = (status ?? "").trim();
  const s = raw.toLowerCase();
  return (
    raw.includes("დადასტურებული") ||
    s === "confirmed" ||
    s === "assigned" ||
    s === "in_progress" ||
    (s.includes("confirm") && !s.includes("pending"))
  );
}

/** Share of bookings whose status looks confirmed / in progress (0–100). */
export function confirmedBookingPercent(bookings: { status: string | null }[]): number {
  if (bookings.length === 0) return 0;
  const n = bookings.filter((b) => statusIsConfirmedLike(b.status)).length;
  return Math.round((n / bookings.length) * 100);
}

/** Bookings not completed / cancelled (rough “active” pipeline). */
export function countActivePipelineBookings(bookings: { status: string | null }[]): number {
  return bookings.filter((b) => {
    const s = (b.status ?? "").toLowerCase();
    if (!s) return false;
    if (s.includes("complete")) return false;
    if (s.includes("cancel")) return false;
    return true;
  }).length;
}
