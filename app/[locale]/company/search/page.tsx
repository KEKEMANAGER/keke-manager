import { AppHeader } from "@/components/site/AppHeader";
import { getDrivers } from "@/lib/airtable/drivers";
import { CompanySearchWizard } from "./CompanySearchWizard";

export default async function CompanySearchPage() {
  let drivers: Awaited<ReturnType<typeof getDrivers>> = [];
  try {
    drivers = await getDrivers();
  } catch {
    drivers = [];
  }

  return (
    <>
      <AppHeader />
      <CompanySearchWizard drivers={drivers} />
    </>
  );
}
