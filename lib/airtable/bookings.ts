import type { FieldSet, Record as AirtableRecord } from "airtable";
import type {
  Booking,
  BookingKind,
  BookingStatus,
  CreateBookingInput,
  PaymentMethod,
} from "@/types/airtable";
import { getAirtableBase } from "@/lib/airtable/client";
import { cachedAirtableRead } from "@/lib/airtable/cached-data";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import { linkedRecordIds, asNumber, asString } from "@/lib/airtable/field-utils";

export function coerceBookingKind(raw: unknown): BookingKind {
  const s = asString(raw);
  if (s === "transfer" || s === "tour" || s === "one_day_tour") return s;
  if (s === "multi_day_tour") return "tour";
  if (s === "ტრანსფერი") return "transfer";
  if (s === "ტური") return "tour";
  if (s === "ერთდღიანი ტური") return "one_day_tour";
  return "transfer";
}

function coerceBookingStatus(raw: unknown): BookingStatus {
  const s = asString(raw);
  const ops: BookingStatus[] = [
    "draft",
    "pending_payment",
    "confirmed",
    "assigned",
    "in_progress",
    "completed",
    "cancelled",
    "breakdown_swap",
    "weather_cancelled",
  ];
  return ops.includes(s as BookingStatus) ? (s as BookingStatus) : "draft";
}

function coercePaymentMethod(raw: unknown): PaymentMethod | null {
  const s = asString(raw);
  if (s === "pay_now" || s === "reserve_then_pay" || s === "client_card" || s === "balance")
    return s;
  return null;
}

export function mapBookingRecord(record: AirtableRecord<FieldSet>): Booking {
  const f = record.fields;
  const pm = Array.isArray(f["payment_method"])
    ? f["payment_method"][0]
    : f["payment_method"];

  return {
    id: record.id,
    kind: coerceBookingKind(f["kind"]),
    status: coerceBookingStatus(f["status"]),
    companyIds: linkedRecordIds(f["company"]),
    assignedDriverIds: linkedRecordIds(f["assigned_driver"]),
    assignedVehicleIds: linkedRecordIds(f["assigned_vehicle"]),
    pickup: asString(f["Pickup"]),
    dropoff: asString(f["Dropoff"]),
    pickupTime: asString(f["Pickup time"]),
    startDatetime: asString(f["start_datetime"]),
    endDatetime: asString(f["end_datetime"]),
    paxCount: asNumber(f["pax_count"]),
    overnightsCount: asNumber(f["overnights_count"]),
    transferSegmentsCount: asNumber(f["transfer_segments_count"]),
    routeWaypointsJson: asString(f["route_waypoints_json"]),
    distanceKmComputed: asNumber(f["distance_km_computed"]),
    flightNo: asString(f["flight_no"]),
    meetGreetBannerText: asString(f["meet_greet_banner_text"]),
    meetContactName: asString(f["meet_contact_name"]),
    meetContactPhone: asString(f["meet_contact_phone"]),
    driverComment: asString(f["driver_comment"]),
    paymentMethod: coercePaymentMethod(pm),
    commissionAddonGel: asNumber(f["commission_addon_gel"]),
    clientPriceGel: asNumber(f["client_price_gel"]),
    platformQuoteGel: asNumber(f["platform_quote_gel"]),
    voucherGeneratedAt: asString(f["voucher_generated_at"]),
    voucherCode: asString(f["voucher_code"]),
    paidAt: asString(f["paid_at"]),
    payoutToDriverAt: asString(f["payout_to_driver_at"]),
    customQuoteDeadlineAt: asString(f["custom_quote_deadline_at"]),
    ledgerEntryIds: linkedRecordIds(f["payments"]),
    gpsSessionIds: linkedRecordIds(f["gps_sessions"]),
  };
}

/**
 * ფილტრი companyId-ით — ბაზაში multiple link `company` ბრუნდება ID-ების მასივად API-ში.
 * მაღალი მოცულობისთვის დაამატეთ Rollup/View Airtable-ში.
 */
async function loadBookings(companyId: string): Promise<Booking[]> {
  const base = getAirtableBase();
  const rows = await base(AIRTABLE_TABLES.Bookings).select().all();
  return rows
    .filter((r) => linkedRecordIds(r.fields["company"]).includes(companyId))
    .map(mapBookingRecord);
}

export async function getBookings(companyId: string): Promise<Booking[]> {
  return cachedAirtableRead(["airtable", "getBookings", companyId], () =>
    loadBookings(companyId),
  );
}

function resolveCompanyIds(input: CreateBookingInput): string[] {
  if (input.companyIds?.length) return input.companyIds;
  const fallback = process.env.DEFAULT_TOURISM_COMPANY_RECORD_ID?.trim();
  return fallback ? [fallback] : [];
}

function airtableBookingFields(input: CreateBookingInput): Partial<FieldSet> {
  const companyIds = resolveCompanyIds(input);
  if (!companyIds.length) {
    throw new Error(
      "Set companyIds on CreateBookingInput or DEFAULT_TOURISM_COMPANY_RECORD_ID in .env.local.",
    );
  }

  const status = input.status ?? "draft";

  const fields: Partial<FieldSet> = {
    kind: input.kind,
    status,
    company: companyIds,
  };

  if (input.assignedDriverIds?.length) fields["assigned_driver"] = input.assignedDriverIds;
  if (input.assignedVehicleIds?.length) fields["assigned_vehicle"] = input.assignedVehicleIds;
  if (input.startDatetime != null && input.startDatetime !== "")
    fields["start_datetime"] = input.startDatetime;
  if (input.endDatetime != null && input.endDatetime !== "") fields["end_datetime"] = input.endDatetime;
  if (input.paxCount != null) fields["pax_count"] = input.paxCount;
  if (input.overnightsCount != null) fields["overnights_count"] = input.overnightsCount;
  if (input.transferSegmentsCount != null)
    fields["transfer_segments_count"] = input.transferSegmentsCount;
  if (input.routeWaypointsJson != null && input.routeWaypointsJson !== "")
    fields["route_waypoints_json"] = input.routeWaypointsJson;
  if (input.flightNo != null && input.flightNo !== "") fields["flight_no"] = input.flightNo;
  if (input.meetGreetBannerText != null && input.meetGreetBannerText !== "")
    fields["meet_greet_banner_text"] = input.meetGreetBannerText;
  if (input.meetContactName != null && input.meetContactName !== "")
    fields["meet_contact_name"] = input.meetContactName;
  if (input.meetContactPhone != null && input.meetContactPhone !== "")
    fields["meet_contact_phone"] = input.meetContactPhone;
  if (input.driverComment != null && input.driverComment !== "")
    fields["driver_comment"] = input.driverComment;
  if (input.paymentMethod) fields["payment_method"] = input.paymentMethod;
  if (input.commissionAddonGel != null) fields["commission_addon_gel"] = input.commissionAddonGel;
  if (input.clientPriceGel != null) fields["client_price_gel"] = input.clientPriceGel;

  return fields;
}

export async function createBooking(data: CreateBookingInput): Promise<Booking> {
  const base = getAirtableBase();
  const fields = airtableBookingFields(data);
  const row = await base(AIRTABLE_TABLES.Bookings).create(fields);
  return mapBookingRecord(row);
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<Booking> {
  const base = getAirtableBase();
  const updated = await base(AIRTABLE_TABLES.Bookings).update(id, { status });
  return mapBookingRecord(updated);
}
