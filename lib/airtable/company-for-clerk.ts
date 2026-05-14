import { getAirtableBase } from "@/lib/airtable/client";
import { cachedAirtableRead } from "@/lib/airtable/cached-data";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import { linkedRecordIds } from "@/lib/airtable/field-utils";

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Clerk user → TourismCompanies record id (Users.company_ref) or env fallback.
 */
async function loadTourismCompanyRecordIdForClerkUser(
  clerkUserId: string,
): Promise<string | null> {
  const fallback = process.env.DEFAULT_TOURISM_COMPANY_RECORD_ID?.trim() || null;
  const base = getAirtableBase();
  const q = escapeFormulaString(clerkUserId);
  const rows = await base(AIRTABLE_TABLES.Users)
    .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
    .firstPage();
  const user = rows[0];
  if (!user) return fallback;
  const fromUser = linkedRecordIds(
    (user.fields as Record<string, unknown>)["company_ref"],
  )[0];
  if (fromUser) return fromUser;
  return fallback;
}

export async function getTourismCompanyRecordIdForClerkUser(
  clerkUserId: string,
): Promise<string | null> {
  return cachedAirtableRead(
    ["airtable", "getTourismCompanyRecordIdForClerkUser", clerkUserId],
    () => loadTourismCompanyRecordIdForClerkUser(clerkUserId),
  );
}
