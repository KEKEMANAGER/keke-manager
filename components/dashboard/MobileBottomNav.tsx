"use client";

import { useClerk } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { IconTablerLogout } from "@/components/dashboard/tabler-nav-icons";

export type MobileNavTab = {
  href: string;
  label: string;
};

function parseHref(href: string): { path: string; hash: string } {
  const i = href.indexOf("#");
  if (i === -1) return { path: href, hash: "" };
  return { path: href.slice(0, i), hash: href.slice(i) };
}

function tabIsActive(
  pathname: string,
  locationHash: string,
  href: string,
): boolean {
  const { path, hash } = parseHref(href);
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  if (hash) return locationHash === hash;
  return locationHash === "" || locationHash === "#";
}

export function MobileBottomNav({
  tabs,
  ariaLabel,
  showSignOut = false,
}: {
  tabs: MobileNavTab[];
  ariaLabel: string;
  /** Fifth slot: logout (Clerk signOut → /) */
  showSignOut?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [hash, setHash] = useState("");
  const { signOut } = useClerk();
  const tNav = useTranslations("nav");

  useEffect(() => {
    setHash(typeof window !== "undefined" ? window.location.hash : "");
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const cols = showSignOut ? "grid-cols-5" : "grid-cols-4";

  return (
    <nav
      aria-label={ariaLabel}
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] md:hidden"
    >
      <ul className={`mx-auto grid w-full max-w-[430px] gap-0 px-1 ${cols}`}>
        {tabs.map((tab) => {
          const active = tabIsActive(pathname, hash, tab.href);
          return (
            <li key={tab.href} className="min-w-0">
              <Link
                href={tab.href}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium leading-tight transition-colors ${
                  active ? "text-[#1a1a2e]" : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                <span
                  className={`h-1 w-6 rounded-full sm:w-8 ${active ? "bg-[#1a1a2e]" : "bg-transparent"}`}
                  aria-hidden
                />
                <span className="line-clamp-2 text-center">{tab.label}</span>
              </Link>
            </li>
          );
        })}
        {showSignOut ? (
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => void signOut({ redirectUrl: "/" })}
              className="flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium leading-tight text-neutral-400 transition hover:text-neutral-700"
            >
              <IconTablerLogout className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span className="line-clamp-2 text-center">{tNav("logout")}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
