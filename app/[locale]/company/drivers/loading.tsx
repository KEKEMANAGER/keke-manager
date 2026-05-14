import { AppHeader } from "@/components/site/AppHeader";

export default function CompanyDriversLoading() {
  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-keke-muted">იტვირთება…</p>
      </div>
    </>
  );
}
