import { captureOdometerPhoto, odometerErrorMessageKey, submitBookingOdometerPhoto } from './bookingOdometer';
import type { OdometerPhase } from './bookingOdometer';
import { completeBooking, isTourBookingKind, startBookingTrip, type BookingRow } from './bookings';
import { isMultiDayTour } from './tourDayLogs';

export async function captureAndSaveTourOdometer(
  bookingId: string,
  driverUserId: string,
  phase: OdometerPhase,
): Promise<
  | { ok: true; uri: string }
  | { ok: false; cancelled: true }
  | { ok: false; error: Error }
> {
  const captured = await captureOdometerPhoto();
  if (!captured.ok) {
    if ('cancelled' in captured && captured.cancelled) {
      return { ok: false, cancelled: true };
    }
    const err = 'error' in captured ? captured.error : null;
    return { ok: false, error: err ?? new Error('capture_failed') };
  }

  const saved = await submitBookingOdometerPhoto(bookingId, driverUserId, phase, captured.uri);
  if (!saved.ok) {
    return { ok: false, error: saved.error ?? new Error('save_failed') };
  }
  return { ok: true, uri: captured.uri };
}

export async function startTourTripWithOdometer(
  booking: BookingRow,
  driverUserId: string,
): Promise<
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; error: Error }
> {
  if (isTourBookingKind(booking.kind)) {
    const odometer = await captureAndSaveTourOdometer(booking.id, driverUserId, 'start');
    if (!odometer.ok) {
      if ('cancelled' in odometer && odometer.cancelled) {
        return { ok: false, cancelled: true };
      }
      const err = 'error' in odometer ? odometer.error : null;
      return { ok: false, error: err ?? new Error('odometer_failed') };
    }
  }

  const res = await startBookingTrip(booking.id, driverUserId);
  if (!res.ok) {
    return { ok: false, error: res.error ?? new Error('start_failed') };
  }
  return { ok: true };
}

export async function completeTourTripWithOdometer(
  booking: BookingRow,
  driverUserId: string,
): Promise<
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; needsDays: true }
  | { ok: false; error: Error }
> {
  // A multi-day tour is not finished with one tap. Every day has to be closed
  // first, so send the driver to the day-by-day screen instead of failing with
  // an error he cannot act on from here.
  if (isMultiDayTour(booking)) {
    return { ok: false, needsDays: true };
  }

  if (isTourBookingKind(booking.kind)) {
    const odometer = await captureAndSaveTourOdometer(booking.id, driverUserId, 'end');
    if (!odometer.ok) {
      if ('cancelled' in odometer && odometer.cancelled) {
        return { ok: false, cancelled: true };
      }
      const err = 'error' in odometer ? odometer.error : null;
      return { ok: false, error: err ?? new Error('odometer_failed') };
    }
  }

  const res = await completeBooking(booking.id, driverUserId);
  if (!res.ok) {
    return { ok: false, error: res.error ?? new Error('complete_failed') };
  }
  return { ok: true };
}

export { odometerErrorMessageKey };
