"use client";

import { useClerk } from "@clerk/nextjs";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link, usePathname } from "@/i18n/navigation";
import {
  IconTablerChartBar,
  IconTablerHome,
  IconTablerLogout,
  IconTablerPlus,
  IconTablerSettings,
  IconTablerUsers,
} from "@/components/dashboard/tabler-nav-icons";

export type CompanyShellProfile = {
  companyName: string;
  logoUrl: string | null;
  initials: string;
  subtitle: string;
} | null;

const NO_SHELL = /^\/company\/?$/;
const NO_SHELL_SEARCH = /^\/company\/search/;
const NO_SHELL_EDIT = /^\/company\/edit/;

function navActive(pathname: string, href: string): boolean {
  if (href === "/company/dashboard") return pathname === "/company/dashboard" || pathname === "/company";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CompanyDesktopShell({
  profile,
  children,
}: {
  profile: CompanyShellProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { signOut } = useClerk();
  const tNav = useTranslations("nav");
  const tCompany = useTranslations("company_nav");

  const navItems: { href: string; label: string; icon: ReactNode }[] = [
    { href: "/company/dashboard", label: tNav("home"), icon: <IconTablerHome className="h-5 w-5 shrink-0" /> },
    { href: "/company/bookings/new", label: tCompany("new_booking"), icon: <IconTablerPlus className="h-5 w-5 shrink-0" /> },
    { href: "/company/drivers", label: tCompany("drivers"), icon: <IconTablerUsers className="h-5 w-5 shrink-0" /> },
    { href: "/company/reports", label: tCompany("reports"), icon: <IconTablerChartBar className="h-5 w-5 shrink-0" /> },
    { href: "/company/settings", label: tNav("settings"), icon: <IconTablerSettings className="h-5 w-5 shrink-0" /> },
  ];

  if (NO_SHELL.test(pathname) || NO_SHELL_SEARCH.test(pathname) || NO_SHELL_EDIT.test(pathname)) {
    return <>{children}</>;
  }

  const p = profile;
  const name = p?.companyName ?? "კომპანია";
  const sub = p?.subtitle ?? "დაფა";
  const initials = p?.initials ?? "?";

  return (
    <div className="min-h-screen bg-neutral-100 md:bg-[#f5f5f0]">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col md:mx-0 md:max-w-none md:flex-row">
        <aside className="sticky top-0 z-20 hidden h-screen w-[200px] shrink-0 flex-col bg-[#1a1a2e] text-white md:flex">
          <div className="shrink-0 border-b border-white/10 px-3 py-4">
            <div className="flex flex-col items-center text-center">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 ring-white/25">
                {p?.logoUrl ? (
                  <Image src={p.logoUrl} alt="" fill className="object-cover" sizes="48px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/15 text-xs font-black" aria-hidden>
                    {initials}
                  </div>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight">{name}</p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/50">{sub}</p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                აქტიური
              </span>
            </div>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3" aria-label="კომპანია">
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
              {tNav("logout")}
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-neutral-100 md:bg-[#f5f5f0]">{children}</div>
      </div>
    </div>
  );
}
