import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { localizedRedirect } from "@/i18n/redirect-server";
import { currentUser } from "@clerk/nextjs/server";
import { ensureClerkDriverRecords } from "@/lib/airtable/sync-clerk-driver";
import { getDriverProfile } from "@/lib/airtable/driver-profile";
import { VEHICLE_CLASS_LABELS } from "@/lib/vehicle-class-labels";
import type { DriverProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

const LANG_LABEL: Record<string, string> = {
  Georgian: "ქართული",
  English: "ინგლისური",
  Russian: "რუსული",
  Turkish: "თურქული",
  German: "გერმანული",
  French: "ფრანგული",
  Arabic: "არაბული",
  Chinese: "ჩინური",
  Italian: "იტალიური",
  Spanish: "ესპანური",
  Japanese: "იაპონური",
};

function IconPhone({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5-2.5l5 2v4a2 2 0 0 1-2 2c-8.284 0-15-6.716-15-15a2 2 0 0 1 2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLanguage({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 0 0 18M12 3a15 15 0 0 1 0 18" strokeLinecap="round" />
    </svg>
  );
}

function IconCar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M5 17H3V6l5-3h8l5 3v11h-2m-4 0H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMapPin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M12 11.5a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5Z" />
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="mt-0.5 shrink-0 text-black/40">{icon}</span>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3 text-sm">
        <span className="text-black/50">{label}</span>
        <span className="text-right font-semibold text-[#1a1a2e]">{value}</span>
      </div>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  const clamped = Math.max(0, Math.min(5, Number.isFinite(rating) ? rating : 0));
  const filled = Math.min(5, Math.round(clamped));
  return (
    <div className="mt-3 flex items-center justify-center gap-0.5" aria-label={`რეიტინგი ${clamped.toFixed(1)}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`text-xl leading-none ${i < filled ? "text-[#fbbf24]" : "text-black/15"}`}>
          ★
        </span>
      ))}
      <span className="ml-2 text-sm font-semibold tabular-nums text-[#1a1a2e]">{clamped.toFixed(1)}</span>
    </div>
  );
}

function displayName(p: DriverProfile): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || "მძღოლი";
}

export default async function DriverProfilePage() {
  const user = await currentUser();
  if (!user?.id) {
    return await localizedRedirect("/sign-in");
  }

  const clerkId = user.id;
  const email = user.emailAddresses?.[0]?.emailAddress ?? "";
  const clerkFullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const phone = user.phoneNumbers?.[0]?.phoneNumber ?? "—";

  await ensureClerkDriverRecords(clerkId, email, clerkFullName);
  const profile = await getDriverProfile(clerkId);
  if (!profile) {
    return await localizedRedirect("/driver/edit");
  }

  const langs = (profile.languages ?? []).map((c) => LANG_LABEL[c] ?? c).join(", ") || "—";
  const vehicleLine = `${profile.vehicleModel} · ${VEHICLE_CLASS_LABELS[profile.vehicleCategory]}`;
  const plate = profile.licensePlate?.trim() || "—";
  const expYears = profile.experienceYears;
  const baseCity = profile.baseCity?.trim() || "—";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6 text-[#1a1a2e] md:px-6">
      <div className="mb-6 flex items-center justify-between gap-2">
        <Link href="/driver/dashboard" className="text-sm font-medium text-black/50 transition hover:text-[#1a1a2e]">
          ← დაფა
        </Link>
        <Link
          href="/driver/profile/edit"
          className="shrink-0 rounded-xl bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1a1a2e]/90"
        >
          პროფილის რედაქტირება
        </Link>
      </div>

      <div className="rounded-2xl border-[0.5px] border-black/[0.08] bg-white p-8 text-center shadow-sm">
        {profile.portraitPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.portraitPhotoUrl}
            alt=""
            className="mx-auto h-20 w-20 rounded-full border-2 border-black/[0.08] object-cover"
          />
        ) : (
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-black/[0.08] bg-[#f5f5f0] text-2xl font-bold text-[#1a1a2e]"
            aria-hidden
          >
            {(profile.firstName?.[0] ?? "?").toUpperCase()}
          </div>
        )}
        <h1 className="mt-4 text-xl font-bold leading-tight">{displayName(profile)}</h1>
        <p className="mt-1 text-sm text-black/50">
          {expYears != null && expYears > 0 ? `${expYears} წლის გამოცდილება` : "გამოცდილება"}
        </p>
        <Stars rating={profile.ratingAvg} />
        {profile.verified ? (
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
            <span aria-hidden>✓</span>
            ვერიფიცირებული
          </span>
        ) : null}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border-[0.5px] border-black/[0.08] bg-white shadow-sm">
        <div className="divide-y divide-black/[0.06]">
          <ProfileRow icon={<IconPhone className="h-5 w-5" />} label="ტელეფონი" value={phone} />
          <ProfileRow icon={<IconLanguage className="h-5 w-5" />} label="ენები" value={langs} />
          <ProfileRow icon={<IconCar className="h-5 w-5" />} label="ავტომობილი" value={vehicleLine} />
          <ProfileRow icon={<IconMapPin className="h-5 w-5" />} label="სანომრე" value={plate} />
          <ProfileRow icon={<IconMapPin className="h-5 w-5" />} label="ბაზის ქალაქი" value={baseCity} />
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-black/50">
        ავტოს ფოტოების ატვირთვა:{" "}
        <Link href="/driver/edit" className="font-semibold text-[#1a1a2e] underline">
          რედაქტირება
        </Link>
      </p>
    </div>
  );
}
