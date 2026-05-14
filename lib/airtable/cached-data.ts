import { unstable_cache } from "next/cache";

export const AIRTABLE_REVALIDATE_SECONDS = 60;

/** Use for any direct `fetch` to Airtable REST (Next.js Data Cache). The `airtable` package uses `node-fetch` internally, so reads also use `cachedAirtableRead`. */
export function airtableFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    next: { revalidate: AIRTABLE_REVALIDATE_SECONDS },
  });
}

export async function cachedAirtableRead<T>(
  keyParts: string[],
  loader: () => Promise<T>,
): Promise<T> {
  return unstable_cache(loader, keyParts, {
    revalidate: AIRTABLE_REVALIDATE_SECONDS,
  })();
}
