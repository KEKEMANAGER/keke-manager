/**
 * When a driver's pin stops being "weak signal" and becomes "signal lost".
 *
 * A pin a minute or two old is a tunnel or a dead zone; one ten minutes old is
 * a phone that stopped sending. The company read a pin frozen for three hours
 * as where the car was — the map now says when it was last heard from.
 */
export const SIGNAL_LOST_MS = 10 * 60 * 1000;

export function isSignalLost(iso: string | null | undefined, now: number = Date.now()): boolean {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && now - at > SIGNAL_LOST_MS;
}

/** HH:MM, plus the day when it was not today ("27.10 18:05"). */
export function lostAtLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return hm;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`;
}
