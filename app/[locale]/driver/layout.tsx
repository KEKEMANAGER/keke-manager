import { currentUser } from "@clerk/nextjs/server";
import { DriverDesktopShell } from "@/components/dashboard/DriverDesktopShell";
import type { DriverShellProfile } from "@/components/dashboard/DriverDesktopShell";
import { ensureClerkDriverRecords } from "@/lib/airtable/sync-clerk-driver";
import { getDriverProfile } from "@/lib/airtable/driver-profile";
import { VEHICLE_CLASS_LABELS } from "@/lib/vehicle-class-labels";
import type { DriverProfile } from "@/lib/types";
import { DriverAuthSync } from "./DriverAuthSync";

function initials(p: DriverProfile): string {
  const a = p.firstName?.trim().charAt(0) ?? "";
  const b = p.lastName?.trim().charAt(0) ?? "";
  const s = `${a}${b}`.toUpperCase();
  return s || "?";
}

export default async function DriverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let profile: DriverShellProfile = null;
  const user = await currentUser();
  const clerkId = user?.id;
  if (clerkId) {
    const email = user.emailAddresses?.[0]?.emailAddress ?? "";
    const clerkFullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    try {
      await ensureClerkDriverRecords(clerkId, email, clerkFullName);
      const p = await getDriverProfile(clerkId);
      if (p) {
        const full =
          p.firstName || p.lastName ? [p.firstName, p.lastName].filter(Boolean).join(" ") : "მძღოლი";
        profile = {
          portraitPhotoUrl: p.portraitPhotoUrl,
          fullName: full,
          vehicleLine: `${p.vehicleModel} · ${VEHICLE_CLASS_LABELS[p.vehicleCategory]}`,
          initials: initials(p),
        };
      }
    } catch {
      profile = null;
    }
  }

  return (
    <>
      <DriverAuthSync />
      <DriverDesktopShell profile={profile}>{children}</DriverDesktopShell>
    </>
  );
}
