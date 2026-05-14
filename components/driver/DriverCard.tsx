import Image from "next/image";
import type { DriverProfile } from "@/lib/types";
import { VEHICLE_CLASS_LABELS } from "@/lib/vehicle-class-labels";

function cardInitials(d: DriverProfile): string {
  const a = d.firstName?.trim().charAt(0) ?? "";
  const b = d.lastName?.trim().charAt(0) ?? "";
  const s = `${a}${b}`.toUpperCase();
  return s || "?";
}

export function DriverCard({ driver }: { driver: DriverProfile }) {
  const vehicleHeroSrc =
    driver.vehicleFrontPhotoUrl ?? driver.vehicleImageUrl ?? null;
  const portraitSrc = driver.portraitPhotoUrl ?? driver.photoUrl ?? null;
  const initials = cardInitials(driver);

  return (
    <article className="overflow-hidden rounded-card border border-neutral-200 bg-white text-neutral-900 shadow-lg">
      <div className="relative aspect-[16/10] w-full bg-neutral-200">
        {vehicleHeroSrc ? (
          <Image
            src={vehicleHeroSrc}
            alt={`${driver.vehicleModel}`}
            fill
            className="object-cover"
            sizes="(max-width:768px) 100vw, 400px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-2xl font-semibold text-neutral-500">
              {initials}
            </span>
          </div>
        )}
        <button
          type="button"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-keke-green shadow"
          aria-label="რჩეულებში დამატება"
        >
          ♥
        </button>
      </div>
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-200">
            {portraitSrc ? (
              <Image
                src={portraitSrc}
                alt=""
                fill
                className="object-cover"
                sizes="48px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-600">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold capitalize">
                {driver.firstName.toLowerCase()}
              </span>
              {driver.verified ? (
                <span
                  className="rounded-full bg-keke-green/15 px-2 py-0.5 text-xs font-semibold text-keke-green"
                  title="ვერიფიცირებული"
                >
                  ✓
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              💬{" "}
              {driver.languages?.length
                ? driver.languages.join(", ")
                : "—"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">{driver.ratingAvg.toFixed(1)}</span>
              <span className="text-amber-500">★★★★★</span>
              <span className="text-neutral-400">
                {driver.ratingCount} განხილვა
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-keke-green">🚗</span>
          <span className="font-medium">{driver.vehicleModel}</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-700">
            {VEHICLE_CLASS_LABELS[driver.vehicleCategory]}
          </span>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-neutral-600">
          <span title="ადგილები">💺 {driver.seats}</span>
          <span title="ბარგაჟი">🧳 {driver.luggageSlots}</span>
          <span title="საწვავი">⛽ {driver.fuelType}</span>
        </div>

        {driver.indicativePrice != null ? (
          <div className="rounded-lg border border-keke-green/30 bg-keke-green/5 p-3 text-sm">
            <p className="text-[11px] text-neutral-500">საბოლოო ფასი (სანდო)</p>
            <p className="mt-1 text-lg font-bold text-keke-green">
              GEL {driver.indicativePrice}
            </p>
            <p className="text-xs text-keke-green">ტრანსპორტის ფასი</p>
          </div>
        ) : null}

        <button
          type="button"
          className="w-full rounded-lg bg-keke-green py-3 text-center text-sm font-bold text-white hover:brightness-105"
        >
          დაჯავშნა / დეტალები
        </button>
      </div>
    </article>
  );
}
