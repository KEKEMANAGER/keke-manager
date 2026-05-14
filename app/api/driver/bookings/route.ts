import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDriverProfile } from "@/lib/airtable/driver-profile";
import { getDriverBookings } from "@/lib/airtable/driver-bookings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getDriverProfile(userId);
  if (!profile?.id) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  const bookings = await getDriverBookings(profile.id);
  return NextResponse.json({ bookings });
}
