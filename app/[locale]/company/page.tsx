import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { companyInitialsFromName, getCompanyProfile } from "@/lib/airtable/company-profile";

export const dynamic = "force-dynamic";

export default async function CompanyHubPage() {
  const user = await currentUser();
  const clerkId = user?.id ?? null;

  let profile = null;
  let loadError: string | null = null;
  if (clerkId) {
    try {
      profile = await getCompanyProfile(clerkId);
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Airtable load failed.";
    }
  }

  const initials = companyInitialsFromName(profile?.companyName ?? null);
  const name = profile?.companyName?.trim() || "კაბინეტი";

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white antialiased">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-12 sm:px-8 sm:py-16">
        {loadError ? (
          <p className="text-center text-sm text-white/50" role="alert">
            {loadError}
          </p>
        ) : null}

        {!loadError && !profile ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-sm leading-relaxed text-white/50">
              პროფილი ვერ მოიძებნა — დააკავშირეთ Clerk Airtable-ში <span className="text-white/80">company_ref</span>.
            </p>
            <Link
              href="/sign-in"
              className="mt-8 inline-flex rounded-xl border-2 border-[#f5a623] px-6 py-2.5 text-sm font-semibold text-[#f5a623] transition hover:bg-[#f5a623]/10"
            >
              შესვლა
            </Link>
          </div>
        ) : null}

        {profile ? (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-2 ring-white/20">
                {profile.logoUrl ? (
                  <Image src={profile.logoUrl} alt="" fill className="object-cover" sizes="96px" priority />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/10 text-2xl font-black text-[#f5a623]" aria-hidden>
                    {initials}
                  </div>
                )}
              </div>
              <h1 className="mt-5 text-xl font-bold leading-tight sm:text-2xl">{name}</h1>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                ვერიფიცირებული
              </span>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
              <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-sm font-semibold text-white">ახალი შეკვეთა</p>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-white/45">შექმენით ახალი ჯავშანი.</p>
                <Link
                  href="/company/bookings/new"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#f5a623] py-2.5 text-center text-sm font-semibold text-[#0f0f0f] transition hover:brightness-110"
                >
                  გადასვლა
                </Link>
              </div>
              <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-sm font-semibold text-white">Dashboard</p>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-white/45">სტატისტიკა და ჯავშნები.</p>
                <Link
                  href="/company/dashboard"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl border-2 border-[#f5a623] py-2.5 text-center text-sm font-semibold text-[#f5a623] transition hover:bg-[#f5a623]/10"
                >
                  გადასვლა
                </Link>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
