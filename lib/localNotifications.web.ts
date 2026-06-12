/** Web: no local notifications (native uses `localNotifications.ts`). */
export async function notifyBookingConfirmed(): Promise<void> {
  return;
}

export async function notifyNewOpenBooking(): Promise<void> {
  return;
}

export async function notifyNewOpenBookingIfMatchesDriver(
  _driverUserId: string,
  _bookingVehicleType: string,
  _bookingVehicleClass: string | null | undefined,
  _bookingKind?: string | null,
  _bookingDriverId?: string | null,
): Promise<void> {
  return;
}

export async function notifyIncomingChatMessageLocally(_params: {
  senderUserId: string;
  senderName?: string | null;
  text: string;
}): Promise<void> {
  return;
}
