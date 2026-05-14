"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Variant = "light" | "dark";

export function LanguageSwitcher({ variant = "light" }: { variant?: Variant }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const active =
    variant === "dark"
      ? "bg-[#f5a623] text-[#0f0f0f] ring-1 ring-[#f5a623]/50"
      : "bg-[#1a1a2e] text-white ring-1 ring-black/10";

  const idle =
    variant === "dark"
      ? "bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
      : "bg-white text-[#1a1a2e] ring-1 ring-black/10 hover:bg-black/[0.04]";

  function setLocale(next: (typeof routing.locales)[number]) {
    router.replace(pathname, { locale: next });
  }

  return (
    <div
      className="flex items-center gap-1 rounded-lg p-0.5"
      role="group"
      aria-label="Language"
    >
      {routing.locales.map((code) => {
        const label = code === "ka" ? "კა" : code.toUpperCase();
        const isActive = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            className={`min-w-[2.25rem] rounded-md px-2 py-1 text-xs font-semibold transition ${
              isActive ? active : idle
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
