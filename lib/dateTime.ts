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

/** Format DB value for UI (ISO or legacy text). */
export function formatStoredDateForDisplay(value: string | null | undefined): string {
  const parsed = parseStoredDateTime(value);
  if (parsed) return formatDisplayDateTime(parsed);
  return value?.trim() || '—';
}
