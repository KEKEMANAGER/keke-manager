/** Airtable Drivers `languages` (Multiple select) — option names must match the base. */
export const DRIVER_AIRTABLE_LANGUAGES = [
  "Georgian",
  "English",
  "Russian",
  "Turkish",
  "German",
  "French",
  "Arabic",
  "Chinese",
  "Italian",
  "Spanish",
  "Japanese",
] as const;

export type DriverAirtableLanguage = (typeof DRIVER_AIRTABLE_LANGUAGES)[number];

export const DRIVER_LANGUAGE_FORM_OPTIONS: {
  value: DriverAirtableLanguage;
  label: string;
}[] = [
  { value: "Georgian", label: "ქართული" },
  { value: "English", label: "ინგლისური" },
  { value: "Russian", label: "რუსული" },
  { value: "Turkish", label: "თურქული" },
  { value: "German", label: "გერმანული" },
  { value: "French", label: "ფრანგული" },
  { value: "Arabic", label: "არაბული" },
  { value: "Chinese", label: "ჩინური" },
  { value: "Italian", label: "იტალიური" },
  { value: "Spanish", label: "ესპანური" },
  { value: "Japanese", label: "იაპონური" },
];

export const DRIVER_AIRTABLE_LANGUAGE_SET = new Set<string>(
  DRIVER_AIRTABLE_LANGUAGES,
);
