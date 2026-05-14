import type { FieldSet, Record as AirtableRecord } from "airtable";
import type { BookingKind } from "@/types/airtable";
import { coerceBookingKind } from "@/lib/airtable/bookings";
import { getAirtableBase } from "@/lib/airtable/client";
import { cachedAirtableRead } from "@/lib/airtable/cached-data";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import { linkedRecordIds, asNumber, asString } from "@/lib/airtable/field-utils";

/** Bookings row as shown on driver dashboard (Airtable field names: Pickup, Company, …). */
export interface DriverBookingRow {
  id: string;
  kind: BookingKind;
  pickup: string | null;
  dropoff: string | null;
  pickupTime: string | null;
  /** Fallback when `Pickup time` is empty — Airtable `start_datetime` */
  startDatetime: string | null;
  status: string | null;
  priceGel: number | null;
  clientPriceGel: number | null;
  companyName: string | null;
}

const F_PICKUP = "Pickup" as const;
const F_DROPOFF = "Dropoff" as const;
const F_PICKUP_TIME = "Pickup time" as const;
const F_STATUS = "Status" as const;
const F_PRICE_GEL = "Price GEL" as const;
const F_COMPANY = "Company" as const;
const F_DRIVER = "Driver" as const;
const F_KIND = "kind" as const;
const F_CLIENT_PRICE = "client_price" as const;
const F_START_DATETIME = "start_datetime" as const;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function escapeRecordIdForFormula(id: string): string {
  return id.replace(/'/g, "\\'");
}

function mapDriverBookingRow(
  record: AirtableRecord<FieldSet>,
  companyNames: Map<string, string>,
): DriverBookingRow {
  const f = record.fields as Record<string, unknown>;
  const companyIds = linkedRecordIds(f[F_COMPANY]);
  const companyName =
    companyIds.map((id) => companyNames.get(id)).find(Boolean) ?? null;

  return {
    id: record.id,
    kind: coerceBookingKind(f[F_KIND]),
    pickup: asString(f[F_PICKUP]),
    dropoff: asString(f[F_DROPOFF]),
    pickupTime: asString(f[F_PICKUP_TIME]),
    startDatetime: asString(f[F_START_DATETIME]),
    status: asString(f[F_STATUS]),
    priceGel: asNumber(f[F_PRICE_GEL]),
    clientPriceGel: asNumber(f[F_CLIENT_PRICE]),
    companyName,
  };
}

async function fetchCompanyNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return map;

  const base = getAirtableBase();
  for (const idBatch of chunk(unique, 45)) {
    if (idBatch.length === 0) continue;
    const or = idBatch
      .map((id) => `RECORD_ID()='${escapeRecordIdForFormula(id)}'`)
      .join(",");
    const rows = await base(AIRTABLE_TABLES.TourismCompanies)
      .select({ filterByFormula: `OR(${or})` })
      .all();
    for (const row of rows) {
      const f = row.fields as Record<string, unknown>;
      const name =
        asString(f["Company name"]) ??
        asString(f["legal_name"]) ??
        asString(f["Legal name"]) ??
        asString(f["legalName"]);
      if (name) map.set(row.id, name);
    }
  }
  return map;
}

/**
 * Bookings linked to this driver (`Driver` link field contains `driverRecordId`).
 */
async function loadDriverBookings(
  driverRecordId: string,
): Promise<DriverBookingRow[]> {
  const base = getAirtableBase();
  const rows = await base(AIRTABLE_TABLES.Bookings).select().all();
  const mine = rows.filter((r) => {
    const f = r.fields as Record<string, unknown>;
    return linkedRecordIds(f[F_DRIVER]).includes(driverRecordId);
  });

  const companyIds: string[] = [];
  for (const r of mine) {
    companyIds.push(
      ...linkedRecordIds((r.fields as Record<string, unknown>)[F_COMPANY]),
    );
  }
  const companyNames = await fetchCompanyNamesByIds(companyIds);

  return mine.map((r) => mapDriverBookingRow(r, companyNames));
}

export async function getDriverBookings(
  driverRecordId: string,
): Promise<DriverBookingRow[]> {
  if (!driverRecordId.trim()) return [];
  return cachedAirtableRead(
    ["airtable", "getDriverBookings", driverRecordId],
    () => loadDriverBookings(driverRecordId),
  );
}
