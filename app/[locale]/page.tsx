import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link } from "@/i18n/navigation";

const ACCENT = "#f5a623";

const signInHref = "/sign-in";
const signUpHref = "/sign-up";

/** Tabler-outline–style icons (ti-*); stroke, gold via currentColor */
function FeatureIcon({
  name,
}: {
  name: "ti-shield-check" | "ti-calendar" | "ti-chart-bar" | "ti-map-pin";
}) {
  const common = "h-8 w-8 shrink-0 text-[#f5a623]";
  switch (name) {
    case "ti-shield-check":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path
            d="M12 3c4.8 2.4 8 3 8 3v5c0 3.5-2.5 6.5-8 9-5.5-2.5-8-5.5-8-9V6s3.2-.6 8-3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "ti-calendar":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" strokeLinejoin="round" />
          <path d="M16 3v4M8 3v4M4 11h16" strokeLinecap="round" />
          <path d="M11 15h1v3" strokeLinecap="round" />
        </svg>
      );
    case "ti-chart-bar":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path d="M3 3v18h18" strokeLinecap="round" />
          <path d="M7 16V9M12 16v-5M17 16v-3" strokeLinecap="round" />
        </svg>
      );
    case "ti-map-pin":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path d="M12 11.5a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5Z" />
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

const features: { icon: "ti-shield-check" | "ti-calendar" | "ti-chart-bar" | "ti-map-pin"; title: string }[] = [
  { icon: "ti-shield-check", title: "ვერიფიც. პარტნიორები" },
  { icon: "ti-calendar", title: "მარტივი ბუქინგი" },
  { icon: "ti-chart-bar", title: "რეალური ანგარიში" },
  { icon: "ti-map-pin", title: "GPS თვალყური" },
];

async function NavButtons({ className }: { className?: string }) {
  const t = await getTranslations("landing");
  return (
    <div className={className}>
      <Link
        href={signInHref}
        className="inline-flex min-h-[44px] min-w-[120px] items-center justify-center rounded-xl border-2 border-[#f5a623] px-5 text-sm font-semibold text-[#f5a623] transition hover:bg-[#f5a623]/10"
      >
        {t("signin")}
      </Link>
      <Link
        href={signUpHref}
        className="inline-flex min-h-[44px] min-w-[120px] items-center justify-center rounded-xl bg-[#f5a623] px-5 text-sm font-semibold text-[#0f0f0f] transition hover:brightness-110"
      >
        {t("signup")}
      </Link>
    </div>
  );
}

function FeatureGrid() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4" aria-label="ფუნქციები">
      {features.map((f) => (
        <li
          key={f.icon}
          className="flex flex-col gap-3 rounded-2xl border border-[rgba(245,166,35,0.15)] bg-[rgba(245,166,35,0.06)] p-4 sm:p-5"
        >
          <FeatureIcon name={f.icon} />
          <p className="text-sm font-semibold leading-snug text-white sm:text-base">{f.title}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function HomePage() {
  const t = await getTranslations("landing");

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white antialiased">
      <header className="hidden border-b border-white/10 md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" width={36} height={36} className="shrink-0 rounded-xl" alt="" />
            <p className="truncate text-lg font-bold tracking-tight">
              <span className="text-white">KEKE</span>
              <span style={{ color: ACCENT }}>.</span>
              <span className="text-white">MANAGER</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <LanguageSwitcher variant="dark" />
            <NavButtons className="flex flex-wrap items-center justify-end gap-3" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 md:px-8 md:pb-24 md:pt-12 lg:px-10">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:items-center md:gap-14 lg:gap-20">
          <div className="flex flex-col">
            <div className="flex flex-col items-center md:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" width={72} height={72} className="rounded-2xl" alt="" />
              <p className="mt-5 text-lg font-bold tracking-tight sm:text-xl">
                <span className="text-white">KEKE</span>
                <span style={{ color: ACCENT }}>.</span>
                <span className="text-white">MANAGER</span>
              </p>
            </div>

            <h1 className="mt-10 text-center text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl md:mt-0 md:text-left md:text-4xl lg:text-[2.5rem] lg:leading-[1.15]">
              {t("title")}
            </h1>
            <p className="mt-3 text-center text-base font-medium leading-snug text-[#f5a623] sm:text-lg md:text-left md:text-xl">
              {t("subtitle")}
            </p>
            <p className="mt-4 text-center text-base leading-relaxed text-white/40 md:text-left md:text-lg">
              ჯავშანი, მარშრუტი და შესრულების კონტროლი ერთ სივრცეში — გამჭვირვალე პროცესი და GPS თვალყური.
            </p>

            <div className="mt-6 flex justify-center md:hidden">
              <LanguageSwitcher variant="dark" />
            </div>

            <div className="mt-8 flex justify-center md:justify-start">
              <Link
                href={signUpHref}
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#f5a623] px-8 text-sm font-semibold text-[#0f0f0f] transition hover:brightness-110"
              >
                {t("start")} →
              </Link>
            </div>
          </div>

          <FeatureGrid />
        </div>
      </main>
    </div>
  );
}
