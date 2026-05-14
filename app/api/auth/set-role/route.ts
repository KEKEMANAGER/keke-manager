import type { FieldSet } from "airtable";
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAirtableBase } from "@/lib/airtable/client";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function POST(req: Request) {
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

  const role = (body as { role?: unknown }).role;
  if (role !== "driver" && role !== "company") {
    return NextResponse.json(
      { error: "role must be \"driver\" or \"company\"." },
      { status: 400 },
    );
  }

  const user = await currentUser();
  const email =
    user?.emailAddresses?.[0]?.emailAddress ??
    `${userId.replace(/@/g, "_")}@users.clerk.placeholder`;
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  const base = getAirtableBase();
  const q = escapeFormulaString(userId);
  const rows = await base(AIRTABLE_TABLES.Users)
    .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
    .firstPage();

  try {
    if (rows[0]) {
      await base(AIRTABLE_TABLES.Users).update(rows[0].id, {
        Role: role,
      } as Partial<FieldSet>);
    } else {
      await base(AIRTABLE_TABLES.Users).create({
        clerk_id: userId,
        Email: email,
        Name: fullName.trim(),
        Role: role,
      } as Partial<FieldSet>);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Airtable update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const });
}
