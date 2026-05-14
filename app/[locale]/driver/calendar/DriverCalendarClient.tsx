"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DriverBookingRow } from "@/lib/airtable/driver-bookings";
import { bookingKindShortLabel } from "@/lib/dashboard/booking-ui";

function scheduleRaw(b: DriverBookingRow): string | null {
  const t = (b.pickupTime ?? "").trim() || (b.startDatetime ?? "").trim();
  return t || null;
}

function parseDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseBookingDayKey(b: DriverBookingRow): string | null {
  const raw = scheduleRaw(b);
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return parseDay(d);
}

const WEEKDAYS = ["კვ", "ორ", "სამ", "ოთ", "ხუ", "პა", "შაბ"] as const;

export function DriverCalendarClient() {
  const [bookings, setBookings] = useState<DriverBookingRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/driver/bookings");
      const data = (await res.json()) as {
        bookings?: DriverBookingRow[];
        error?: string;
      };
      if (!res.ok) {
        setLoadError(data.error ?? "ვერ ჩაიტვირთა.");
        setBookings([]);
        return;
      }
      setBookings(data.bookings ?? []);
    } catch {
      setLoadError("ვერ ჩაიტვირთა.");
      setBookings([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const countsByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bookings) {
      const k = parseBookingDayKey(b);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [bookings]);

  const y = cursor.getFullYear();
  const mo = cursor.getMonth();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const firstDow = new Date(y, mo, 1).getDay();

  const cells: ({ key: string; day: number } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ key: parseDay(new Date(y, mo, day)), day });
  }

  const selectedBookings = useMemo(() => {
    if (!selectedKey) return [];
    return bookings.filter((b) => parseBookingDayKey(b) === selectedKey);
  }, [bookings, selectedKey]);

  const monthTitle = cursor.toLocaleDateString("ka-GE", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 text-[#1a1a2e] md:px-6">
      <h1 className="text-xl font-bold">კალენდარი</h1>
      <p className="mt-1 text-sm text-black/50">შეკვეთები დღეების მიხედვით</p>

      {loadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
          {loadError}
        </p>
      ) : null}

      <div className="mt-6 rounded-2xl border-[0.5px] border-black/[0.08] bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-semibold hover:bg-black/[0.04]"
            onClick={() => setCursor(new Date(y, mo - 1, 1))}
          >
            ←
          </button>
          <p className="text-center text-sm font-bold capitalize">{monthTitle}</p>
          <button
            type="button"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-semibold hover:bg-black/[0.04]"
            onClick={() => setCursor(new Date(y, mo + 1, 1))}
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-black/40">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (!cell) {
              return <div key={`e-${idx}`} className="aspect-square" />;
            }
            const n = countsByDay.get(cell.key) ?? 0;
            const active = selectedKey === cell.key;
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedKey(cell.key)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-semibold transition ${
                  active
                    ? "bg-[#1a1a2e] text-white"
                    : "text-[#1a1a2e] hover:bg-black/[0.04]"
                }`}
              >
                <span>{cell.day}</span>
                {n > 0 ? (
                  <span
                    className={`mt-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-[#1a1a2e] text-white"
                    }`}
                  >
                    {n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base font-semibold">
          {selectedKey ? `შეკვეთები — ${selectedKey}` : "აირჩიეთ დღე"}
        </h2>
        {!selectedKey ? (
          <p className="mt-2 text-sm text-black/50">დღის ასარჩევად დააჭირეთ ციფრს.</p>
        ) : selectedBookings.length === 0 ? (
          <p className="mt-2 text-sm text-black/50">ამ დღეს შეკვეთა არ ჩანს.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {selectedBookings.map((b) => (
              <li
                key={b.id}
                className="rounded-2xl border-[0.5px] border-black/[0.08] bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-semibold text-black/45">
                  {bookingKindShortLabel(b.kind)}
                  {b.status ? ` · ${b.status}` : ""}
                </p>
                <p className="mt-1 font-semibold text-[#1a1a2e]">{b.companyName ?? "კომპანია"}</p>
                <p className="mt-1 text-sm text-black/60">{b.pickup ?? "—"}</p>
                {b.dropoff ? (
                  <p className="text-sm text-black/60">→ {b.dropoff}</p>
                ) : null}
                <p className="mt-2 text-xs text-black/45">
                  {scheduleRaw(b) ? new Date(scheduleRaw(b)!).toLocaleString("ka-GE") : "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
