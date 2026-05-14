import { Link } from "@/i18n/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { AppHeader } from "@/components/site/AppHeader";
import { ensureClerkDriverRecords } from "@/lib/airtable/sync-clerk-driver";
import { getDriverProfile } from "@/lib/airtable/driver-profile";
import { getDriverBookings } from "@/lib/airtable/driver-bookings";
import { VEHICLE_CLASS_LABELS } from "@/lib/vehicle-class-labels";
import { DriverBookingsList } from "./DriverBookingsList";
import type { DriverProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

function driverVerificationBadgeText(p: DriverProfile): string {
  if (p.verified) return "✅ ვერიფიცირებული";
  if (p.hasLicensePhoto && p.hasIdPhoto) return "⏳ მოლოდინში";
  return "❌ არ არის ვერიფიცირებული";
}

function driverDisplayInitials(p: DriverProfile): string {
  const a = p.firstName?.trim().charAt(0) ?? "";
  const b = p.lastName?.trim().charAt(0) ?? "";
  const s = `${a}${b}`.toUpperCase();
  return s || "?";
}

/** Airtable multiple-select value → label on driver home */
const DRIVER_LANG_BADGE_LABEL: Record<string, string> = {
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

export default async function DriverLandingPage() {
  try {
    let clerkId: string | undefined;
    let email = "";
    let clerkFullName = "";
    try {
      const user = await currentUser();
      clerkId = user?.id;
      email = user?.emailAddresses?.[0]?.emailAddress ?? "";
      clerkFullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
      console.log("[driver/page] currentUser ok", {
        clerkId: clerkId ?? null,
        hasEmail: Boolean(email),
      });
    } catch (clerkErr) {
      console.error("[driver/page] currentUser failed:", clerkErr);
      if (clerkErr instanceof Error) {
        console.error("[driver/page] currentUser stack:", clerkErr.stack);
      }
      clerkId = undefined;
    }

    let profile = null;
    let loadError: string | null = null;
    let driverBookings: Awaited<ReturnType<typeof getDriverBookings>> = [];
    if (clerkId) {
      try {
        console.log("[driver/page] starting ensureClerkDriverRecords + getDriverProfile");
        await ensureClerkDriverRecords(clerkId, email, clerkFullName);
        console.log("[driver/page] ensureClerkDriverRecords done");
        profile = await getDriverProfile(clerkId);
        console.log("[driver/page] getDriverProfile done", {
          found: Boolean(profile),
          profileId: profile?.id ?? null,
        });
        if (profile?.id) {
          try {
            driverBookings = await getDriverBookings(profile.id);
          } catch (bookErr) {
            console.error("[driver/page] getDriverBookings failed:", bookErr);
            driverBookings = [];
          }
        }
      } catch (e) {
        console.error("[driver/page] Airtable pipeline failed:", e);
        if (e instanceof Error) {
          console.error("[driver/page] message:", e.message);
          console.error("[driver/page] stack:", e.stack);
        } else {
          console.error("[driver/page] non-Error:", JSON.stringify(e));
        }
        loadError =
          e instanceof Error ? e.message : "მონაცემები ვერ ჩაიტვირთა.";
      }
    }

    const fullName =
      profile && (profile.firstName || profile.lastName)
        ? [profile.firstName, profile.lastName].filter(Boolean).join(" ")
        : "";

    return (
      <>
        <AppHeader />
        <div className="mx-auto max-w-2xl px-4 pt-4">
          <Link
            href="/driver/dashboard"
            className="mb-4 block rounded-lg border border-keke-line bg-keke-ink px-4 py-3 text-center text-sm font-semibold text-[#f5a623] transition hover:border-[#f5a623]/50"
          >
            ახალი მობილური დაფა →
          </Link>
        </div>
        <main className="mx-auto max-w-2xl px-4 py-16">
          <h1 className="text-4xl font-black text-white">მძღოლი · კაბინეტი</h1>

          {loadError ? (
            <p className="mt-6 text-sm text-keke-muted" role="alert">
              {loadError}
            </p>
          ) : null}

          {!loadError && !profile ? (
            <p className="mt-6 text-sm text-keke-muted">
              პროფილი არ არის შევსებული
            </p>
          ) : null}

          {!loadError && profile ? (
            <dl className="mt-8 space-y-4 text-sm">
              <div>
                <dt className="text-keke-muted">სახელი</dt>
                <dd className="font-medium text-white">
                  <div className="flex gap-4">
                    {profile.portraitPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.portraitPhotoUrl}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#1a1a2e] text-lg font-semibold text-white"
                        aria-hidden
                      >
                        {driverDisplayInitials(profile)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>
                          {fullName || "სახელი შევსებული არ არის"}
                        </span>
                        <span className="text-xs font-normal text-keke-muted">
                          {driverVerificationBadgeText(profile)}
                        </span>
                      </span>
                      {profile.bio?.trim() ? (
                        <p className="mt-2 text-sm font-normal text-keke-muted">
                          {profile.bio.trim()}
                        </p>
                      ) : null}
                      {(profile.languages?.length ?? 0) > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(profile.languages ?? []).map((code) => (
                            <span
                              key={code}
                              className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/90"
                            >
                              {DRIVER_LANG_BADGE_LABEL[code] ?? code}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </dd>
              </div>
              <div>
                <dt className="text-keke-muted">რეიტინგი</dt>
                <dd className="text-white">
                  {profile.ratingAvg.toFixed(1)} · {profile.ratingCount}{" "}
                  განხილვა
                </dd>
              </div>
              <div>
                <dt className="text-keke-muted">მანქანა</dt>
                <dd className="text-white">
                  {profile.vehicleModel} · {profile.licensePlate ?? "—"}
                  {profile.vehicleColor ? ` · ${profile.vehicleColor}` : ""} ·{" "}
                  {VEHICLE_CLASS_LABELS[profile.vehicleCategory] ??
                    profile.vehicleCategory}
                </dd>
              </div>
              {profile.vehicleFrontPhotoUrl ? (
                <div>
                  <dt className="text-keke-muted">მანქანის ფოტო</dt>
                  <dd className="mt-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profile.vehicleFrontPhotoUrl}
                      alt=""
                      className="w-full max-w-xs rounded-lg object-cover"
                    />
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-keke-muted">ბალანსი</dt>
                <dd className="text-white">
                  {profile.balanceGel != null
                    ? `GEL ${profile.balanceGel.toFixed(2)}`
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : null}

          {!loadError && profile ? (
            <Link
              href="/driver/edit"
              className="btn-outline mt-6 inline-block"
            >
              პროფილის რედაქტირება
            </Link>
          ) : null}

          {!loadError && profile ? (
            <DriverBookingsList bookings={driverBookings} />
          ) : null}

          <ul className="mt-10 list-inside list-disc space-y-2 text-sm text-keke-muted">
            <li>
              თვიური ტარიფი კატეგორიის მიხედვით (სედან 29₾ … ავტობუსი 89₾)
            </li>
            <li>დოკუმენტების ვადები → ავტომატური ალერტი</li>
            <li>საწვავის QR (15 წუთი) პარტნიორი კომპანიებისთვის</li>
          </ul>
          <Link href="/" className="btn-gold mt-10 inline-block">
            მთავარი გვერდი
          </Link>
        </main>
      </>
    );
  } catch (fatal) {
    console.error("[driver/page] FATAL (uncaught in render path):", fatal);
    if (fatal instanceof Error) {
      console.error("[driver/page] FATAL message:", fatal.message);
      console.error("[driver/page] FATAL stack:", fatal.stack);
    }
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <h1 className="text-4xl font-black text-white">მძღოლი · კაბინეტი</h1>
          <p className="mt-6 text-sm text-keke-muted" role="alert">
            შეცდომა:{" "}
            {fatal instanceof Error ? fatal.message : String(fatal)} — იხილე
            ტერმინალი.
          </p>
        </main>
      </>
    );
  }
}
