import type { FieldSet, Record as AirtableRecord } from "airtable";
import type { Driver, Vehicle, VehicleClass } from "@/types/airtable";
import type { DriverProfile } from "@/lib/types";
import { getAirtableBase } from "@/lib/airtable/client";
import { cachedAirtableRead } from "@/lib/airtable/cached-data";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import {
  linkedRecordIds,
  firstAttachmentUrl,
  asNumber,
  asString,
  asStringArray,
  asBoolean,
} from "@/lib/airtable/field-utils";
import { mapVehicleRecord } from "@/lib/airtable/records-vehicle";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function coerceCategoryFallback(v: Vehicle | null): VehicleClass {
  return v?.category ?? "sedan";
}

export async function fetchVehiclesByIds(ids: string[]): Promise<Map<string, Vehicle>> {
  const base = getAirtableBase();
  const map = new Map<string, Vehicle>();
  const unique = [...new Set(ids)].filter(Boolean);
  for (const idBatch of chunk(unique, 45)) {
    if (idBatch.length === 0) continue;
    const or = idBatch.map((id) => `RECORD_ID()='${id.replace(/'/g, "\\'")}'`).join(",");
    const formula = `OR(${or})`;
    const rows = await base(AIRTABLE_TABLES.Vehicles)
      .select({ filterByFormula: formula })
      .all();
    for (const row of rows) {
      map.set(row.id, mapVehicleRecord(row));
    }
  }
  return map;
}

/**
 * Vehicles სადაც `Driver` ლინკი მიუთითებს Drivers record id-ზე.
 * სრული სკანირება — ფორმულა OR({Driver}=…) მრავალ ლინკიან ველზე/shape-ზე შეიძლება ჩავარდეს.
 */
export async function fetchVehiclesByDriverRecordIds(
  driverRecordIds: string[],
): Promise<Map<string, Vehicle>> {
  const byDriver = new Map<string, Vehicle>();
  if (driverRecordIds.length === 0) return byDriver;
  const want = new Set(driverRecordIds);

  try {
    const base = getAirtableBase();
    const rows = await base(AIRTABLE_TABLES.Vehicles).select().all();
    for (const row of rows) {
      const mapped = mapVehicleRecord(row);
      for (const did of linkedRecordIds(row.fields["Driver"])) {
        if (want.has(did) && !byDriver.has(did)) byDriver.set(did, mapped);
      }
    }
  } catch {
    /* Vehicles ცხრილი / Driver ველი — გამოტოვება */
  }
  return byDriver;
}

export function mapDriverRecord(
  record: AirtableRecord<FieldSet>,
  vehicleById: Map<string, Vehicle>,
  vehicleByDriverId: Map<string, Vehicle>,
): Driver {
  const f = record.fields;
  const vehicleIds = linkedRecordIds(f["Vehicles"]);
  let primaryVehicle: Vehicle | null = null;
  if (vehicleIds.length) {
    primaryVehicle = vehicleById.get(vehicleIds[0]) ?? null;
  }
  if (!primaryVehicle) {
    primaryVehicle = vehicleByDriverId.get(record.id) ?? null;
  }

  /** Airtable Drivers: `Name` (არა first_name/last_name) ან ძველი snake_case */
  const nameFull = asString(f["Name"]);
  let firstName = asString(f["first_name"]) ?? "";
  let lastName = asString(f["last_name"]) ?? "";
  if (nameFull?.trim()) {
    const parts = nameFull.trim().split(/\s+/);
    firstName = firstName || parts[0] || "";
    lastName = lastName || parts.slice(1).join(" ") || "";
  }

  const ratingFromField =
    asNumber(f["Rating"]) ?? asNumber(f["rating"]) ?? 0;

  return {
    id: record.id,
    clerkId: asString(f["clerk_id"]),
    firstName,
    lastName,
    dob: asString(f["dob"]),
    photoUrl: firstAttachmentUrl(f["photo_3x4"]),
    portraitPhotoUrl: firstAttachmentUrl(f["portrait_photo"]),
    verified: asBoolean(f["verified"]),
    languages: asStringArray(f["languages"]),
    experienceYears: asNumber(f["experience_years"]),
    bio: asString(f["bio"]),
    subscriptionTier: asString(f["subscription_tier"]),
    internalBalance:
      asNumber(f["internal_balance"]) ??
      asNumber(f["Internal balance"]),
    vehicleIds,
    primaryVehicle,
    ratingAvg: ratingFromField,
    ratingCount: 0,
  };
}

/** Airtable: Drivers + დაკავშირებული Vehicles (`Vehicles` ლინკი, ველი `Driver` Vehicles-ზე). */
async function loadDrivers(): Promise<DriverProfile[]> {
  const base = getAirtableBase();
  const driverRows = await base(AIRTABLE_TABLES.Drivers).select().all();

  const vehicleIds = new Set<string>();
  for (const row of driverRows) {
    for (const id of linkedRecordIds(row.fields["Vehicles"])) vehicleIds.add(id);
  }
  const vehicleById = await fetchVehiclesByIds([...vehicleIds]);

  const needFallback = driverRows.filter(
    (r) => linkedRecordIds(r.fields["Vehicles"]).length === 0,
  );
  const vehicleByDriverId = await fetchVehiclesByDriverRecordIds(
    needFallback.map((r) => r.id),
  );

  const drivers = driverRows.map((row) =>
    mapDriverRecord(row, vehicleById, vehicleByDriverId),
  );
  return drivers.map(driverToProfile);
}

export async function getDrivers(): Promise<DriverProfile[]> {
  return cachedAirtableRead(["airtable", "getDrivers"], () => loadDrivers());
}

/** DriverCard / UI — შიდა გამოყენება + ტესტები. */
export function driverToProfile(d: Driver): DriverProfile {
  const v = d.primaryVehicle;
  const category = coerceCategoryFallback(v);
  return {
    id: d.id,
    firstName: d.firstName,
    lastName: d.lastName,
    photoUrl: d.photoUrl ?? undefined,
    portraitPhotoUrl: d.portraitPhotoUrl ?? undefined,
    verified: d.verified,
    languages: d.languages.length ? d.languages : undefined,
    ratingAvg: d.ratingAvg,
    ratingCount: d.ratingCount,
    bio: d.bio ?? undefined,
    experienceYears: d.experienceYears ?? undefined,
    vehicleModel: v?.makeModel ?? "—",
    vehicleYear: v?.year ?? new Date().getFullYear(),
    vehicleCategory: category,
    vehicleColor: v?.color ?? undefined,
    seats: v?.seats ?? 0,
    luggageSlots: v?.luggageSlots ?? 0,
    fuelType: v?.fuelType ?? "—",
    indicativePrice: undefined,
    vehicleImageUrl: v?.photoExteriorUrl ?? undefined,
    vehicleFrontPhotoUrl: v?.photoFrontUrl ?? undefined,
    primaryVehicleId: v?.id,
    licensePlate: v?.licensePlate ?? undefined,
  };
}
