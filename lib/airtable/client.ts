import Airtable, { type Base } from "airtable";

let cachedBase: Base | null = null;

/** Airtable base — მხოლოდ სერვერის კონტექსტში (როუტები, სერვერ აქციები). */
export function getAirtableBase(): Airtable.Base {
  if (typeof window !== "undefined") {
    throw new Error("getAirtableBase() is server-only.");
  }

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey?.trim() || !baseId?.trim()) {
    throw new Error("Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in .env.local.");
  }

  if (!cachedBase) {
    cachedBase = new Airtable({ apiKey }).base(baseId);
  }
  return cachedBase;
}
