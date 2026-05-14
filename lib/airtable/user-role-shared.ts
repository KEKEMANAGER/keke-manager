import { asString } from "@/lib/airtable/field-utils";

export type AppUserRole = "driver" | "company" | "admin" | null;

function normalizeRole(raw: string | null): AppUserRole {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === "driver" || s === "company" || s === "admin") return s;
  return null;
}

/** Parse Role from a Users record `fields` object (REST or SDK). */
export function parseAppUserRoleFromFields(
  fields: Record<string, unknown>,
): AppUserRole {
  const raw = asString(fields["Role"]) ?? asString(fields["role"]);
  return normalizeRole(raw);
}
