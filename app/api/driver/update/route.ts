import type { FieldSet } from "airtable";
import Airtable from "airtable";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAirtableBase } from "@/lib/airtable/client";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import { fetchVehiclesByDriverRecordIds } from "@/lib/airtable/drivers";
import { linkedRecordIds } from "@/lib/airtable/field-utils";
import { VEHICLE_CLASS_ORDER } from "@/lib/vehicle-class-labels";
import type { VehicleClass } from "@/types/airtable";
import { DRIVER_AIRTABLE_LANGUAGE_SET } from "@/lib/driver-airtable-languages";

const LOG = "[driver/update]";

/** Airtable Vehicles single-line text — must not use legacy `make_model`. */
const AIRTABLE_VEHICLE_MODEL_FIELD = "Model" as const;
const AIRTABLE_VEHICLE_PLATE_FIELD = "Plate" as const;
const AIRTABLE_VEHICLE_CLASS_FIELD = "Class" as const;
const AIRTABLE_VEHICLE_YEAR_FIELD = "Year" as const;
const AIRTABLE_VEHICLE_COLOR_FIELD = "Color" as const;
const AIRTABLE_VEHICLE_DRIVER_FIELD = "Driver" as const;
/** Drivers table — linked Vehicles records */
const AIRTABLE_DRIVER_VEHICLES_FIELD = "Vehicles" as const;

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function resolvePrimaryVehicleRecordId(
  driverRecordId: string,
  fields: Record<string, unknown>,
): Promise<string | null> {
  const fromLink = linkedRecordIds(fields[AIRTABLE_DRIVER_VEHICLES_FIELD])[0];
  if (fromLink) return fromLink;
  const map = await fetchVehiclesByDriverRecordIds([driverRecordId]);
  return map.get(driverRecordId)?.id ?? null;
}

function isVehicleClass(v: unknown): v is VehicleClass {
  return typeof v === "string" && VEHICLE_CLASS_ORDER.includes(v as VehicleClass);
}

function airtableErrorDetails(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof Airtable.Error)) return null;
  return {
    error: error.error,
    message: error.message,
    statusCode: error.statusCode,
  };
}

/** Airtable SDK errors are plain objects — not `instanceof Error` — so we map them explicitly. */
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
  return "Airtable update failed.";
}

function parseLanguagesForAirtable(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is string =>
      typeof x === "string" && DRIVER_AIRTABLE_LANGUAGE_SET.has(x),
  );
}

function serializedFields(fields: Partial<FieldSet>) {
  return JSON.parse(JSON.stringify(fields)) as Record<string, unknown>;
}

export async function PATCH(req: Request) {
  console.log("[driver/update] env check:", {
    hasApiKey: !!process.env.AIRTABLE_API_KEY,
    hasBaseId: !!process.env.AIRTABLE_BASE_ID,
  });

  console.log("[driver/update] step 1: auth check");
  const { userId } = await auth();
  console.log("[driver/update] step 1 done: auth returned", {
    hasUserId: !!userId,
  });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[driver/update] step 2: body parse");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  console.log("[driver/update] step 2 done: body parsed", {
    isObject: body != null && typeof body === "object",
  });

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  console.log("[driver/update] step 3: validation");
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const modelText =
    typeof b.make_model === "string" ? b.make_model.trim() : "";
  const plateText =
    typeof b.license_plate === "string" ? b.license_plate.trim() : "";
  const colorText = typeof b.color === "string" ? b.color.trim() : "";
  const bioText =
    typeof b.bio === "string" ? b.bio.slice(0, 300) : "";
  const languagesForAirtable = parseLanguagesForAirtable(b.languages);

  if (!isVehicleClass(b.category)) {
    return NextResponse.json({ error: "Invalid vehicle class" }, { status: 400 });
  }
  const category = b.category;

  let year: number | null = null;
  if (b.year === null || b.year === undefined || b.year === "") {
    year = null;
  } else if (typeof b.year === "number" && Number.isFinite(b.year)) {
    year = b.year;
  } else if (typeof b.year === "string" && b.year.trim() !== "") {
    const n = Number(b.year);
    year = Number.isFinite(n) ? n : null;
  }
  console.log("[driver/update] step 3 done: validation OK", {
    category,
    yearSet: year != null,
  });

  console.log("[driver/update] step 4: before Airtable");
  const base = getAirtableBase();
  console.log("[driver/update] step 4 done: base client ready");
  const q = escapeFormulaString(userId);
  console.log("[driver/update] step 5: Drivers.lookup calling firstPage()");
  let driverRows;
  try {
    driverRows = await base(AIRTABLE_TABLES.Drivers)
      .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
      .firstPage();
  } catch (error) {
    console.error(`${LOG} ERROR:`, error);
    const air = airtableErrorDetails(error);
    if (air) console.error(`${LOG} Airtable:`, air);
    console.error(`${LOG} failed step:`, "Drivers lookup");
    console.log(`${LOG} fields sent:`, {
      table: AIRTABLE_TABLES.Drivers,
      filterByFormula: `{clerk_id} = '${q}'`,
    });
    const message = safeApiErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  console.log("[driver/update] step 5 done: Drivers.lookup", {
    rows: driverRows.length,
  });
  if (!driverRows.length) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  const driverRow = driverRows[0];
  console.log("[driver/update] step 6: resolve primary vehicle id");

  const vehiclesAirtablePayload: Partial<FieldSet> = {
    [AIRTABLE_VEHICLE_MODEL_FIELD]: modelText,
    [AIRTABLE_VEHICLE_PLATE_FIELD]: plateText,
    [AIRTABLE_VEHICLE_CLASS_FIELD]: category,
    [AIRTABLE_VEHICLE_COLOR_FIELD]: colorText,
    ...(year != null ? { [AIRTABLE_VEHICLE_YEAR_FIELD]: year } : {}),
  };

  const driverUpdates: Partial<FieldSet> = {
    Name: name,
    bio: bioText,
    languages: languagesForAirtable,
  };

  let vehicleId: string | null;
  try {
    vehicleId = await resolvePrimaryVehicleRecordId(
      driverRow.id,
      driverRow.fields as Record<string, unknown>,
    );
    console.log("[driver/update] step 6 done: vehicle record id", {
      vehicleId,
    });
  } catch (error) {
    console.error(`${LOG} ERROR:`, error);
    const air = airtableErrorDetails(error);
    if (air) console.error(`${LOG} Airtable:`, air);
    console.error(`${LOG} failed step:`, "Vehicles update");
    console.log(`${LOG} fields sent:`, {
      table: AIRTABLE_TABLES.Vehicles,
      driverRecordId: driverRow.id,
      intent: "resolve primary vehicle (link or scan)",
      vehicleFieldsForNextWrite: serializedFields(vehiclesAirtablePayload),
    });
    const message = safeApiErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  console.log("[driver/update] step 7: Vehicles mutate (update or create)");
  try {
    if (vehicleId) {
      console.log(`${LOG} fields sent:`, {
        table: AIRTABLE_TABLES.Vehicles,
        operation: "update",
        recordId: vehicleId,
        fieldNames: Object.keys(vehiclesAirtablePayload),
        fields: serializedFields(vehiclesAirtablePayload),
      });
      await base(AIRTABLE_TABLES.Vehicles).update(
        vehicleId,
        vehiclesAirtablePayload,
      );
    } else {
      const vehiclesCreatePayload = {
        ...vehiclesAirtablePayload,
        [AIRTABLE_VEHICLE_DRIVER_FIELD]: [driverRow.id],
      } as Partial<FieldSet>;
      console.log(`${LOG} fields sent:`, {
        table: AIRTABLE_TABLES.Vehicles,
        operation: "create",
        fieldNames: Object.keys(vehiclesCreatePayload),
        fields: serializedFields(vehiclesCreatePayload),
      });
      const created = await base(AIRTABLE_TABLES.Vehicles).create(
        vehiclesCreatePayload,
      );
      const prev = linkedRecordIds(driverRow.fields[AIRTABLE_DRIVER_VEHICLES_FIELD]);
      driverUpdates[AIRTABLE_DRIVER_VEHICLES_FIELD] = [...prev, created.id];
    }
    console.log("[driver/update] step 7 done: Vehicles mutate OK");
  } catch (error) {
    console.error(`${LOG} ERROR:`, error);
    const air = airtableErrorDetails(error);
    if (air) console.error(`${LOG} Airtable:`, air);
    console.error(`${LOG} failed step:`, "Vehicles update");
    const failedVehiclePayload = (
      vehicleId
        ? vehiclesAirtablePayload
        : ({
            ...vehiclesAirtablePayload,
            [AIRTABLE_VEHICLE_DRIVER_FIELD]: [driverRow.id],
          } as Partial<FieldSet>)
    );
    console.log(`${LOG} fields sent:`, {
      table: AIRTABLE_TABLES.Vehicles,
      operation: vehicleId ? "update" : "create",
      ...(vehicleId ? { recordId: vehicleId } : {}),
      fieldNames: Object.keys(failedVehiclePayload),
      fields: serializedFields(failedVehiclePayload),
    });
    const message = safeApiErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  console.log("[driver/update] step 8: Drivers.update");
  try {
    console.log(`${LOG} fields sent:`, {
      table: AIRTABLE_TABLES.Drivers,
      operation: "update",
      recordId: driverRow.id,
      fieldNames: Object.keys(driverUpdates),
      fields: serializedFields(driverUpdates),
    });
    await base(AIRTABLE_TABLES.Drivers).update(driverRow.id, driverUpdates);
    console.log("[driver/update] step 8 done: Drivers.update OK");
  } catch (error) {
    console.error(`${LOG} ERROR:`, error);
    const air = airtableErrorDetails(error);
    if (air) console.error(`${LOG} Airtable:`, air);
    console.error(`${LOG} failed step:`, "Drivers update");
    console.log(`${LOG} fields sent:`, {
      table: AIRTABLE_TABLES.Drivers,
      operation: "update",
      recordId: driverRow.id,
      fieldNames: Object.keys(driverUpdates),
      fields: serializedFields(driverUpdates),
    });
    const message = safeApiErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  console.log("[driver/update] step 9: PATCH complete");
  return NextResponse.json({ ok: true });
}
