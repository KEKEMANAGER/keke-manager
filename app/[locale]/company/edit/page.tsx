import { Link } from "@/i18n/navigation";
import { localizedRedirect } from "@/i18n/redirect-server";
import { currentUser } from "@clerk/nextjs/server";
import { AppHeader } from "@/components/site/AppHeader";
import { getCompanyProfile } from "@/lib/airtable/company-profile";
import { CompanyEditForm } from "./CompanyEditForm";

export const dynamic = "force-dynamic";

export default async function CompanyEditPage() {
  const user = await currentUser();
  if (!user?.id) {
    return await localizedRedirect("/sign-in");
  }

  let profile = null;
  try {
    profile = await getCompanyProfile(user.id);
  } catch {
    profile = null;
  }

  if (!profile) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <h1 className="text-3xl font-black text-white">პროფილის რედაქტირება</h1>
          <p className="mt-6 text-sm text-keke-muted">
            ტურისტული კომპანია ვერ მოიძებნა — დარწმუნდით, რომ Airtable-ში Users ჩანაწერს აქვს
            company_ref TourismCompanies-ზე.
          </p>
          <Link href="/company" className="btn-outline mt-6 inline-block">
            უკან
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl font-black text-white">პროფილის რედაქტირება</h1>
        <p className="mt-2 text-sm text-keke-muted">
          ველები ემთხვევა Airtable TourismCompanies ცხრილს.
        </p>
        <CompanyEditForm profile={profile} />
      </main>
    </>
  );
}
