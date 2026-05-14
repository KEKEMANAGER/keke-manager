import { getAirtableBase } from "@/lib/airtable/client";
import { cachedAirtableRead } from "@/lib/airtable/cached-data";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import { attachmentUrls } from "@/lib/airtable/field-utils";
import { mapVehicleRecord } from "@/lib/airtable/records-vehicle";
import { getDriverProfile } from "@/lib/airtable/driver-profile";
import { VEHICLE_CLASS_LABELS } from "@/lib/vehicle-class-labels";
import type { VehicleClass } from "@/types/airtable";

const VEHICLE_PHOTOS_FIELDS = ["vehiclePhotos", "vehicle_photos"] as const;

export type DriverVehiclePageData = {
  brand: string;
  model: string;
  year: number | null;
  plate: string | null;
  vehicleClass: VehicleClass | null;
  vehicleClassLabel: string;
  seats: number | null;
  /** HTTPS Cloudinary image URLs only — from Vehicles `vehiclePhotos` (see Airtable). */
  photoUrls: string[];
};

function splitBrandModel(makeModel: string | null): { brand: string; model: string } {
  const s = (makeModel ?? "").trim();
  if (!s || s === "—") return { brand: "—", model: "—" };
  const idx = s.indexOf(" ");
  if (idx === -1) return { brand: s, model: "—" };
  const model = s.slice(idx + 1).trim();
  return { brand: s.slice(0, idx), model: model || "—" };
}

/** Only `res.cloudinary.com` HTTPS URLs (no Airtable embeds / iframes). */
function isCloudinaryHttpsImageUrl(url: string): boolean {
  const u = url.trim();
  if (!u.startsWith("https://")) return false;
  try {
    const parsed = new URL(u);
    return parsed.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

function dedupeCloudinaryUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const u = raw.trim();
    if (!isCloudinaryHttpsImageUrl(u) || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/**
 * Reads Vehicles `vehiclePhotos` (or `vehicle_photos`): multiple attachments and/or
 * long text (JSON string array or newline/comma-separated Cloudinary URLs).
 */
function parseVehiclePhotosFromFields(vf: Record<string, unknown>): string[] {
  const collected: string[] = [];

  for (const fieldName of VEHICLE_PHOTOS_FIELDS) {
    const raw = vf[fieldName];
    if (raw == null) continue;

    if (Array.isArray(raw)) {
      for (const u of attachmentUrls(raw)) {
        collected.push(u);
      }
      continue;
    }

    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) continue;
      try {
        const parsed = JSON.parse(s) as unknown;
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "string") collected.push(item);
          }
          continue;
        }
      } catch {
        /* not JSON */
      }
      for (const part of s.split(/[\n,]+/)) {
        const t = part.trim();
        if (t) collected.push(t);
      }
    }
  }

  return dedupeCloudinaryUrls(collected);
}

async function loadDriverVehiclePageData(
  clerkId: string,
): Promise<DriverVehiclePageData | null> {
  const profile = await getDriverProfile(clerkId);
  if (!profile) return null;

  const fallbackModel =
    profile.vehicleModel === "—" ? null : profile.vehicleModel;
  const { brand: fbBrand, model: fbModel } = splitBrandModel(fallbackModel);

  if (!profile.primaryVehicleId) {
    return {
      brand: fbBrand,
      model: fbModel,
      year: profile.vehicleYear,
      plate: profile.licensePlate ?? null,
      vehicleClass: profile.vehicleCategory,
      vehicleClassLabel: VEHICLE_CLASS_LABELS[profile.vehicleCategory],
      seats: profile.seats,
      photoUrls: [],
    };
  }

  const base = getAirtableBase();
  try {
    const rec = await base(AIRTABLE_TABLES.Vehicles).find(profile.primaryVehicleId);
    const v = mapVehicleRecord(rec);
    const vf = rec.fields as Record<string, unknown>;
    const photoUrls = parseVehiclePhotosFromFields(vf);
    const { brand, model } = splitBrandModel(v.makeModel);
    const cat = v.category ?? profile.vehicleCategory;
    return {
      brand,
      model,
      year: v.year ?? profile.vehicleYear,
      plate: v.licensePlate ?? profile.licensePlate ?? null,
      vehicleClass: cat,
      vehicleClassLabel: VEHICLE_CLASS_LABELS[cat],
      seats: v.seats ?? profile.seats,
      photoUrls,
    };
  } catch {
    return {
      brand: fbBrand,
      model: fbModel,
      year: profile.vehicleYear,
      plate: profile.licensePlate ?? null,
      vehicleClass: profile.vehicleCategory,
      vehicleClassLabel: VEHICLE_CLASS_LABELS[profile.vehicleCategory],
      seats: profile.seats,
      photoUrls: [],
    };
  }
}

export async function getDriverVehiclePageData(
  clerkId: string,
): Promise<DriverVehiclePageData | null> {
  if (!clerkId.trim()) return null;
  return cachedAirtableRead(
    ["airtable", "getDriverVehiclePageData", clerkId],
    () => loadDriverVehiclePageData(clerkId),
  );
}
