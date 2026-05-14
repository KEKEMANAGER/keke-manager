import type { VehicleClass } from "@/types/airtable";

export const VEHICLE_CLASS_ORDER: VehicleClass[] = [
  "sedan",
  "minivan_small",
  "minivan",
  "minibus",
  "bus",
  "business",
];

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  sedan: "სედანი",
  minivan_small: "მინივენი (მცირე)",
  minivan: "მინივენი",
  minibus: "მიქროავტობუსი",
  bus: "ავტობუსი",
  business: "ბიზნეს კლასი",
};
