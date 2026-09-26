import * as DocumentPicker from 'expo-document-picker';
import type { DbCanonicalKind, InsertBookingInput, TourDayPersisted } from './bookings';
import { supabase } from './supabase';

/**
 * Word / Excel import.
 *
 * The file goes to the `booking-import` edge function, which reads it with a
 * deterministic template parser first and falls back to the model only for the
 * fields the template could not find. What comes back is a DRAFT — it is never
 * written anywhere. The company reviews it on screen and the ordinary booking
 * creation path does the rest, so every existing validation still applies.
 */

export const IMPORT_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
  'text/csv',
] as const;

export const IMPORT_EXTENSIONS = ['.docx', '.xlsx', '.txt', '.csv'] as const;

export type ImportFieldSource = 'template' | 'ai' | 'none';

export type ImportedTourDay = {
  day: number;
  date: string | null;
  fromPlace: string | null;
  toPlace: string | null;
  stops: string | null;
};

export type ImportedBookingDraft = {
  kind: DbCanonicalKind | null;
  date_display: string | null;
  from_location: string | null;
  to_location: string | null;
  route: string | null;
  passengers: number | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  flight_number: string | null;
  flight_direction: 'arrival' | 'departure' | null;
  pickup_time: string | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  meet_greet: boolean | null;
  sign_text: string | null;
  client_price: number | null;
  payment_method: string | null;
  comment: string | null;
  tour_days: ImportedTourDay[] | null;
};

export type BookingImportResult = {
  ok: true;
  draft: ImportedBookingDraft;
  sources: Partial<Record<keyof ImportedBookingDraft, ImportFieldSource>>;
  warnings: string[];
  usedAi: boolean;
  fileName: string;
  textPreview: string;
};

export type BookingImportFailure = { ok: false; error: string };

export type PickedFile = { name: string; base64: string; sizeBytes: number };

/** 4 MB of actual file — a booking sheet is a few kilobytes. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function stripDataUrlPrefix(value: string): string {
  const comma = value.indexOf(',');
  return value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value;
}

/**
 * Reads a picked file as base64 without pulling in expo-file-system — adding a
 * native module would force a new native build, and this works on iOS, Android
 * and web with what the app already ships.
 */
async function readAsBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ფაილის წაკითხვა ვერ მოხერხდა'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
  return stripDataUrlPrefix(dataUrl);
}

/** Opens the system picker. Returns null when the user cancels. */
export async function pickBookingFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [...IMPORT_MIME_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset?.uri) return null;

  const size = asset.size ?? 0;
  if (size > MAX_FILE_BYTES) {
    throw new Error('ფაილი ძალიან დიდია (მაქს. 4 MB)');
  }

  const base64 = await readAsBase64(asset.uri);
  return {
    name: asset.name || 'booking.docx',
    base64,
    sizeBytes: size || Math.floor((base64.length * 3) / 4),
  };
}

export async function parseBookingFile(
  file: PickedFile,
): Promise<BookingImportResult | BookingImportFailure> {
  const { data, error } = await supabase.functions.invoke('booking-import', {
    body: { fileName: file.name, contentBase64: file.base64 },
  });

  if (error) {
    // The function returns a readable Georgian message in the body even on 4xx.
    const ctx = (error as { context?: { body?: unknown } }).context?.body;
    if (typeof ctx === 'string') {
      try {
        const parsed = JSON.parse(ctx) as { error?: string };
        if (parsed.error) return { ok: false, error: parsed.error };
      } catch {
        /* fall through to the generic message */
      }
    }
    return { ok: false, error: error.message || 'ფაილის წაკითხვა ვერ მოხერხდა' };
  }

  if (!data || (data as { ok?: boolean }).ok !== true) {
    return {
      ok: false,
      error: (data as { error?: string })?.error || 'ფაილის წაკითხვა ვერ მოხერხდა',
    };
  }

  return data as BookingImportResult;
}

/** Pick and parse in one step. Returns null when the user cancels. */
export async function importBookingFromFile(): Promise<
  BookingImportResult | BookingImportFailure | null
> {
  let file: PickedFile | null;
  try {
    file = await pickBookingFile();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!file) return null;
  return parseBookingFile(file);
}

function toTourDaysPersisted(days: ImportedTourDay[] | null): TourDayPersisted[] | null {
  if (!days?.length) return null;
  return days
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((d) => ({
      day: d.day,
      date: d.date ?? '',
      fromPlace: d.fromPlace ?? '',
      toPlace: d.toPlace ?? '',
      stops: d.stops ?? '',
    })) as unknown as TourDayPersisted[];
}

/**
 * Turn a reviewed draft into the input the normal creation path expects.
 *
 * Deliberately leaves `price_gel`, `commission` and driver selection alone —
 * those are the company's decisions, not the document's.
 */
export function draftToInsertInput(
  draft: ImportedBookingDraft,
  ctx: { companyUserId: string; companyName: string | null; createdByName?: string | null },
): Partial<InsertBookingInput> {
  return {
    company_id: ctx.companyUserId,
    company_name: ctx.companyName,
    kind: (draft.kind ?? 'transfer') as DbCanonicalKind,
    from_location: draft.from_location,
    to_location: draft.to_location,
    route: draft.route,
    date_display: draft.date_display,
    passengers: draft.passengers ?? 1,
    vehicle_type: draft.vehicle_type,
    vehicle_class: draft.vehicle_class,
    flight_number: draft.flight_number,
    flight_direction: draft.flight_direction,
    pickup_time: draft.pickup_time,
    passenger_name: draft.passenger_name,
    passenger_phone: draft.passenger_phone,
    meet_greet: draft.meet_greet ?? false,
    sign_text: draft.sign_text,
    client_price: draft.client_price,
    payment_method: draft.payment_method,
    comment: draft.comment,
    tour_days: toTourDaysPersisted(draft.tour_days),
    created_by_name: ctx.createdByName ?? null,
  };
}

/** Fields the company must still fill in before this draft can be sent. */
export function missingRequiredFields(draft: ImportedBookingDraft): string[] {
  const missing: string[] = [];
  if (!draft.date_display) missing.push('თარიღი');
  if (!draft.vehicle_type) missing.push('ტრანსპორტის ტიპი');
  if (!draft.passengers || draft.passengers < 1) missing.push('მგზავრების რაოდენობა');
  if (!draft.from_location && !draft.route) missing.push('აყვანის ადგილი');
  return missing;
}
