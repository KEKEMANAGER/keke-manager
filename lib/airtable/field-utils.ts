export function linkedRecordIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export function firstAttachmentUrl(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const url = (raw[0] as { url?: string })?.url;
  return typeof url === "string" ? url : null;
}

/** All attachment URLs in order (e.g. Cloudinary / Airtable-hosted). */
export function attachmentUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const url =
      item != null &&
      typeof item === "object" &&
      "url" in item &&
      typeof (item as { url?: unknown }).url === "string"
        ? (item as { url: string }).url
        : null;
    if (url) out.push(url);
  }
  return out;
}

export function asString(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") return raw || null;
  return String(raw);
}

export function asNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asBoolean(raw: unknown): boolean {
  return Boolean(raw);
}

export function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}
