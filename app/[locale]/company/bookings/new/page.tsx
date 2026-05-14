import { Link } from "@/i18n/navigation";

export default function CompanyNewBookingPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <p className="text-base font-semibold text-[#1a1a2e]">ახალი შეკვეთა</p>
      <p className="mt-2 text-sm text-neutral-600">შეკვეთის შექმნა ხდება ძებნის ვიზარდით.</p>
      <Link
        href="/company/search"
        className="mt-6 inline-block rounded-lg bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#252542]"
      >
        ძებნაზე გადასვლა
      </Link>
    </div>
  );
}
