import { Link } from "@/i18n/navigation";
import { localizedRedirect } from "@/i18n/redirect-server";
import { currentUser } from "@clerk/nextjs/server";
import { ensureClerkDriverRecords } from "@/lib/airtable/sync-clerk-driver";
import { getDriverVehiclePageData } from "@/lib/airtable/driver-vehicle-page";

export const dynamic = "force-dynamic";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] py-3 text-sm last:border-0">
      <span className="text-black/50">{label}</span>
      <span className="font-semibold text-[#1a1a2e]">{value}</span>
    </div>
  );
}

const uploadButtonClass =
  "inline-flex items-center justify-center rounded-xl bg-[#1a1a2e] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1a1a2e]/90";

export default async function DriverVehiclePage() {
  const user = await currentUser();
  if (!user?.id) return await localizedRedirect("/sign-in");

  const email = user.emailAddresses?.[0]?.emailAddress ?? "";
  const clerkFullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  await ensureClerkDriverRecords(user.id, email, clerkFullName);

  const data = await getDriverVehiclePageData(user.id);
  if (!data) return await localizedRedirect("/driver/edit");

  const yearStr = data.year != null ? String(data.year) : "—";
  const seatsStr = data.seats != null ? String(data.seats) : "—";
  const hasPhotos = data.photoUrls.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 text-[#1a1a2e] md:px-6">
      <h1 className="text-xl font-bold">მანქანა</h1>
      <p className="mt-1 text-sm text-black/50">ავტომობილის მონაცემები Airtable-იდან</p>

      <div className="mt-6 rounded-2xl border-[0.5px] border-black/[0.08] bg-white p-5 shadow-sm">
        <InfoRow label="ბრენდი" value={data.brand} />
        <InfoRow label="მოდელი" value={data.model} />
        <InfoRow label="წელი" value={yearStr} />
        <InfoRow label="სანომრე" value={data.plate?.trim() || "—"} />
        <InfoRow label="კლასი" value={data.vehicleClassLabel} />
        <InfoRow label="ადგილები" value={seatsStr} />
      </div>

      {hasPhotos ? (
        <>
          <div className="mt-6 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">ფოტოები</h2>
            <Link
              href="/driver/edit"
              className="shrink-0 rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-[#1a1a2e] transition hover:bg-black/[0.03]"
            >
              ფოტოს დამატება
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {data.photoUrls.map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`vehicle-photo-${index}-${url.slice(-24)}`}
                src={url}
                alt=""
                className="aspect-square w-full rounded-xl object-cover"
              />
            ))}
          </div>
        </>
      ) : (
        <div className="mt-6 flex justify-center rounded-2xl border-[0.5px] border-black/[0.08] bg-white p-12 shadow-sm">
          <Link href="/driver/edit" className={uploadButtonClass}>
            ფოტოს დამატება
          </Link>
        </div>
      )}
    </div>
  );
}
