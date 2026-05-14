import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { BookingKindBadge } from "@/components/dashboard/BookingKindBadge";
import { getBookings } from "@/lib/airtable/bookings";
import { getDrivers } from "@/lib/airtable/drivers";
import {
  countActivePipelineBookings,
  countBookingsToday,
  sumCalendarMonthAmount,
  sumWeeklyAmount,
} from "@/lib/dashboard/booking-stats";
import {
  bookingKindBorderClass,
  statusPillClass,
} from "@/lib/dashboard/booking-ui";
import {
  companyInitialsFromName,
  getCompanyProfile,
} from "@/lib/airtable/company-profile";
import type { Booking } from "@/types/airtable";

export const dynamic = "force-dynamic";

function bookingWhen(b: Booking): string | null {
  return b.pickupTime ?? b.startDatetime;
}

function formatWhen(iso: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("ka-GE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function CompanyDashboardPage() {
  const user = await currentUser();
  const clerkId = user?.id ?? null;

  let profile = null;
  let bookings: Booking[] = [];
  let drivers: Awaited<ReturnType<typeof getDrivers>> = [];
  let loadError: string | null = null;

  if (clerkId) {
    try {
      profile = await getCompanyProfile(clerkId);
      if (profile?.id) {
        bookings = await getBookings(profile.id);
      }
      drivers = await getDrivers();
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Airtable load failed.";
    }
  }

  const statRows = bookings.map((b) => ({
    pickupTime: bookingWhen(b),
    amount: b.clientPriceGel ?? b.platformQuoteGel,
  }));
  const todayCount = countBookingsToday(statRows);
  const weekSum = sumWeeklyAmount(statRows);
  const monthSum = sumCalendarMonthAmount(statRows);
  const activeBookings = countActivePipelineBookings(bookings.map((b) => ({ status: String(b.status ?? "") })));
  const avgRating =
    drivers.length > 0
      ? drivers.reduce((s, d) => s + (Number.isFinite(d.ratingAvg) ? d.ratingAvg : 0), 0) / drivers.length
      : 0;

  const initials = companyInitialsFromName(profile?.companyName ?? null);

  const pageTitle = new Date().toLocaleDateString("ka-GE", {
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
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-white/20">
              {profile?.logoUrl ? (
                <Image src={profile.logoUrl} alt="" fill className="object-cover" sizes="40px" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/15 text-xs font-black text-white">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" width={36} height={36} className="shrink-0 rounded-xl" alt="" />
                <p className="min-w-0 truncate text-sm font-semibold leading-tight">
                  {profile?.companyName ?? "კომპანია"}
                </p>
              </div>
              <p className="truncate text-[11px] text-white/70">
                {profile?.plan ? `პლანი: ${profile.plan}` : "დაფა"}
              </p>
            </div>
          </div>
          <Link
            href="/company/edit"
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

        {!loadError && !profile ? (
          <p className="mb-4 rounded-[12px] border-[0.5px] border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
            კომპანია ვერ მოიძებნა — დააკავშირეთ Users.company_ref Airtable-ში.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:hidden">
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">დღეს</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#185fa5]">{todayCount}</p>
            <p className="mt-0.5 text-xs text-neutral-500">ჯავშანი</p>
          </div>
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">7 დღე</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#0f6e56]">{weekSum.toFixed(0)}</p>
            <p className="mt-0.5 text-xs text-neutral-500">GEL (შეფასება)</p>
          </div>
        </div>

        <div className="mb-6 hidden gap-3 md:grid md:grid-cols-4">
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">აქტიური ბუქინგი</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#185fa5]">{activeBookings}</p>
          </div>
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">ამ თვეში ₾</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#0f6e56]">{monthSum.toFixed(0)}</p>
          </div>
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">მძღოლები</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#854f0b]">{drivers.length}</p>
          </div>
          <div className="rounded-[12px] border-[0.5px] border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">საშ. რეიტინგი</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#0f6e56]">★ {avgRating.toFixed(1)}</p>
          </div>
        </div>

        <section className="mt-6 md:mt-0">
          <h2 className="text-base font-bold text-neutral-900">ჯავშნები</h2>
          {bookings.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">ჩანაწერები არ არის.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {bookings.map((b) => {
                const title =
                  [b.pickup, b.dropoff].filter(Boolean).join(" → ") ||
                  b.meetContactName ||
                  "ჯავშანი";
                const gel = b.clientPriceGel ?? b.platformQuoteGel;
                const when = bookingWhen(b);
                return (
                  <li
                    key={b.id}
                    className={`rounded-[12px] border-[0.5px] bg-white p-3 ${bookingKindBorderClass(b.kind)}`}
                  >
                    <div className="flex gap-3">
                      <BookingKindBadge kind={b.kind} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-snug text-neutral-900">{title}</p>
                          <span className={statusPillClass(String(b.status))}>{b.status}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500">{formatWhen(when)}</p>
                        {gel != null && Number.isFinite(gel) ? (
                          <p className="mt-1 text-xs font-medium text-neutral-800">GEL {gel.toFixed(0)}</p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <MobileBottomNav
        ariaLabel="კომპანიის ნავიგაცია"
        showSignOut
        tabs={[
          { href: "/company/dashboard", label: "დაფა" },
          { href: "/company/search", label: "ძებნა" },
          { href: "/company/drivers", label: "მძღოლები" },
          { href: "/company/edit", label: "პროფილი" },
        ]}
      />
    </div>
  );
}
