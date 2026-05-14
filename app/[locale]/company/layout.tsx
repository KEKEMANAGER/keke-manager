import { currentUser } from "@clerk/nextjs/server";
import { CompanyDesktopShell } from "@/components/dashboard/CompanyDesktopShell";
import type { CompanyShellProfile } from "@/components/dashboard/CompanyDesktopShell";
import { companyInitialsFromName, getCompanyProfile } from "@/lib/airtable/company-profile";

export default async function CompanyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let profile: CompanyShellProfile = null;
  const user = await currentUser();
  const clerkId = user?.id ?? null;
  if (clerkId) {
    try {
      const p = await getCompanyProfile(clerkId);
      if (p) {
        profile = {
          companyName: p.companyName ?? "კომპანია",
          logoUrl: p.logoUrl ?? null,
          initials: companyInitialsFromName(p.companyName ?? null),
          subtitle: p.plan ? `პლანი: ${p.plan}` : "დაფა",
        };
      }
    } catch {
      profile = null;
    }
  }

  return <CompanyDesktopShell profile={profile}>{children}</CompanyDesktopShell>;
}
