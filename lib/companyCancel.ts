import type { BookingRow, CompanyCancelCode } from './bookings';
import { canCancelConvoyMaster } from './groupBooking';

/** The statuses a company cancels a booking in (P0-5, cancel_booking_by_company). */
const COMPANY_CANCELLABLE_STATUSES: ReadonlySet<string> = new Set(['pending', 'accepted']);

/**
 * Whether a company's screen offers "cancel" for this booking. The server has
 * the last word; this only hides the button where it would surely be refused:
 * a trip in progress (its driver or KEKE cancels it), a finished, declined or
 * cancelled booking. A convoy: by its cars when the screen has them (none on
 * the road, not all finished), otherwise by its own status.
 */
export function companyCanCancelBooking(
  booking: Pick<BookingRow, 'status' | 'is_group_master'>,
  convoyLegs?: BookingRow[] | null,
): boolean {
  if (booking.is_group_master === true) {
    if (booking.status === 'cancelled' || booking.status === 'completed' || booking.status === 'rejected') {
      return false;
    }
    if (convoyLegs) return canCancelConvoyMaster(convoyLegs);
  }
  return COMPANY_CANCELLABLE_STATUSES.has(booking.status);
}

/** The translation key that explains a refused cancellation (null: use the error text). */
export function companyCancelRefusalKey(code: CompanyCancelCode): string | null {
  switch (code) {
    case 'already_cancelled':
      return 'companyCancel.alreadyCancelled';
    case 'already_completed':
      return 'companyCancel.alreadyCompleted';
    case 'already_closed':
      return 'companyCancel.alreadyClosed';
    case 'trip_in_progress':
      return 'companyCancel.tripInProgress';
    case 'convoy_in_progress':
      return 'transportPlan.convoyCancelInProgress';
    case 'forbidden':
      return 'companyCancel.forbidden';
    case 'not_found':
      return 'companyCancel.notFound';
    case 'pending_only':
      return 'companyDashboard.cancelPendingOnly';
    default:
      return null;
  }
}
