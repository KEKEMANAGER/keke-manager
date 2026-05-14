import { localizedRedirect } from "@/i18n/redirect-server";

/** პროფილის რედაქტირება — ერთიანი ფორმა `/driver/edit`-ზე */
export default async function DriverProfileEditPage() {
  return await localizedRedirect("/driver/edit");
}
