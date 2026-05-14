import type { FieldSet } from "airtable";
import Airtable from "airtable";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAirtableBase } from "@/lib/airtable/client";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import { linkedRecordIds } from "@/lib/airtable/field-utils";

const F_DRIVER = "Driver" as const;
const F_STATUS = "Status" as const;

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function airtableErrorDetails(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof Airtable.Error)) return null;
  return {
    error: error.error,
    message: error.message,
    statusCode: error.statusCode,
  };
}

function safeApiErrorMessage(error: unknown): string {
  if (error instanceof Airtable.Error) {
    const bits = [
      error.message,
      error.error ? `[${error.error}]` : null,
      error.statusCode ? `HTTP ${error.statusCode}` : null,
    ].filter(Boolean);
    return bits.join(" ");
  }
  if (error instanceof Error) return error.message;
  if (
    error != null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Update failed.";
}

export async function PATCH(req: Request) {
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
  const bookingId = typeof b.bookingId === "string" ? b.bookingId.trim() : "";
  const action = b.action === "accept" || b.action === "reject" ? b.action : null;

  if (!bookingId || !action) {
    return NextResponse.json(
      { error: "bookingId and action (accept | reject) are required." },
      { status: 400 },
    );
  }

  const nextStatus = action === "accept" ? "active" : "cancelled";

  const base = getAirtableBase();
  const q = escapeFormulaString(userId);

  let driverRows;
  try {
    driverRows = await base(AIRTABLE_TABLES.Drivers)
      .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
      .firstPage();
  } catch (error) {
    console.error("[driver/booking] Drivers lookup:", error);
    const air = airtableErrorDetails(error);
    if (air) console.error("[driver/booking] Airtable:", air);
    return NextResponse.json(
      { error: safeApiErrorMessage(error) },
      { status: 500 },
    );
  }

  if (!driverRows.length) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }
  const driverId = driverRows[0].id;

  let booking;
  try {
    booking = await base(AIRTABLE_TABLES.Bookings).find(bookingId);
  } catch {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const f = booking.fields as Record<string, unknown>;
  const driverLinks = linkedRecordIds(f[F_DRIVER]);
  if (!driverLinks.includes(driverId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await base(AIRTABLE_TABLES.Bookings).update(bookingId, {
      [F_STATUS]: nextStatus,
    } as Partial<FieldSet>);
  } catch (error) {
    console.error("[driver/booking] Bookings.update:", error);
    const air = airtableErrorDetails(error);
    if (air) console.error("[driver/booking] Airtable:", air);
    return NextResponse.json(
      { error: safeApiErrorMessage(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true as const, status: nextStatus });
}
