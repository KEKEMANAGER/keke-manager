/** საჭიროა Airtable-ის ველებთან შესაბამისობა — იხ.: schemas/airtable-base.json */

import type { VehicleClass } from "@/types/airtable";

export type UserRole = "company" | "driver" | "admin";

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

export interface DriverProfile {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  /** Drivers `portrait_photo` — first attachment URL (e.g. Cloudinary). */
  portraitPhotoUrl?: string;
  verified: boolean;
  /** Drivers `languages` (Multiple select); empty / unset → undefined */
  languages?: string[];
  ratingAvg: number;
  ratingCount: number;
  /** Drivers `bio` (Long text) */
  bio?: string;
  experienceYears?: number;
  vehicleModel: string;
  vehicleYear: number;
  vehicleCategory: VehicleClass;
  /** Vehicles ცხრილი: `Color` (Single line text) */
  vehicleColor?: string;
  seats: number;
  luggageSlots: number;
  fuelType: string;
  /** ლარებში */
  indicativePrice?: number;
  vehicleImageUrl?: string;
  /** Vehicles `photo_front` — first attachment URL */
  vehicleFrontPhotoUrl?: string;
  /** Vehicles ცხრილის record id (primaryVehicle) */
  primaryVehicleId?: string;
  /** სანომრე ნიშანი */
  licensePlate?: string;
  /** LedgerEntries ჯამი (`Amount GEL`) ან fallback */
  balanceGel?: number;
  /** Drivers `base_city` / `Base city` — optional */
  baseCity?: string;
  /** Drivers: license_photo attachment */
  hasLicensePhoto?: boolean;
  /** Drivers: id_photo attachment */
  hasIdPhoto?: boolean;
  /** Drivers: portrait_photo attachment */
  hasPortraitPhoto?: boolean;
  /** Primary vehicle: exterior / interior attachment fields */
  hasVehiclePhotoFront?: boolean;
  hasVehiclePhotoRear?: boolean;
  hasVehiclePhotoLeft?: boolean;
  hasVehiclePhotoRight?: boolean;
  hasVehiclePhotoInterior?: boolean;
}

export interface TourismCompanyProfile {
  id: string;
  legalName: string;
  tin: string;
  email: string;
  contactName: string;
  contactPhone: string;
}
