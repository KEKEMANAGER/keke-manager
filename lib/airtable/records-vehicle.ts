import type { FieldSet, Record as AirtableRecord } from "airtable";
import type { Vehicle, VehicleClass } from "@/types/airtable";
import {
  linkedRecordIds,
  firstAttachmentUrl,
  asNumber,
  asString,
} from "@/lib/airtable/field-utils";

function coerceCategory(raw: unknown): VehicleClass | null {
  const s = asString(raw);
  const allowed: VehicleClass[] = [
    "sedan",
    "minivan_small",
    "minivan",
    "minibus",
    "bus",
    "business",
  ];
  return allowed.includes(s as VehicleClass) ? (s as VehicleClass) : null;
}

export function mapVehicleRecord(record: AirtableRecord<FieldSet>): Vehicle {
  const f = record.fields;
  const fuelCombined = Array.isArray(f["fuel_type"])
    ? (f["fuel_type"] as string[]).join(", ")
    : asString(f["fuel_type"]);

  return {
    id: record.id,
    category: coerceCategory(f["Class"]),
    makeModel: asString(f["Model"]),
    licensePlate: asString(f["Plate"]),
    year: asNumber(f["Year"]),
    color: asString(f["Color"]) ?? asString(f["color"]),
    seats: asNumber(f["seats"]),
    luggageSlots: asNumber(f["luggage_slots"]),
    fuelType: fuelCombined,
    photoExteriorUrl: firstAttachmentUrl(f["photo_exterior"]),
    photoInteriorUrl: firstAttachmentUrl(f["photo_interior"]),
    photoFrontUrl: firstAttachmentUrl(f["photo_front"]),
    driverIds: linkedRecordIds(f["Driver"]),
  };
}
