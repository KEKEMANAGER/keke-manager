import { currentUser } from "@clerk/nextjs/server";
import { getLocale, getTranslations } from "next-intl/server";
import { ensureClerkDriverRecords } from "@/lib/airtable/sync-clerk-driver";
import { getDriverProfile } from "@/lib/airtable/driver-profile";
import { getDriverBookings } from "@/lib/airtable/driver-bookings";
import { VEHICLE_CLASS_LABELS } from "@/lib/vehicle-class-labels";
import { DriverBookingsList } from "../DriverBookingsList";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import {
  confirmedBookingPercent,
  countBookingsToday,
  sumWeeklyAmount,
} from "@/lib/dashboard/booking-stats";
import type { DriverProfile } from "@/lib/types";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

function initials(p: DriverProfile): string {
  const a = p.firstName?.trim().charAt(0) ?? "";
  const b = p.lastName?.trim().charAt(0) ?? "";
  const s = `${a}${b}`.toUpperCase();
  return s || "?";
}

export default async function DriverDashboardPage() {
  const tDash = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  const locale = await getLocale();
  const dateLocale = locale === "ka" ? "ka-GE" : locale === "ru" ? "ru-RU" : "en-US";

  const user = await currentUser();
  const clerkId = user?.id;
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";
  const clerkFullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  let profile: DriverProfile | null = null;
  let loadError: string | null = null;
  let bookings: Awaited<ReturnType<typeof getDriverBookings>> = [];

  if (clerkId) {
    try {
      await ensureClerkDriverRecords(clerkId, email, clerkFullName);
      profile = await getDriverProfile(clerkId);
      if (profile?.id) {
        bookings = await getDriverBookings(profile.id);
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : "მონაცემები ვერ ჩაიტვირთა.";
    }
  }

  const statRows = bookings.map((b) => ({
    pickupTime: b.pickupTime ?? b.startDatetime,
    amount: b.clientPriceGel ?? b.priceGel,
  }));
  const todayCount = countBookingsToday(statRows);
  const weekSum = sumWeeklyAmount(statRows);
  const confPct = confirmedBookingPercent(bookings);
  const rating = profile?.ratingAvg ?? 0;

  const fullName =
    profile && (profile.firstName || profile.lastName)
      ? [profile.firstName, profile.lastName].filter(Boolean).join(" ")
      : "მძღოლი";

  const pageTitle = new Date().toLocaleDateString(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col pb-24 md:mx-0 md:max-w-none md:pb-8">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#1a1a2e] text-white md:hidden">
        <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {profile?.portraitPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.portraitPhotoUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/20"
              />
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white"
                aria-hidden
              >
                {profile ? initials(profile) : "?"}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" width={36} height={36} className="shrink-0 rounded-xl" alt="" />
                <p className="min-w-0 truncate text-sm font-semibold leading-tight">{fullName}</p>
              </div>
              {profile ? (
                <p className="truncate text-[11px] text-white/70">
                  {profile.vehicleModel} · {VEHICLE_CLASS_LABELS[profile.vehicleCategory]}
                </p>
              ) : (
                <p className="text-[11px] text-white/70">პროფილი არ არის</p>
              )}
            </div>
          </div>
          <Link
            href="/driver/edit"
            className="shrink-0 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
          >
            რედაქტირება
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full flex-1 px-3 pt-4 md:max-w-5xl md:px-6 md:pt-6 lg:px-8">
        <p className="mb-4 hidden text-base font-semibold capitalize text-[#1a1a2e] md:block">{pageTitle}</p>

        {loadError ? (
          <p className="mb-4 rounded-[12px] border-[0.5px] border-red-200 bg-white px-4 py-3 text-sm text-red-700">
            {loadError}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:hidden">
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{tDash("today")}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#185fa5]">{todayCount}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{tDash("bookings")}</p>
          </div>
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">7 დღე</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#0f6e56]">{weekSum.toFixed(0)}</p>
            <p className="mt-0.5 text-xs text-neutral-500">GEL ({tDash("bookings")})</p>
          </div>
        </div>

        <div className="mb-6 hidden gap-3 md:grid md:grid-cols-4">
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{tDash("today")}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#185fa5]">{todayCount}</p>
          </div>
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{tDash("weekly")} ₾</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#0f6e56]">{weekSum.toFixed(0)}</p>
          </div>
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">რეიტინგი</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#854f0b]">
              ★ {rating.toFixed(1)}
            </p>
          </div>
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">დადასტ. %</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#0f6e56]">{confPct}%</p>
          </div>
        </div>

        <div className="mt-6 md:mt-0">
          {profile ? (
            <DriverBookingsList bookings={bookings} />
          ) : (
            <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4 text-sm text-neutral-600">
              პროფილი ვერ მოიძებნა — გადადით რედაქტირებაზე.
            </div>
          )}
        </div>
      </main>

      <MobileBottomNav
        ariaLabel="მძღოლის ნავიგაცია"
        showSignOut
        tabs={[
          { href: "/driver/dashboard", label: tDash("board") },
          { href: "/driver/dashboard#bookings", label: tDash("bookings") },
          { href: "/driver/profile", label: tNav("profile") },
          { href: "/", label: tNav("home") },
        ]}
      />
    </div>
  );
}
