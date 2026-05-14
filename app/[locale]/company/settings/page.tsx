import { Link } from "@/i18n/navigation";

export default function CompanySettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <p className="text-base font-semibold text-[#1a1a2e]">პარამეტრები</p>
      <p className="mt-2 text-sm text-neutral-600">კომპანიის პარამეტრები — პროფილის რედაქტირება ხელმისაწვდომია.</p>
      <Link href="/company/edit" className="mt-6 inline-block text-sm font-medium text-[#185fa5] underline">
        პროფილის რედაქტირება
      </Link>
    </div>
  );
}
