/**
 * ცხრილების სახელები Airtable-ში schemas/airtable-base.json-სთან ემთხვევა.
 */
export const AIRTABLE_TABLES = {
  Users: "Users",
  Drivers: "Drivers",
  Vehicles: "Vehicles",
  Bookings: "Bookings",
  LedgerEntries: "LedgerEntries",
  TourismCompanies: "TourismCompanies",
} as const;

export type AirtableTableName = (typeof AIRTABLE_TABLES)[keyof typeof AIRTABLE_TABLES];
