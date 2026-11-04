import { COLORS } from '../constants/theme';

/**
 * How fresh a driver's position is, the same on every map.
 *
 * A phone on a trip writes at least every 30 seconds, moving or standing
 * (lib/locations.ts), so a position up to 90 seconds old is live. Older than
 * that and up to ten minutes it is a weak signal - a tunnel, a dead zone; the
 * car is roughly there. Older than ten minutes the phone stopped sending: the
 * company once read a pin frozen for three hours as where the car was, so the
 * map now says when it was last heard from, and colours it differently.
 *
 * The age is measured against the time the server stamped on the position
 * when it arrived (GPS P0-3), not the phone's own clock.
 */
export const SIGNAL_LIVE_MS = 90 * 1000;
export const SIGNAL_LOST_MS = 10 * 60 * 1000;

export type SignalState = 'live' | 'weak' | 'lost' | 'none';

export function signalState(iso: string | null | undefined, now: number = Date.now()): SignalState {
  if (!iso) return 'none';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return 'none';
  const age = now - at;
  // A few seconds "ahead" is the viewer's clock, not a position from the future.
  if (age <= SIGNAL_LIVE_MS) return 'live';
  if (age <= SIGNAL_LOST_MS) return 'weak';
  return 'lost';
}

export function isSignalLost(iso: string | null | undefined, now: number = Date.now()): boolean {
  return signalState(iso, now) === 'lost';
}

/** The pin's colour: its own while live, grey while the signal is weak, red once it is lost. */
export function signalColor(iso: string | null | undefined, liveColor: string, now: number = Date.now()): string {
  switch (signalState(iso, now)) {
    case 'live':
      return liveColor;
    case 'lost':
      return COLORS.error;
    default:
      return COLORS.textMuted;
  }
}

/** HH:MM, plus the day when it was not today ("27.10 18:05"). */
export function lostAtLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return hm;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`;
}
