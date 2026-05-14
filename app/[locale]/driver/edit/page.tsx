import { Link } from "@/i18n/navigation";
import { localizedRedirect } from "@/i18n/redirect-server";

import { currentUser } from "@clerk/nextjs/server";

import { isRedirectError } from "next/dist/client/components/redirect-error";

import { AppHeader } from "@/components/site/AppHeader";

import { ensureClerkDriverRecords } from "@/lib/airtable/sync-clerk-driver";

import { getDriverProfile } from "@/lib/airtable/driver-profile";

import { DriverEditForm } from "./DriverEditForm";



export const dynamic = "force-dynamic";



function errorDetails(error: unknown): string {

  if (error instanceof Error) {

    return [error.message, error.stack].filter(Boolean).join("\n");

  }

  try {

    return JSON.stringify(error);

  } catch {

    return String(error);

  }

}



export default async function DriverEditPage() {

  try {

    const user = await currentUser();

    if (!user?.id) {

      return await localizedRedirect("/sign-in");

    }



    const clerkId = user.id;

    const email = user.emailAddresses?.[0]?.emailAddress ?? "";

    const clerkFullName = [

      user.firstName,

      user.lastName,

    ]

      .filter(Boolean)

      .join(" ");



    await ensureClerkDriverRecords(clerkId, email, clerkFullName);

    const profile = await getDriverProfile(clerkId);



    if (!profile) {

      return (

        <>

          <AppHeader />

          <main className="mx-auto max-w-2xl px-4 py-16">

            <h1 className="text-4xl font-black text-white">

              პროფილის რედაქტირება

            </h1>

            <p className="mt-6 text-sm text-keke-muted">

              პროფილი ვერ მოიძებნა.

            </p>

            <Link href="/driver" className="btn-outline mt-6 inline-block">

              უკან

            </Link>

          </main>

        </>

      );

    }



    const initialName = [profile.firstName, profile.lastName]

      .filter(Boolean)

      .join(" ");

    const initialMakeModel =

      profile.vehicleModel === "—" ? "" : profile.vehicleModel;



    return (

      <>

        <AppHeader />

        <main className="mx-auto max-w-2xl px-4 py-16">

          <h1 className="text-4xl font-black text-white">

            პროფილის რედაქტირება

          </h1>

          <DriverEditForm

            initialName={initialName}

            initialMakeModel={initialMakeModel}

            initialLicensePlate={profile.licensePlate ?? ""}

            initialCategory={profile.vehicleCategory}

            initialYear={profile.vehicleYear}

            initialColor={profile.vehicleColor ?? ""}

            initialBio={profile.bio ?? ""}

            initialLanguages={profile.languages ?? []}

            initialHasLicensePhoto={profile.hasLicensePhoto ?? false}

            initialHasIdPhoto={profile.hasIdPhoto ?? false}

            initialHasPortraitPhoto={profile.hasPortraitPhoto ?? false}

            initialHasVehiclePhotoFront={profile.hasVehiclePhotoFront ?? false}

            initialHasVehiclePhotoRear={profile.hasVehiclePhotoRear ?? false}

            initialHasVehiclePhotoLeft={profile.hasVehiclePhotoLeft ?? false}

            initialHasVehiclePhotoRight={profile.hasVehiclePhotoRight ?? false}

            initialHasVehiclePhotoInterior={profile.hasVehiclePhotoInterior ?? false}

          />

        </main>

      </>

    );

  } catch (error) {

    if (isRedirectError(error)) throw error;



    console.error("[driver/edit] ERROR:", error);



    const details = errorDetails(error);



    return (

      <>

        <AppHeader />

        <main className="mx-auto max-w-2xl px-4 py-16">

          <h1 className="text-4xl font-black text-white">

            პროფილის რედაქტირება

          </h1>

          <p className="mt-6 text-sm text-keke-muted" role="alert">

            გვერდი ვერ ჩაიტვირთა.

          </p>

          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-keke-line bg-keke-black p-4 text-xs text-white">

            {details}

          </pre>

          <Link href="/driver" className="btn-outline mt-6 inline-block">

            უკან

          </Link>

        </main>

      </>

    );

  }

}


