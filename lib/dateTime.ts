/** Display: 15/05/2026 */
export function formatDisplayDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/** Display: 15.05.2026, 14:30 */
export function formatDisplayDateTime(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${d}.${m}.${y}, ${h}:${min}`;
}

export function formatDisplayTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/** Parse ISO or legacy free-text; null if invalid. */
export function parseStoredDateTime(value: string | null | undefined): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;
  return null;
}

export function toIsoString(date: Date): string {
  return date.toISOString();
}

export function mergeDateAndTime(datePart: Date, timePart: Date): Date {
  const merged = new Date(datePart);
  merged.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return merged;
}

/** Parse `profiles.birth_date` (YYYY-MM-DD) or ISO datetime. */
export function parseBirthDate(value: string | null | undefined): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = parseInt(m[1]!, 10);
    const mo = parseInt(m[2]!, 10) - 1;
    const d = parseInt(m[3]!, 10);
    const dt = new Date(y, mo, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return parseStoredDateTime(value);
}

/** Persist as PostgreSQL DATE (YYYY-MM-DD). */
export function toBirthDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format DB value for UI (ISO or legacy text). */
export function formatStoredDateForDisplay(value: string | null | undefined): string {
  const parsed = parseStoredDateTime(value);
  if (parsed) return formatDisplayDateTime(parsed);
  return value?.trim() || '—';
}

export function formatStoredBirthDateForDisplay(value: string | null | undefined): string {
  const parsed = parseBirthDate(value);
  if (parsed) return formatDisplayDate(parsed);
  return value?.trim() || '—';
}
