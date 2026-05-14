import type { FieldSet } from "airtable";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAirtableBase } from "@/lib/airtable/client";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import { getTourismCompanyRecordIdForClerkUser } from "@/lib/airtable/company-for-clerk";
import type { BookingKind, PaymentMethod } from "@/types/airtable";

const KIND_MAP: Record<BookingKind, string> = {
  transfer: "ტრანსფერი",
  tour: "ტური",
  one_day_tour: "ერთდღიანი ტური",
};

const AIRTABLE_BOOKING_PICKUP = "Pickup" as const;
const AIRTABLE_BOOKING_DROPOFF = "Dropoff" as const;
const AIRTABLE_BOOKING_PICKUP_TIME = "Pickup time" as const;
const AIRTABLE_BOOKING_PRICE_GEL = "Price GEL" as const;
const AIRTABLE_BOOKING_STATUS = "Status" as const;
const AIRTABLE_BOOKING_COMPANY = "Company" as const;
const AIRTABLE_BOOKING_DRIVER = "Driver" as const;
const AIRTABLE_BOOKING_VEHICLE = "Vehicle" as const;

const BOOKING_KINDS: readonly BookingKind[] = [
  "transfer",
  "tour",
  "one_day_tour",
];

function isBookingKind(v: unknown): v is BookingKind {
  return typeof v === "string" && (BOOKING_KINDS as readonly string[]).includes(v);
}

/** Airtable `payment_method`: pay_now | pay_later | client_card */
function airtablePaymentMethod(pm: string): "pay_now" | "pay_later" | "client_card" | null {
  if (pm === "pay_now" || pm === "client_card") return pm;
  if (pm === "reserve_then_pay" || pm === "pay_later") return "pay_later";
  return null;
}

function parsePaymentMethod(v: unknown): PaymentMethod | null {
  if (typeof v !== "string") return null;
  if (v === "pay_now" || v === "reserve_then_pay" || v === "client_card" || v === "balance")
    return v;
  return null;
}

function parseIntGe0(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parseNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const kind = isBookingKind(b.kind) ? b.kind : "transfer";
  const pickup = typeof b.pickup === "string" ? b.pickup.trim() : "";
  const dropoff = typeof b.dropoff === "string" ? b.dropoff.trim() : "";
  const pickupTime = typeof b.pickupTime === "string" ? b.pickupTime.trim() : "";
  const driverId = typeof b.driverId === "string" ? b.driverId.trim() : "";
  const vehicleId = typeof b.vehicleId === "string" ? b.vehicleId.trim() : "";

  const passengersCount = parseIntGe0(b.passengersCount);
  const childrenCount = parseIntGe0(b.childrenCount) ?? 0;

  if (!pickup || !dropoff || !pickupTime || !driverId || !vehicleId) {
    return NextResponse.json(
      {
        error:
          "Pickup, dropoff, pickupTime, driverId, and vehicleId are required.",
      },
      { status: 400 },
    );
  }

  if (passengersCount == null || passengersCount < 1) {
    return NextResponse.json(
      { error: "passengersCount must be an integer >= 1." },
      { status: 400 },
    );
  }

  const passengerName =
    typeof b.passengerName === "string" ? b.passengerName.trim() : "";
  const passengerPhone =
    typeof b.passengerPhone === "string" ? b.passengerPhone.trim() : "";
  const contactPerson =
    typeof b.contactPerson === "string" ? b.contactPerson.trim() : "";
  const flightNumber =
    typeof b.flightNumber === "string" ? b.flightNumber.trim() : "";
  const signText = typeof b.signText === "string" ? b.signText.trim() : "";
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";
  const luggageCount = parseIntGe0(b.luggageCount);

  const tourStartDate =
    typeof b.tourStartDate === "string" ? b.tourStartDate.trim() : "";
  const tourEndDate =
    typeof b.tourEndDate === "string" ? b.tourEndDate.trim() : "";
  const overnightStay = Boolean(b.overnightStay);
  const routeDescription =
    typeof b.routeDescription === "string" ? b.routeDescription.trim() : "";

  const pmRaw = parsePaymentMethod(b.paymentMethod);
  const paymentAirtable = pmRaw ? airtablePaymentMethod(pmRaw) : null;

  const clientPrice = parseNumber(b.clientPrice);
  const commissionGel = parseNumber(b.commissionGel);

  if (kind === "transfer") {
    if (!passengerName || !passengerPhone) {
      return NextResponse.json(
        { error: "Transfer bookings require passengerName and passengerPhone." },
        { status: 400 },
      );
    }
  }
  if (kind === "tour" || kind === "one_day_tour") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tourStartDate)) {
      return NextResponse.json(
        { error: "Tour bookings require tourStartDate (YYYY-MM-DD)." },
        { status: 400 },
      );
    }
  }
  if (kind === "tour") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tourEndDate)) {
      return NextResponse.json(
        { error: "Multi-day tour bookings require tourEndDate (YYYY-MM-DD)." },
        { status: 400 },
      );
    }
    if (tourEndDate < tourStartDate) {
      return NextResponse.json(
        { error: "tourEndDate must be on or after tourStartDate." },
        { status: 400 },
      );
    }
  }

  const companyId = await getTourismCompanyRecordIdForClerkUser(userId);
  if (!companyId) {
    return NextResponse.json(
      {
        error:
          "No company linked to this account. Set Users.company_ref in Airtable or DEFAULT_TOURISM_COMPANY_RECORD_ID.",
      },
      { status: 400 },
    );
  }

  const tourEndForAirtable =
    kind === "tour" && /^\d{4}-\d{2}-\d{2}$/.test(tourEndDate) ? tourEndDate : null;
  const overnightForAirtable = kind === "tour" ? overnightStay : false;

  const fields: Record<string, unknown> = {
    kind: KIND_MAP[kind] ?? kind,
    [AIRTABLE_BOOKING_PICKUP]: pickup,
    [AIRTABLE_BOOKING_DROPOFF]: dropoff,
    [AIRTABLE_BOOKING_PICKUP_TIME]: pickupTime,
    [AIRTABLE_BOOKING_PRICE_GEL]: clientPrice ?? 0,
    [AIRTABLE_BOOKING_STATUS]: "pending",
    [AIRTABLE_BOOKING_COMPANY]: [companyId],
    [AIRTABLE_BOOKING_DRIVER]: [driverId],
    [AIRTABLE_BOOKING_VEHICLE]: [vehicleId],
    passengers_count: passengersCount,
    children_count: childrenCount,
    contact_person: contactPerson || null,
    flight_number: flightNumber || null,
    passenger_name: passengerName || null,
    passenger_phone: passengerPhone || null,
    sign_text: signText || null,
    comment: comment || null,
    luggage_count: luggageCount,
    client_price: clientPrice,
    commission_gel: commissionGel,
    tour_start_date: tourStartDate || null,
    tour_end_date: tourEndForAirtable,
    overnight_stay: overnightForAirtable,
    route_description: routeDescription || null,
  };

  if (paymentAirtable) {
    fields.payment_method = paymentAirtable;
  }

  try {
    const base = getAirtableBase();
    const row = await base(AIRTABLE_TABLES.Bookings).create(
      fields as unknown as Partial<FieldSet>,
    );
    return NextResponse.json({ ok: true as const, id: row.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Airtable create failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
