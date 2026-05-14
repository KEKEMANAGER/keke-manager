import { Link } from "@/i18n/navigation";

export default function CompanyReportsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <p className="text-base font-semibold text-[#1a1a2e]">ანგარიში</p>
      <p className="mt-2 text-sm text-neutral-600">ანგარიშგება და ექსპორტი — მალე.</p>
      <Link href="/company/dashboard" className="mt-6 inline-block text-sm font-medium text-[#185fa5] underline">
        დაფა
      </Link>
    </div>
  );
}
