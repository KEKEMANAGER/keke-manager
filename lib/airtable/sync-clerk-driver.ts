import type { FieldSet } from "airtable";
import { getAirtableBase } from "@/lib/airtable/client";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import { linkedRecordIds } from "@/lib/airtable/field-utils";

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const LOG = "[sync-clerk-driver]";

/**
 * იდემპოტენტური: Users + Drivers Airtable-ში Clerk მომხმარებლისთვის (Role=driver).
 * Users ველები: clerk_id, Email, Name, Role (Airtable სახელები ზუსტად).
 */
export async function ensureClerkDriverRecords(
  clerkUserId: string,
  email: string,
  /** Clerk სრული სახელი → Airtable `Name` */
  fullName?: string,
): Promise<void> {
  console.log(`${LOG} start`, { clerkUserIdLen: clerkUserId?.length });
  const base = getAirtableBase();
  const q = escapeFormulaString(clerkUserId);

  console.log(`${LOG} step: lookup Users by clerk_id`);
  const userRows = await base(AIRTABLE_TABLES.Users)
    .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
    .firstPage();
  console.log(`${LOG} Users lookup rows:`, userRows.length);

  let userRec = userRows[0];
  if (!userRec) {
    const emailVal =
      email?.trim() ||
      `${clerkUserId.replace(/@/g, "_")}@users.clerk.placeholder`;
    console.log(`${LOG} step: create Users (try with role)`);
    try {
      userRec = await base(AIRTABLE_TABLES.Users).create({
        clerk_id: clerkUserId,
        Email: emailVal,
        Name: fullName?.trim() || "",
        Role: "driver",
      } as Partial<FieldSet>);
      console.log(`${LOG} Users created with role, id:`, userRec.id);
    } catch (firstErr) {
      console.log(`${LOG} Users create with role failed:`, firstErr);
      try {
        console.log(`${LOG} step: create Users (Email only)`);
        userRec = await base(AIRTABLE_TABLES.Users).create({
          clerk_id: clerkUserId,
          Email: emailVal,
          Name: fullName?.trim() || "",
        } as Partial<FieldSet>);
        console.log(`${LOG} Users created email-only, id:`, userRec.id);
      } catch (inner) {
        const msg = inner instanceof Error ? inner.message : String(inner);
        console.error(`${LOG} Users create failed completely:`, inner);
        throw new Error(`Airtable Users: ვერ შეიქმნა ჩანაწერი — ${msg}`);
      }
    }
  }

  if (!userRec?.id) {
    console.error(`${LOG} abort: no userRec.id`);
    throw new Error("Airtable Users: ჩანაწერი ვერ მოიძებნა.");
  }

  console.log(`${LOG} step: lookup Drivers by clerk_id`);
  const driverRows = await base(AIRTABLE_TABLES.Drivers)
    .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
    .firstPage();
  console.log(`${LOG} Drivers lookup rows:`, driverRows.length);

  let driverRec = driverRows[0];
  if (!driverRec) {
    console.log(`${LOG} step: create Drivers with driver_ref`);
    try {
      driverRec = await base(AIRTABLE_TABLES.Drivers).create({
        clerk_id: clerkUserId,
        driver_ref: [userRec.id],
      } as Partial<FieldSet>);
      console.log(`${LOG} Drivers created id:`, driverRec.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${LOG} Drivers create failed:`, e);
      throw new Error(`Airtable Drivers: ვერ შეიქმნა ჩანაწერი — ${msg}`);
    }
  }

  console.log(`${LOG} step: update Drivers.driver_ref`);
  try {
    await base(AIRTABLE_TABLES.Drivers).update(driverRec.id, {
      driver_ref: [userRec.id],
    } as Partial<FieldSet>);
    console.log(`${LOG} Drivers driver_ref update ok`);
  } catch (updErr) {
    console.log(`${LOG} Drivers driver_ref update skipped/failed:`, updErr);
  }

  console.log(`${LOG} step: optional Users.driver_ref back-link`);
  try {
    const driversFromUser = linkedRecordIds(userRec.fields["driver_ref"]);
    if (!driversFromUser.includes(driverRec.id)) {
      await base(AIRTABLE_TABLES.Users).update(userRec.id, {
        driver_ref: [driverRec.id],
      } as Partial<FieldSet>);
      console.log(`${LOG} Users driver_ref back-link ok`);
    } else {
      console.log(`${LOG} Users driver_ref already set`);
    }
  } catch (backErr) {
    console.log(`${LOG} Users driver_ref back-link skipped:`, backErr);
  }

  console.log(`${LOG} done`);
}
