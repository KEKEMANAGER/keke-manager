"use client";

import { useClerk } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link, usePathname } from "@/i18n/navigation";
import {
  IconTablerCalendar,
  IconTablerCar,
  IconTablerHome,
  IconTablerLogout,
  IconTablerSettings,
  IconTablerUser,
} from "@/components/dashboard/tabler-nav-icons";

export type DriverShellProfile = {
  portraitPhotoUrl?: string | null;
  fullName: string;
  vehicleLine: string;
  initials: string;
} | null;

const NO_SHELL = /^\/driver\/?$/;
const NO_SHELL_EDIT = /^\/driver\/edit/;

function navActive(pathname: string, href: string): boolean {
  if (href === "/driver/dashboard") return pathname === "/driver/dashboard" || pathname === "/driver";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DriverDesktopShell({
  profile,
  children,
}: {
  profile: DriverShellProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { signOut } = useClerk();
  const t = useTranslations("nav");

  const navItems: { href: string; label: string; icon: ReactNode }[] = [
    { href: "/driver/dashboard", label: t("home"), icon: <IconTablerHome className="h-5 w-5 shrink-0" /> },
    { href: "/driver/calendar", label: t("calendar"), icon: <IconTablerCalendar className="h-5 w-5 shrink-0" /> },
    { href: "/driver/vehicle", label: t("vehicle"), icon: <IconTablerCar className="h-5 w-5 shrink-0" /> },
    { href: "/driver/profile", label: t("profile"), icon: <IconTablerUser className="h-5 w-5 shrink-0" /> },
    { href: "/driver/settings", label: t("settings"), icon: <IconTablerSettings className="h-5 w-5 shrink-0" /> },
  ];

  if (NO_SHELL.test(pathname) || NO_SHELL_EDIT.test(pathname)) {
    return <>{children}</>;
  }

  const p = profile;
  const name = p?.fullName ?? "მძღოლი";
  const sub = p?.vehicleLine ?? "—";
  const initials = p?.initials ?? "?";

  return (
    <div className="min-h-screen bg-neutral-100 md:bg-[#f5f5f0]">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col md:mx-0 md:max-w-none md:flex-row">
        <aside className="sticky top-0 z-20 hidden h-screen w-[200px] shrink-0 flex-col bg-[#1a1a2e] text-white md:flex">
          <div className="shrink-0 border-b border-white/10 px-3 py-4">
            <div className="flex flex-col items-center text-center">
              {p?.portraitPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.portraitPhotoUrl}
                  alt=""
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-white/25"
                />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-sm font-bold ring-2 ring-white/25"
                  aria-hidden
                >
                  {initials}
                </div>
              )}
              <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight">{name}</p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/50">{sub}</p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                აქტიური
              </span>
            </div>
          </div>
          <nav
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3"
            aria-label="მძღოლი"
          >
            {navItems.map((item) => {
              const active = navActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition ${
                    active ? "bg-white/[0.1] text-white" : "text-white/[0.4] hover:bg-white/[0.06] hover:text-white/80"
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto shrink-0 space-y-2 border-t border-white/10 px-2 py-3">
            <div className="flex justify-center px-1">
              <LanguageSwitcher variant="dark" />
            </div>
            <button
              type="button"
              onClick={() => void signOut({ redirectUrl: "/" })}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-white/30 transition hover:bg-white/[0.06] hover:text-white/50"
            >
              <IconTablerLogout className="h-5 w-5 shrink-0" />
              {t("logout")}
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-neutral-100 md:bg-[#f5f5f0]">{children}</div>
      </div>
    </div>
  );
}
