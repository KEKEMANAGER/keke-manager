import { Link } from "@/i18n/navigation";

/** Legacy marketing strip — black + gold only, no patterns */
export function Hero() {
  return (
    <section className="border-b border-keke-line bg-[#0f0f0f]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
        <div>
          <h1 className="max-w-xl text-4xl font-black leading-[1.05] tracking-tight text-white md:text-5xl lg:text-6xl">
            სწრაფად რენტავი ტრანსპორტს KEKE MANAGER-ით
          </h1>
          <p className="mt-6 max-w-lg text-base text-white/50 md:text-lg">
            ტურისტული კომპანიებისა და ფრილანსერ მძღოლების B2B პლატფორმა — ჯავშანი, კალენდარი, GPS და რეიტინგი ერთ
            სივრცეში.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/company/search" className="btn-gold px-10 py-3 text-base">
              ძებნის დაწყება
            </Link>
            <Link
              href="/company/drivers"
              className="border-2 border-[#f5a623] bg-transparent px-8 py-3 text-base font-semibold text-[#f5a623] transition hover:bg-[#f5a623]/10"
            >
              მძღოლის კატალოგი
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <FeatureBlock title="მრავალენოვანი მხარდაჭერა 24/7" multilingual />
          <FeatureBlock title="დაზღვევისა და სერვისის პარტნიორები" />
          <FeatureBlock title="მთელი ტრანსპორტის კლასები" />
          <FeatureBlock title="GPS თვალთვალი და ვაუჩერები" />
          <FeatureBlock title="Georgia-wide coverage" className="col-span-2" />
        </div>
      </div>
    </section>
  );
}

function FeatureBlock({
  title,
  multilingual,
  className = "",
}: {
  title: string;
  multilingual?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[120px] flex-col justify-between rounded-2xl border border-[rgba(245,166,35,0.15)] bg-[rgba(245,166,35,0.06)] p-4 md:min-h-[140px] ${className}`}
    >
      <p className="text-sm font-bold leading-snug text-white md:text-base">{title}</p>
      {multilingual ? (
        <p className="mt-2 text-[10px] leading-relaxed text-white/45">
          DE · EL · RU · TR · KA — ყველა ენა ერთ ბლოკში
        </p>
      ) : null}
    </div>
  );
}
