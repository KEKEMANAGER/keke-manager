import { getAirtableBase } from "@/lib/airtable/client";
import { cachedAirtableRead } from "@/lib/airtable/cached-data";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import type { DriverProfile } from "@/lib/types";
import {
  mapDriverRecord,
  fetchVehiclesByIds,
  fetchVehiclesByDriverRecordIds,
  driverToProfile,
} from "@/lib/airtable/drivers";
import {
  linkedRecordIds,
  asNumber,
  asString,
  asStringArray,
} from "@/lib/airtable/field-utils";

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const LOG = "[driver-profile]";

/** Drivers ცხრილის `Name` (Single line text): პირველი სიტყვა → firstName, დანარჩენი → lastName. */
function namesFromDriversNameField(fields: Record<string, unknown>): {
  firstName: string;
  lastName: string;
} {
  const nameFull = (asString(fields["Name"]) ?? "").trim();
  if (!nameFull) return { firstName: "", lastName: "" };
  const parts = nameFull.split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

/** ყველა LedgerEntries ჩანაწერი ამ driver ლინკით; თანხა — ველი `Amount GEL`. Status ფილტრი არ არის. */
async function sumAllLedgerForDriver(
  driverRecordId: string,
  fallbackBalance: number | null,
): Promise<number> {
  console.log(`${LOG} sumLedger: start`, { driverRecordId });
  const base = getAirtableBase();
  const q = escapeFormulaString(driverRecordId);
  try {
    console.log(`${LOG} sumLedger: querying LedgerEntries (driver only)`);
    const rows = await base(AIRTABLE_TABLES.LedgerEntries)
      .select({
        filterByFormula: `{driver}='${q}'`,
      })
      .all();
    console.log(`${LOG} sumLedger: rows`, rows.length);
    let sum = 0;
    for (const r of rows) {
      const n = asNumber(r.fields["Amount GEL"]);
      if (n != null) sum += n;
    }
    if (rows.length > 0) {
      console.log(`${LOG} sumLedger: sum from ledger`, sum);
      return sum;
    }
  } catch (ledgerErr) {
    console.log(`${LOG} sumLedger: query failed (using fallback)`, ledgerErr);
  }
  if (fallbackBalance != null && Number.isFinite(fallbackBalance)) {
    console.log(`${LOG} sumLedger: fallback internal_balance`, fallbackBalance);
    return fallbackBalance;
  }
  console.log(`${LOG} sumLedger: default 0`);
  return 0;
}

/**
 * Drivers სადაც `clerk_id` = Clerk userId; მანქანა vehicles / Vehicles.driver-ით.
 */
async function loadDriverProfile(clerkId: string): Promise<DriverProfile | null> {
  console.log(`${LOG} getDriverProfile start`, {
    clerkIdPrefix: clerkId?.slice(0, 12),
  });
  const base = getAirtableBase();
  const q = escapeFormulaString(clerkId);

  console.log(`${LOG} searching clerk_id:`, q);
  console.log(`${LOG} formula:`, `{clerk_id} = '${q}'`);

  let rows = await base(AIRTABLE_TABLES.Drivers)
    .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
    .firstPage();

  if (!rows.length) {
    const findFormula = `FIND('${q}', {clerk_id}) > 0`;
    console.log(`${LOG} formula (FIND fallback):`, findFormula);
    rows = await base(AIRTABLE_TABLES.Drivers)
      .select({ filterByFormula: findFormula, maxRecords: 1 })
      .firstPage();
  }

  console.log(`${LOG} Drivers rows:`, rows.length);
  if (!rows.length) {
    console.log(`${LOG} no driver row — return null`);
    return null;
  }

  const row = rows[0];
  console.log(`${LOG} raw fields:`, JSON.stringify(rows[0].fields));
  console.log(`${LOG} step: vehicle ids from vehicles link`);
  const vehicleIds = linkedRecordIds(row.fields["Vehicles"]);
  console.log(`${LOG} vehicles link count:`, vehicleIds.length);

  console.log(`${LOG} step: fetchVehiclesByIds`);
  const vehicleById = await fetchVehiclesByIds(vehicleIds);
  console.log(`${LOG} fetchVehiclesByIds map size:`, vehicleById.size);

  console.log(`${LOG} step: fetchVehiclesByDriverRecordIds`);
  const vehicleByDriverId = await fetchVehiclesByDriverRecordIds([row.id]);
  console.log(`${LOG} fetchVehiclesByDriverRecordIds map size:`, vehicleByDriverId.size);

  console.log(`${LOG} step: mapDriverRecord + driverToProfile`);
  const driver = mapDriverRecord(row, vehicleById, vehicleByDriverId);
  const profileBase = driverToProfile(driver);
  /** vehicleColor: primary vehicle — Airtable `Vehicles.Color` (mapVehicleRecord). */
  const { firstName, lastName } = namesFromDriversNameField(
    row.fields as Record<string, unknown>,
  );
  const rf = row.fields as Record<string, unknown>;
  const hasLicensePhoto =
    Array.isArray(rf["license_photo"]) && rf["license_photo"].length > 0;
  const hasIdPhoto = Array.isArray(rf["id_photo"]) && rf["id_photo"].length > 0;
  const hasPortraitPhoto =
    Array.isArray(rf["portrait_photo"]) && rf["portrait_photo"].length > 0;
  const bioFromRow = (asString(rf["bio"]) ?? "").trim() || undefined;
  const languagesFromRow = asStringArray(rf["languages"]);
  const languagesForProfile =
    languagesFromRow.length > 0 ? languagesFromRow : undefined;
  const baseCityRaw =
    (asString(rf["base_city"]) ?? asString(rf["Base city"]) ?? "").trim() ||
    undefined;

  const primaryVid =
    vehicleIds[0] ?? driver.primaryVehicle?.id ?? null;
  let hasVehiclePhotoFront = Boolean(driver.primaryVehicle?.photoFrontUrl);
  let hasVehiclePhotoRear = false;
  let hasVehiclePhotoLeft = false;
  let hasVehiclePhotoRight = false;
  let hasVehiclePhotoInterior = false;
  if (primaryVid) {
    try {
      const vrec = await base(AIRTABLE_TABLES.Vehicles).find(primaryVid);
      const vf = vrec.fields as Record<string, unknown>;
      const att = (k: string) =>
        Array.isArray(vf[k]) && vf[k].length > 0;
      hasVehiclePhotoFront = hasVehiclePhotoFront || att("photo_front");
      hasVehiclePhotoRear = att("photo_rear");
      hasVehiclePhotoLeft = att("photo_left");
      hasVehiclePhotoRight = att("photo_right");
      hasVehiclePhotoInterior = att("photo_interior");
    } catch {
      /* ველი ან ჩანაწერი შეიძლება არ არსებობდეს */
    }
  }

  const profile = {
    ...profileBase,
    firstName,
    lastName,
    bio: bioFromRow ?? profileBase.bio,
    languages: languagesForProfile ?? profileBase.languages,
    baseCity: baseCityRaw,
    hasLicensePhoto,
    hasIdPhoto,
    hasPortraitPhoto,
    hasVehiclePhotoFront,
    hasVehiclePhotoRear,
    hasVehiclePhotoLeft,
    hasVehiclePhotoRight,
    hasVehiclePhotoInterior,
  };
  console.log(`${LOG} profile result:`, JSON.stringify(profile));

  const internal =
    asNumber(row.fields["internal_balance"]) ??
    asNumber(row.fields["Internal balance"]);
  console.log(`${LOG} step: sumAllLedgerForDriver`, { internal });
  const balanceGel = await sumAllLedgerForDriver(row.id, internal);

  console.log(`${LOG} getDriverProfile done`, {
    recordId: row.id,
    balanceGel,
  });
  return {
    ...profile,
    balanceGel,
    licensePlate: driver.primaryVehicle?.licensePlate ?? profile.licensePlate,
  };
}

export async function getDriverProfile(
  clerkId: string,
): Promise<DriverProfile | null> {
  if (!clerkId.trim()) return null;
  return cachedAirtableRead(
    ["airtable", "getDriverProfile", clerkId],
    () => loadDriverProfile(clerkId),
  );
}
