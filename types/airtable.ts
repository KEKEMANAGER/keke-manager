/** Airtable ველებთან გამომდინარე ტიპები — იხ.: schemas/airtable-base.json */

export type VehicleClass =
  | "sedan"
  | "minivan_small"
  | "minivan"
  | "minibus"
  | "bus"
  | "business";

export type BookingKind = "transfer" | "tour" | "one_day_tour";

export type BookingStatus =
  | "draft"
  | "pending_payment"
  | "confirmed"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "breakdown_swap"
  | "weather_cancelled";

export type PaymentMethod =
  | "pay_now"
  | "reserve_then_pay"
  | "client_card"
  | "balance";

export type LedgerDirection =
  | "debit_company"
  | "credit_escrow"
  | "debit_escrow_driver_payout"
  | "credit_platform_fee"
  | "refund";

export interface Vehicle {
  id: string;
  category: VehicleClass | null;
  makeModel: string | null;
  /** სანომრე ნიშანი — Airtable: Plate */
  licensePlate: string | null;
  year: number | null;
  /** Airtable Vehicles: `Color` (Single line text) */
  color: string | null;
  seats: number | null;
  luggageSlots: number | null;
  fuelType: string | null;
  photoExteriorUrl: string | null;
  photoInteriorUrl: string | null;
  /** Vehicles `photo_front` attachment */
  photoFrontUrl: string | null;
  driverIds: string[];
}

export interface Driver {
  id: string;
  /** Clerk user id — Airtable ველი clerk_id */
  clerkId: string | null;
  firstName: string;
  lastName: string;
  dob: string | null;
  photoUrl: string | null;
  /** Drivers `portrait_photo` attachment */
  portraitPhotoUrl: string | null;
  verified: boolean;
  languages: string[];
  experienceYears: number | null;
  bio: string | null;
  subscriptionTier: string | null;
  internalBalance: number | null;
  vehicleIds: string[];
  /** პირველი დაკავშირებული ავტო (MVP UI). */
  primaryVehicle: Vehicle | null;
  /** Airtable `Rating` ველი ან rollup */
  ratingAvg: number;
  ratingCount: number;
}

export interface TourismCompany {
  id: string;
  legalName: string;
  tin: string | null;
  email: string | null;
  contactName: string | null;
  contactPhone: string | null;
  isVerified: boolean;
  subscriptionPlan: string | null;
  balanceEscrowProxy: number | null;
  hasFuelService: boolean;
}

export interface Booking {
  id: string;
  kind: BookingKind;
  status: BookingStatus;
  companyIds: string[];
  assignedDriverIds: string[];
  assignedVehicleIds: string[];
  /** Airtable Pickup / Dropoff / Pickup time (when set on row) */
  pickup: string | null;
  dropoff: string | null;
  pickupTime: string | null;
  startDatetime: string | null;
  endDatetime: string | null;
  paxCount: number | null;
  overnightsCount: number | null;
  transferSegmentsCount: number | null;
  routeWaypointsJson: string | null;
  distanceKmComputed: number | null;
  flightNo: string | null;
  meetGreetBannerText: string | null;
  meetContactName: string | null;
  meetContactPhone: string | null;
  driverComment: string | null;
  paymentMethod: PaymentMethod | null;
  commissionAddonGel: number | null;
  clientPriceGel: number | null;
  platformQuoteGel: number | null;
  voucherGeneratedAt: string | null;
  voucherCode: string | null;
  paidAt: string | null;
  payoutToDriverAt: string | null;
  customQuoteDeadlineAt: string | null;
  ledgerEntryIds: string[];
  gpsSessionIds: string[];
}

export interface LedgerEntry {
  id: string;
  bookingIds: string[];
  driverIds: string[];
  amountGel: number | null;
  direction: LedgerDirection | null;
  status: "pending" | "settled" | "failed" | null;
  externalPaymentRef: string | null;
  createdAt: string | null;
}

/** Bookings შექმნა — იხ. Airtable ველის სახელები snake_case. */
export interface CreateBookingInput {
  kind: BookingKind;
  status?: BookingStatus;
  /** ცარიელი დროს server action შეამოწმებს DEFAULT_TOURISM_COMPANY_RECORD_ID env-ს. */
  companyIds?: string[];
  assignedDriverIds?: string[];
  assignedVehicleIds?: string[];
  startDatetime?: string | null;
  endDatetime?: string | null;
  paxCount?: number | null;
  overnightsCount?: number | null;
  transferSegmentsCount?: number | null;
  routeWaypointsJson?: string | null;
  flightNo?: string | null;
  meetGreetBannerText?: string | null;
  meetContactName?: string | null;
  meetContactPhone?: string | null;
  driverComment?: string | null;
  paymentMethod?: PaymentMethod | null;
  commissionAddonGel?: number | null;
  clientPriceGel?: number | null;
}
