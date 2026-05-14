"use client";

import type { BookingKind } from "@/types/airtable";
import { useTranslations } from "next-intl";
import { bookingKindIconShellClass } from "@/lib/dashboard/booking-ui";

export function BookingKindBadge({ kind }: { kind: BookingKind }) {
  const t = useTranslations("booking");
  const sym = kind === "transfer" ? "↗" : kind === "tour" ? "◇" : "☀";
  const title =
    kind === "transfer" ? t("transfer") : kind === "tour" ? t("tour") : t("one_day");
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold leading-none ${bookingKindIconShellClass(kind)}`}
      title={title}
      aria-hidden
    >
      {sym}
    </div>
  );
}
