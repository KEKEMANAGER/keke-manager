"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { DriverBookingRow } from "@/lib/airtable/driver-bookings";
import {
  bookingKindBorderClass,
  bookingKindIconShellClass,
  statusPillClass,
} from "@/lib/dashboard/booking-ui";

type DriverBookingsListProps = {
  bookings: DriverBookingRow[];
};

function formatWhen(iso: string | null, locale: string): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const loc = locale === "ka" ? "ka-GE" : locale === "ru" ? "ru-RU" : "en-US";
  return d.toLocaleString(loc, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function KindGlyph({ kind }: { kind: DriverBookingRow["kind"] }) {
  if (kind === "transfer") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
        <path
          d="M4 12h12l-3-3m3 3l-3 3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "tour") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
        <path
          d="M12 3l7 4v10l-7 4-7-4V7l7-4z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function bookingKindLabel(
  kind: DriverBookingRow["kind"],
  t: (key: "transfer" | "tour" | "one_day") => string,
): string {
  if (kind === "transfer") return t("transfer");
  if (kind === "tour") return t("tour");
  return t("one_day");
}

export function DriverBookingsList({ bookings }: DriverBookingsListProps) {
  const router = useRouter();
  const locale = useLocale();
  const tBooking = useTranslations("booking");
  const tDash = useTranslations("dashboard");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function patchBooking(bookingId: string, action: "accept" | "reject") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/driver/booking", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId, action }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "მოქმედება ვერ შესრულდა.");
          return;
        }
        router.refresh();
      } catch {
        setError("მოქმედება ვერ შესრულდა.");
      }
    });
  }

  return (
    <section id="bookings" className="scroll-mt-24">
      <h2 className="text-base font-bold text-neutral-900">{tDash("current_bookings")}</h2>
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {bookings.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">შეკვეთები არ არის.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {bookings.map((b) => {
            const isPending =
              (b.status ?? "").toLowerCase() === "pending" ||
              (b.status ?? "").toLowerCase().includes("pending") ||
              (b.status ?? "").includes("მოლოდინში");
            const title = [b.pickup, b.dropoff].filter(Boolean).join(" → ") || "ჯავშანი";
            const gel = b.clientPriceGel ?? b.priceGel;
            return (
              <li
                key={b.id}
                className={`rounded-[12px] border-[0.5px] bg-white p-3 ${bookingKindBorderClass(b.kind)}`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bookingKindIconShellClass(b.kind)}`}
                    >
                      <KindGlyph kind={b.kind} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug text-neutral-900">{title}</p>
                        <span className={statusPillClass(b.status)}>{b.status ?? "—"}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {bookingKindLabel(b.kind, tBooking)} ·{" "}
                        {formatWhen(b.pickupTime ?? b.startDatetime, locale)}
                      </p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {b.companyName ?? "კომპანია —"}
                        {gel != null && Number.isFinite(gel) ? (
                          <span className="text-neutral-900"> · GEL {gel.toFixed(0)}</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  {isPending ? (
                    <div className="flex shrink-0 flex-wrap gap-2 md:flex-nowrap md:pt-0.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => patchBooking(b.id, "accept")}
                        className="rounded-lg bg-[#0f6e56] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                      >
                        {tBooking("accept")}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => patchBooking(b.id, "reject")}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        {tBooking("reject")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
