import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getAirtableUserRoleByClerkId,
} from "@/lib/airtable/user-role";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ role: null }, { status: 401 });
  }
  try {
    const role = await getAirtableUserRoleByClerkId(userId);
    return NextResponse.json({ role });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Role lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
