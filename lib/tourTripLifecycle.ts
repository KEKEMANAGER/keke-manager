import { captureOdometerPhoto, odometerErrorMessageKey, submitBookingOdometerPhoto } from './bookingOdometer';
import type { OdometerPhase } from './bookingOdometer';
import { completeBooking, isTourBookingKind, startBookingTrip, type BookingRow } from './bookings';

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
    return { ok: false, error: captured.error ?? new Error('capture_failed') };
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
      return { ok: false, error: odometer.error ?? new Error('odometer_failed') };
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
  | { ok: false; error: Error }
> {
  if (isTourBookingKind(booking.kind)) {
    const odometer = await captureAndSaveTourOdometer(booking.id, driverUserId, 'end');
    if (!odometer.ok) {
      if ('cancelled' in odometer && odometer.cancelled) {
        return { ok: false, cancelled: true };
      }
      return { ok: false, error: odometer.error ?? new Error('odometer_failed') };
    }
  }

  const res = await completeBooking(booking.id, driverUserId);
  if (!res.ok) {
    return { ok: false, error: res.error ?? new Error('complete_failed') };
  }
  return { ok: true };
}

export { odometerErrorMessageKey };
