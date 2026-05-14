import type { FieldSet } from "airtable";
import Airtable from "airtable";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAirtableBase } from "@/lib/airtable/client";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import {
  COMPANY_AIRTABLE_FIELDS,
  COMPANY_PLAN_OPTIONS,
  getCompanyProfile,
} from "@/lib/airtable/company-profile";

export const runtime = "nodejs";

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
  return "Airtable update failed.";
}

function isPlan(v: unknown): v is (typeof COMPANY_PLAN_OPTIONS)[number] {
  return typeof v === "string" && (COMPANY_PLAN_OPTIONS as readonly string[]).includes(v);
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
  const companyName =
    typeof b.companyName === "string" ? b.companyName.trim() : "";
  if (!companyName) {
    return NextResponse.json(
      { error: "Company name is required." },
      { status: 400 },
    );
  }

  const email = typeof b.email === "string" ? b.email.trim() : "";
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  const description =
    typeof b.description === "string" ? b.description.trim() : "";
  const licenseNumber =
    typeof b.licenseNumber === "string" ? b.licenseNumber.trim() : "";

  if (!isPlan(b.plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  let employeesCount: number | null = null;
  if (b.employeesCount === null || b.employeesCount === "") {
    employeesCount = null;
  } else if (typeof b.employeesCount === "number" && Number.isFinite(b.employeesCount)) {
    employeesCount = Math.max(0, Math.round(b.employeesCount));
  } else if (typeof b.employeesCount === "string" && b.employeesCount.trim() !== "") {
    const n = Number(b.employeesCount);
    if (!Number.isFinite(n)) {
      return NextResponse.json(
        { error: "Invalid employees_count." },
        { status: 400 },
      );
    }
    employeesCount = Math.max(0, Math.round(n));
  }

  let commissionPercent: number | null = null;
  if (b.commissionPercent === null || b.commissionPercent === "") {
    commissionPercent = null;
  } else if (
    typeof b.commissionPercent === "number" &&
    Number.isFinite(b.commissionPercent)
  ) {
    commissionPercent = b.commissionPercent;
  } else if (
    typeof b.commissionPercent === "string" &&
    b.commissionPercent.trim() !== ""
  ) {
    const n = Number(b.commissionPercent);
    if (!Number.isFinite(n)) {
      return NextResponse.json(
        { error: "Invalid commission percent." },
        { status: 400 },
      );
    }
    commissionPercent = n;
  }

  let trialEnds: string | null = null;
  if (b.trialEnds === null || b.trialEnds === "") {
    trialEnds = null;
  } else if (typeof b.trialEnds === "string") {
    const d = b.trialEnds.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json(
        { error: "Invalid trial ends date (use YYYY-MM-DD)." },
        { status: 400 },
      );
    }
    trialEnds = d;
  } else {
    return NextResponse.json({ error: "Invalid trial ends." }, { status: 400 });
  }

  const profile = await getCompanyProfile(userId);
  if (!profile) {
    return NextResponse.json(
      { error: "Tourism company not linked to this user." },
      { status: 404 },
    );
  }

  const C = COMPANY_AIRTABLE_FIELDS;
  const fields: Record<string, unknown> = {
    [C.companyName]: companyName,
    [C.email]: email || null,
    [C.phone]: phone || null,
    [C.description]: description || null,
    [C.licenseNumber]: licenseNumber || null,
    [C.plan]: b.plan,
  };

  if (employeesCount != null) {
    fields[C.employeesCount] = employeesCount;
  } else {
    fields[C.employeesCount] = null;
  }

  if (commissionPercent != null) {
    fields[C.commissionPercent] = commissionPercent;
  } else {
    fields[C.commissionPercent] = null;
  }

  if (trialEnds != null) {
    fields[C.trialEnds] = trialEnds;
  } else {
    fields[C.trialEnds] = null;
  }

  const base = getAirtableBase();
  try {
    await base(AIRTABLE_TABLES.TourismCompanies).update(
      profile.id,
      fields as Partial<FieldSet>,
    );
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
