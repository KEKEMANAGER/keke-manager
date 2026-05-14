import { getAirtableBase } from "@/lib/airtable/client";
import { cachedAirtableRead } from "@/lib/airtable/cached-data";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import {
  parseAppUserRoleFromFields,
  type AppUserRole,
} from "@/lib/airtable/user-role-shared";

export type { AppUserRole } from "@/lib/airtable/user-role-shared";
export { parseAppUserRoleFromFields } from "@/lib/airtable/user-role-shared";

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Users ცხრილი: `Role` ან `role` single-select. */
async function loadAirtableUserRoleByClerkId(
  clerkUserId: string,
): Promise<AppUserRole> {
  const base = getAirtableBase();
  const q = escapeFormulaString(clerkUserId);
  const rows = await base(AIRTABLE_TABLES.Users)
    .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
    .firstPage();
  const rec = rows[0];
  if (!rec) return null;
  return parseAppUserRoleFromFields(rec.fields as Record<string, unknown>);
}

export async function getAirtableUserRoleByClerkId(
  clerkUserId: string,
): Promise<AppUserRole> {
  if (!clerkUserId.trim()) return null;
  return cachedAirtableRead(
    ["airtable", "getAirtableUserRoleByClerkId", clerkUserId],
    () => loadAirtableUserRoleByClerkId(clerkUserId),
  );
}
