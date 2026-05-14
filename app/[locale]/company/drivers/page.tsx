import { Link } from "@/i18n/navigation";
import { DriverCard } from "@/components/driver/DriverCard";
import { getDrivers } from "@/lib/airtable/drivers";

export const dynamic = "force-dynamic";

export default async function CompanyDriversPage() {
  let profiles: Awaited<ReturnType<typeof getDrivers>> = [];
  let loadError: string | null = null;
  try {
    profiles = await getDrivers();
  } catch (e) {
    profiles = [];
    loadError = e instanceof Error ? e.message : "Airtable load failed.";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex items-center justify-between md:hidden">
        <Link href="/company/dashboard" className="text-sm font-semibold text-[#1a1a2e]">
          ← დაფა
        </Link>
      </div>
      <header className="mb-8 flex flex-col gap-2 border-b border-neutral-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 md:text-3xl">მძღოლები და ტრანსპორტი</h1>
            <p className="mt-2 text-sm text-neutral-600">
              სურათი, ვერიფიკაცია, რეიტინგი და ავტოს პარამეტრები.
            </p>
          </div>
          <div className="flex gap-2 text-xs text-neutral-500">
            <span className="rounded border border-neutral-200 bg-white px-2 py-1">ფასი</span>
            <span className="rounded border border-neutral-200 bg-white px-2 py-1">ფილტრი</span>
            <span className="rounded border border-emerald-600/30 bg-emerald-50 px-2 py-1 text-emerald-800">
              Transfers ▼
            </span>
          </div>
        </header>
        {loadError ? (
          <p className="mb-6 text-sm text-red-600" role="status">
            {loadError}
          </p>
        ) : null}
        {!loadError && profiles.length === 0 ? (
          <p className="mb-6 text-sm text-neutral-600" role="status">
            მძღოლები ჯერ არ არის — დაამატეთ ჩანაწერები Airtable-ის Drivers / Vehicles ცხრილებში.
          </p>
        ) : null}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((d) => (
            <DriverCard key={d.id} driver={d} />
          ))}
        </div>
    </div>
  );
}
