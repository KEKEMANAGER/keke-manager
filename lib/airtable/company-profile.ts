import type { FieldSet, Record as AirtableRecord } from "airtable";
import { getAirtableBase } from "@/lib/airtable/client";
import { cachedAirtableRead } from "@/lib/airtable/cached-data";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import {
  linkedRecordIds,
  firstAttachmentUrl,
  asString,
  asNumber,
} from "@/lib/airtable/field-utils";

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Airtable TourismCompanies — ველის სახელები ზუსტად ბაზის მიხედვით */
export const COMPANY_AIRTABLE_FIELDS = {
  companyName: "Company name",
  email: "email",
  phone: "phone",
  employeesCount: "employees_count",
  logo: "logo",
  description: "description",
  licenseNumber: "License number",
  commissionPercent: "Commission %",
  trialEnds: "Trial ends",
  plan: "Plan",
} as const;

export const COMPANY_PLAN_OPTIONS = ["trial", "full"] as const;

export type CompanyPlanOption = (typeof COMPANY_PLAN_OPTIONS)[number];

export interface CompanyProfile {
  id: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  employeesCount: number | null;
  logoUrl: string | null;
  description: string | null;
  licenseNumber: string | null;
  commissionPercent: number | null;
  trialEnds: string | null;
  plan: string | null;
}

function normalizeAirtableDate(raw: unknown): string | null {
  const s = asString(raw);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : s;
}

function mapCompanyRecord(rec: AirtableRecord<FieldSet>): CompanyProfile {
  const f = rec.fields as Record<string, unknown>;
  const C = COMPANY_AIRTABLE_FIELDS;
  return {
    id: rec.id,
    companyName: asString(f[C.companyName]),
    email: asString(f[C.email]),
    phone: asString(f[C.phone]),
    employeesCount: asNumber(f[C.employeesCount]),
    logoUrl: firstAttachmentUrl(f[C.logo]),
    description: asString(f[C.description]),
    licenseNumber: asString(f[C.licenseNumber]),
    commissionPercent: asNumber(f[C.commissionPercent]),
    trialEnds: normalizeAirtableDate(f[C.trialEnds]),
    plan: asString(f[C.plan]),
  };
}

/**
 * Clerk user → Users.company_ref → TourismCompanies ყველა ველი CompanyProfile-ად.
 */
async function loadCompanyProfile(
  clerkUserId: string,
): Promise<CompanyProfile | null> {
  const base = getAirtableBase();
  const q = escapeFormulaString(clerkUserId);
  const userRows = await base(AIRTABLE_TABLES.Users)
    .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
    .firstPage();
  const user = userRows[0];
  if (!user) return null;
  const companyIds = linkedRecordIds(
    (user.fields as Record<string, unknown>)["company_ref"],
  );
  const companyRecordId = companyIds[0];
  if (!companyRecordId) return null;

  let companyRec: AirtableRecord<FieldSet>;
  try {
    companyRec = await base(AIRTABLE_TABLES.TourismCompanies).find(companyRecordId);
  } catch {
    return null;
  }
  return mapCompanyRecord(companyRec);
}

export async function getCompanyProfile(
  clerkUserId: string,
): Promise<CompanyProfile | null> {
  if (!clerkUserId.trim()) return null;
  return cachedAirtableRead(
    ["airtable", "getCompanyProfile", clerkUserId],
    () => loadCompanyProfile(clerkUserId),
  );
}

/** ლოგოს არქონდეს — წრეში ინიციალები "Company name"-დან. */
export function companyInitialsFromName(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  if (!t) return "—";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]![0] ?? "";
    const b = parts[1]![0] ?? "";
    return (a + b).toUpperCase() || "—";
  }
  return t.slice(0, 2).toUpperCase() || "—";
}
