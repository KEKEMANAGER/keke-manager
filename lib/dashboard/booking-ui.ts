import type { BookingKind } from "@/types/airtable";

/** Transfer — blue */
export function bookingKindIconShellClass(kind: BookingKind | null | undefined): string {
  if (!kind || kind === "transfer") {
    return "bg-[#e6f1fb] text-[#185fa5]";
  }
  if (kind === "tour") {
    return "bg-[#e1f5ee] text-[#0f6e56]";
  }
  return "bg-[#faeeda] text-[#854f0b]";
}

export function bookingKindBorderClass(kind: BookingKind | null | undefined): string {
  if (!kind || kind === "transfer") {
    return "border-[#185fa5]/25";
  }
  if (kind === "tour") {
    return "border-[#0f6e56]/25";
  }
  return "border-[#854f0b]/25";
}

export function bookingKindShortLabel(kind: BookingKind | null | undefined): string {
  if (!kind || kind === "transfer") return "ტრანსფერი";
  if (kind === "tour") return "ტური";
  return "1 დღე";
}

/** Status pill — Georgian + English labels */
export function statusPillClass(status: string | null | undefined): string {
  const raw = (status ?? "").trim();
  const s = raw.toLowerCase();
  const base =
    "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none";
  /** მოლოდინში / pending — amber */
  if (raw.includes("მოლოდინში") || s === "pending" || s.includes("pending")) {
    return `${base} border-[#854f0b]/25 bg-[#faeeda] text-[#854f0b]`;
  }
  /** დადასტურებული / confirmed pipeline — teal */
  if (
    raw.includes("დადასტურებული") ||
    s === "confirmed" ||
    s === "assigned" ||
    s === "in_progress" ||
    s.includes("confirm")
  ) {
    return `${base} border-[#0f6e56]/30 bg-[#e1f5ee] text-[#0f6e56]`;
  }
  if (s === "completed" || s.includes("complete")) {
    return `${base} border-neutral-300 bg-neutral-100 text-neutral-700`;
  }
  if (s === "cancelled" || s.includes("cancel")) {
    return `${base} border-red-200 bg-red-50 text-red-800`;
  }
  if (s === "draft" || s.includes("draft")) {
    return `${base} border-[#854f0b]/25 bg-[#faeeda] text-[#854f0b]`;
  }
  return `${base} border-neutral-200 bg-neutral-50 text-neutral-600`;
}
