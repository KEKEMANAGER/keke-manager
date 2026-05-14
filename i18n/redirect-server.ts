import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

/** Server redirect that preserves the active locale (next-intl `redirect` requires `locale`). */
export async function localizedRedirect(href: string): Promise<never> {
  const locale = await getLocale();
  return redirect({ href: href as never, locale });
}
