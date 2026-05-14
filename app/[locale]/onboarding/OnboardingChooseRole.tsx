"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { SignOutButton, useAuth } from "@clerk/nextjs";

export function OnboardingChooseRole() {
  const { isLoaded, userId } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(role: "driver" | "company") {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/set-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "ვერ შეინახა.");
        setPending(false);
        return;
      }
      router.push(role === "driver" ? "/driver" : "/company");
      router.refresh();
    } catch {
      setError("ვერ შეინახა.");
      setPending(false);
    }
  }

  return (
    <>
      <header className="border-b border-black/10 bg-[#f5f5f0]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0 rounded-lg object-contain"
            />
            <span className="font-medium text-[#1a1a2e]">
              KEKE<span className="text-[#f5a623]">.</span>MANAGER
            </span>
          </Link>
          {isLoaded && userId ? (
            <SignOutButton redirectUrl="/">
              <button
                type="button"
                className="rounded-lg border border-black/15 px-4 py-2 text-sm font-semibold text-[#1a1a2e] transition hover:bg-black/[0.04]"
              >
                გამოსვლა
              </button>
            </SignOutButton>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-center text-3xl font-black text-[#1a1a2e]">
          როგორ გამოიყენებთ KEKE-ს?
        </h1>
        <p className="mt-4 text-center text-sm text-black/50">
          აირჩიეთ როლი — მოგვიანებით შეცვლა შეიძლება Airtable-ში.
        </p>
        {error ? (
          <p className="mt-6 text-center text-sm text-black/50" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="flex flex-col rounded-2xl border border-black/10 bg-white p-6 text-center shadow-sm">
            <div className="text-5xl" aria-hidden>
              🚗
            </div>
            <h2 className="mt-4 text-xl font-bold text-[#1a1a2e]">მძღოლი ვარ</h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-black/50">
              გამოიყენე კეკე მენეჯერი შეკვეთების მისაღებად
            </p>
            <button
              type="button"
              className="btn-gold mt-6 w-full disabled:opacity-50"
              disabled={pending}
              onClick={() => choose("driver")}
            >
              გაგრძელება
            </button>
          </article>

          <article className="flex flex-col rounded-2xl border border-black/10 bg-white p-6 text-center shadow-sm">
            <div className="text-5xl" aria-hidden>
              🏢
            </div>
            <h2 className="mt-4 text-xl font-bold text-[#1a1a2e]">
              ტურისტული კომპანია ვარ
            </h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-black/50">
              გამოიყენე კეკე მენეჯერი ჯავშნებისა და მძღოლების მართვისთვის
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-lg border border-black/15 px-6 py-2 text-sm font-semibold uppercase tracking-wide text-[#1a1a2e] transition hover:bg-black/[0.04] disabled:opacity-50"
              disabled={pending}
              onClick={() => choose("company")}
            >
              გაგრძელება
            </button>
          </article>
        </div>
      </main>
    </>
  );
}
