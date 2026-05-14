import { auth } from "@clerk/nextjs/server";
import { localizedRedirect } from "@/i18n/redirect-server";
import {
  getAirtableUserRoleByClerkId,
  type AppUserRole,
} from "@/lib/airtable/user-role";
import { OnboardingChooseRole } from "./OnboardingChooseRole";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    return await localizedRedirect("/sign-in");
  }

  let role: AppUserRole;
  try {
    role = await getAirtableUserRoleByClerkId(userId);
  } catch {
    role = null;
  }

  if (role === "driver") return await localizedRedirect("/driver");
  if (role === "company") return await localizedRedirect("/company");
  if (role === "admin") return await localizedRedirect("/company");

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a2e]">
      <OnboardingChooseRole />
    </div>
  );
}
