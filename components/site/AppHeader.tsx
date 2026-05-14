"use client";

import { Link } from "@/i18n/navigation";
import { SignOutButton, useAuth } from "@clerk/nextjs";

export function AppHeader() {
  const { isLoaded, userId } = useAuth();

  return (
    <header className="border-b border-keke-line bg-[#0f0f0f]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-5">
        <Link href="/" className="group flex flex-col leading-tight">
          <span className="text-lg font-black tracking-tight text-white md:text-xl">
            KEKE<span className="text-[#f5a623]">.</span>MANAGER
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">
            Supercharging Georgian tourism transport
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-white md:flex">
          <span className="cursor-default text-white/45">ტურისტული კომპანიები</span>
          <span className="cursor-default text-white/45">მძღოლები / ფლოტი</span>
          <span className="cursor-default text-white/45">ტარიფები API</span>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="btn-outline hidden sm:inline-block">
            შესვლა
          </Link>
          <Link href="/sign-up" className="btn-gold hidden sm:inline-block">
            რეგისტრაცია
          </Link>
          {isLoaded && userId ? (
            <SignOutButton redirectUrl="/">
              <button type="button" className="btn-outline hidden sm:inline-block">
                გამოსვლა
              </button>
            </SignOutButton>
          ) : null}
        </div>
      </div>
    </header>
  );
}
