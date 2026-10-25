import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import i18n from '../src/lib/i18n';
import type {
  DbCanonicalKind,
  InsertBookingInput,
  TourDayPersisted,
  TourTransferLeg,
} from './bookings';
import { ensureMediaPermission } from './mediaPermissions';
import { sanitizeLanguageCodes } from './spokenLanguages';
import { supabase } from './supabase';
import { buildTourRouteText, itineraryFromTourDays, tourEndpointsFromDays } from './tourDays';

/**
 * Booking intake: a pasted message, screenshots or photos, or a file.
 *
 * Whatever the company has goes to the `booking-import` edge function. Text is
 * read with a deterministic template parser first and the model fills what the
 * template could not find; a picture is read by the model. What comes back is a
 * DRAFT — it is never written anywhere. The company reviews it on screen and the
 * ordinary booking creation path does the rest, so every existing validation
 * still applies.
 */

export const IMPORT_MIME_TYPES = [
  'application/pdf', // .pdf
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
  'text/csv',
  // A screenshot saved as a file is still a request — read it as a photo.
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const IMPORT_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.txt', '.csv'] as const;

export type ImportFieldSource = 'template' | 'ai' | 'none';

export type ImportedTourDay = {
  day: number;
  date: string | null;
  fromPlace: string | null;
  toPlace: string | null;
  stops: string | null;
  /** Where the group sleeps that night, as the operator wrote it. */
  hotel: string | null;
};

/** One transfer leg of a tour: the arrival that opens it or the departure that closes it. */
export type ImportedLeg = {
  /** ISO instant, like the booking's own date. */
  date_display: string | null;
  from: string | null;
  to: string | null;
  flight: string | null;
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
  /** Hotel the group stays at / is collected from. */
  hotel: string | null;
  tour_days: ImportedTourDay[] | null;
  /** A tour's arrival transfer — part of the same booking, not a booking of its own. */
  transfer_in?: ImportedLeg | null;
  /** A tour's departure transfer. */
  transfer_out?: ImportedLeg | null;
  /** Languages the driver must speak. */
  required_languages?: string[] | null;
};

/**
 * One service out of a document. A tour operator's file is usually a whole
 * programme — an arrival transfer, sightseeing days, a departure transfer — so
 * the importer returns a list, and a single-booking file is simply a list of one.
 */
export type ImportedService = {
  draft: ImportedBookingDraft;
  sources: Partial<Record<keyof ImportedBookingDraft, ImportFieldSource>>;
  warnings: string[];
  /**
   * The document's own wording for each field the model read, so the company can
   * check the reading without reopening the file. Keyed by the tool's field
   * names, which mostly match the draft's — `date` and `time` are the exceptions.
   */
  evidence?: Record<string, string> | null;
};

export type BookingImportResult = {
  ok: true;
  draft: ImportedBookingDraft;
  sources: Partial<Record<keyof ImportedBookingDraft, ImportFieldSource>>;
  warnings: string[];
  usedAi: boolean;
  /** Every service found in the document, in order. Always at least one. */
  services?: ImportedService[];
  fileName: string;
  textPreview: string;
};

export type BookingImportFailure = { ok: false; error: string };

export type PickedFile = {
  name: string;
  base64: string;
  sizeBytes: number;
  mimeType?: string | null;
  uri?: string;
};

/** One photo or screenshot, ready to send. */
export type PickedImage = { base64: string; mimeType: string | null };

export type PhotoSource = 'library' | 'camera';

/** Screenshots at once — enough for a long chat, few enough to read quickly. */
export const MAX_IMPORT_PHOTOS = 5;

/**
 * 8 MB of actual file. A typed booking sheet is a few kilobytes, but an
 * operator's PDF often carries a scanned page, a logo and a map, and a file
 * the company cannot send is worse than a slow upload.
 */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Per photo after encoding. The reader takes 10 MB, the server stops at 9.5. */
const MAX_PHOTO_BASE64_CHARS = 9_000_000;
const MAX_PHOTOS_TOTAL_BASE64_CHARS = 19_000_000;

/** The reader looks at about 1,600 px anyway; more is only a slower upload. */
const WEB_MAX_EDGE = 2400;
const WEB_SENDABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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
    reader.onerror = () => reject(new Error(i18n.t('importBooking.fileReadFailed')));
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
    throw new Error(i18n.t('importBooking.fileTooBig'));
  }

  const base64 = await readAsBase64(asset.uri);
  return {
    // The server picks its reader from the extension, so a nameless pick must
    // still carry the right one — guessing .docx for a PDF would fail the read.
    name: asset.name || defaultNameForMime(asset.mimeType),
    base64,
    sizeBytes: size || Math.floor((base64.length * 3) / 4),
    mimeType: asset.mimeType ?? null,
    uri: asset.uri,
  };
}

function defaultNameForMime(mimeType?: string | null): string {
  switch (mimeType) {
    case 'application/pdf':
      return 'booking.pdf';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'booking.xlsx';
    case 'text/csv':
      return 'booking.csv';
    case 'text/plain':
      return 'booking.txt';
    case 'image/jpeg':
      return 'booking.jpg';
    case 'image/png':
      return 'booking.png';
    case 'image/webp':
      return 'booking.webp';
    default:
      return 'booking.docx';
  }
}

function isImageFile(file: PickedFile): boolean {
  if (file.mimeType?.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

/**
 * Redraw a picture in the browser as a JPEG no longer than WEB_MAX_EDGE on its
 * long side. That shrinks a camera-sized photo to a quick upload and turns a
 * format the reader cannot open (an iPhone's HEIC, in Safari) into one it can.
 * Null when the browser cannot decode the picture itself.
 */
async function redrawOnCanvas(uri: string): Promise<PickedImage | null> {
  if (typeof document === 'undefined') return null;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = document.createElement('img');
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode'));
    el.src = uri;
  });
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const scale = Math.min(1, WEB_MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // A transparent screenshot would otherwise turn black as a JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { base64: stripDataUrlPrefix(canvas.toDataURL('image/jpeg', 0.85)), mimeType: 'image/jpeg' };
}

/**
 * A picture as it should be sent. On a phone the picker has already
 * compressed it. In a browser it arrives exactly as saved, so anything large
 * or in an unreadable format is redrawn first; an ordinary screenshot goes as is.
 */
async function prepareImage(params: {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
}): Promise<PickedImage> {
  const base64 = params.base64 ? stripDataUrlPrefix(params.base64) : await readAsBase64(params.uri);
  const mimeType = params.mimeType ?? null;
  if (Platform.OS !== 'web') return { base64, mimeType };

  const sendable = mimeType ? WEB_SENDABLE_TYPES.has(mimeType) : true;
  const longEdge = Math.max(params.width ?? 0, params.height ?? 0);
  if (sendable && base64.length <= 4_000_000 && longEdge <= WEB_MAX_EDGE * 1.2) {
    return { base64, mimeType };
  }
  const redrawn = await redrawOnCanvas(params.uri).catch(() => null);
  return redrawn ?? { base64, mimeType };
}

function assertPhotoSizes(images: PickedImage[]): void {
  let total = 0;
  for (const image of images) {
    total += image.base64.length;
    if (image.base64.length > MAX_PHOTO_BASE64_CHARS || total > MAX_PHOTOS_TOTAL_BASE64_CHARS) {
      throw new Error(i18n.t('importBooking.photoTooBig'));
    }
  }
}

/**
 * Screenshots from the gallery (up to five, in the order chosen) or one photo
 * from the camera. Returns null when the user cancels.
 *
 * The gallery needs no permission prompt — the system picker runs outside the
 * app — so only the camera asks.
 */
export async function pickBookingPhotos(source: PhotoSource): Promise<PickedImage[] | null> {
  if (source === 'camera') {
    const outcome = await ensureMediaPermission('camera', i18n.t('importBooking.cameraPermissionTitle'));
    // Permanently refused: the helper has already offered the Settings screen.
    if (outcome === 'denied_permanently') return null;
    if (outcome !== 'granted') throw new Error(i18n.t('importBooking.cameraDenied'));
  }

  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          base64: true,
          exif: false,
          // A page photographed at 60% still reads perfectly, and uploads in seconds.
          quality: 0.6,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          base64: true,
          exif: false,
          quality: 0.8,
          allowsMultipleSelection: true,
          selectionLimit: MAX_IMPORT_PHOTOS,
          orderedSelection: true,
          // iPhone photos are HEIC, which the reader cannot open; this hands over a JPEG.
          preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });

  if (res.canceled || !res.assets?.length) return null;

  const images: PickedImage[] = [];
  for (const asset of res.assets.slice(0, MAX_IMPORT_PHOTOS)) {
    images.push(
      await prepareImage({
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      }),
    );
  }
  assertPhotoSizes(images);
  return images;
}

/**
 * supabase-js answers a 4xx/5xx with the raw Response in `error.context`; the
 * function always puts a readable message in its body, so read it from there
 * rather than showing "Edge Function returned a non-2xx status code".
 */
async function functionErrorMessage(error: unknown): Promise<string> {
  const err = error as { name?: string; message?: string; context?: unknown };
  const ctx = err.context as { json?: () => Promise<unknown>; body?: unknown } | undefined;

  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: unknown };
      if (typeof body?.error === 'string' && body.error.trim()) return body.error;
    } catch {
      /* not JSON — fall through */
    }
  } else if (typeof ctx?.body === 'string') {
    try {
      const parsed = JSON.parse(ctx.body) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
    } catch {
      /* fall through */
    }
  }

  if (err.name === 'FunctionsFetchError') return i18n.t('importBooking.networkError');
  return i18n.t('importBooking.readFailedGeneric');
}

async function invokeImport(
  body: Record<string, unknown>,
): Promise<BookingImportResult | BookingImportFailure> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.functions.invoke('booking-import', { body }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : i18n.t('importBooking.networkError') };
  }

  if (error) return { ok: false, error: await functionErrorMessage(error) };

  if (!data || (data as { ok?: boolean }).ok !== true) {
    return {
      ok: false,
      error: (data as { error?: string })?.error || i18n.t('importBooking.readFailedGeneric'),
    };
  }

  const result = data as BookingImportResult;
  // An older deployment of the function answers without `services`. Treat that
  // as a programme of one so every caller can use the same shape.
  if (!Array.isArray(result.services) || result.services.length === 0) {
    result.services = [
      {
        draft: result.draft,
        sources: result.sources,
        warnings: result.warnings ?? [],
        evidence: null,
      },
    ];
  }
  return result;
}

export function parseBookingFile(
  file: PickedFile,
): Promise<BookingImportResult | BookingImportFailure> {
  return invokeImport({ fileName: file.name, contentBase64: file.base64 });
}

/** A message pasted from WhatsApp, Viber, Telegram or an email. */
export function parseBookingText(text: string): Promise<BookingImportResult | BookingImportFailure> {
  return invokeImport({ text });
}

/** Screenshots or photos of one request, in order. */
export function parseBookingPhotos(
  images: PickedImage[],
): Promise<BookingImportResult | BookingImportFailure> {
  return invokeImport({
    images: images.map((image) => ({ base64: image.base64, mimeType: image.mimeType })),
  });
}

/** Pick and parse in one step. Returns null when the user cancels. */
export async function importBookingFromPhotos(
  source: PhotoSource,
): Promise<BookingImportResult | BookingImportFailure | null> {
  let images: PickedImage[] | null;
  try {
    images = await pickBookingPhotos(source);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!images) return null;
  return parseBookingPhotos(images);
}

/**
 * Pick and parse in one step. Returns null when the user cancels.
 * `onPicked` fires once the file is chosen, before the slow read starts.
 */
export async function importBookingFromFile(
  onPicked?: (file: PickedFile) => void,
): Promise<BookingImportResult | BookingImportFailure | null> {
  let file: PickedFile | null;
  try {
    file = await pickBookingFile();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!file) return null;
  onPicked?.(file);

  // A screenshot picked as a file goes the photo way, shrunk in a browser.
  if (isImageFile(file)) {
    try {
      const image = await prepareImage({ uri: file.uri ?? '', base64: file.base64, mimeType: file.mimeType });
      assertPhotoSizes([image]);
      return parseBookingPhotos([image]);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return parseBookingFile(file);
}

/**
 * The tour's days as the booking form stores them: numbered from one, in date
 * order, and — like the form — no tourists' hotel on the last day, which ends
 * with the departure rather than a night.
 */
function toTourDaysPersisted(days: ImportedTourDay[] | null | undefined): TourDayPersisted[] | null {
  if (!days?.length) return null;
  const sorted = days
    .slice()
    .sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.day - b.day));
  const last = sorted.length - 1;
  return sorted.map((d, i) => ({
    day: i + 1,
    date: d.date ?? '',
    fromPlace: d.fromPlace?.trim() ?? '',
    toPlace: d.toPlace?.trim() ?? '',
    stops: d.stops?.trim() ?? '',
    ...(i < last && d.hotel?.trim() ? { touristHotel: d.hotel.trim() } : {}),
  }));
}

/** An arrival goes airport -> hotel, a departure hotel -> airport, as the form stores them. */
function toLegDb(leg: ImportedLeg | null | undefined, direction: 'in' | 'out'): TourTransferLeg | null {
  if (!leg?.date_display) return null;
  const start = leg.from?.trim() || undefined;
  const end = leg.to?.trim() || undefined;
  return {
    date: leg.date_display,
    ...(direction === 'in' ? { airport: start, hotel: end } : { hotel: start, airport: end }),
    ...(leg.flight?.trim() ? { flight: leg.flight.trim() } : {}),
  };
}

/** A tour begins on its first day; failing that, with its arrival or departure. */
function tourStartIso(draft: ImportedBookingDraft, days: TourDayPersisted[] | null): string | null {
  if (draft.date_display) return draft.date_display;
  const firstDate = days?.find((d) => d.date)?.date;
  if (firstDate) {
    // Midnight in Tbilisi, as a date-only start is everywhere else in the app.
    const t = Date.parse(`${firstDate}T00:00:00+04:00`);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return draft.transfer_in?.date_display ?? draft.transfer_out?.date_display ?? null;
}

/**
 * Turn a reviewed draft into the input the normal creation path expects.
 *
 * A tour is built the way the new-booking form builds one — days, itinerary,
 * route line, start and end, arrival and departure legs — so the driver's day
 * screens and navigation treat an imported tour exactly like a typed one.
 *
 * Deliberately leaves `price_gel`, `commission` and driver selection alone —
 * those are the company's decisions, not the document's.
 */
export function draftToInsertInput(
  draft: ImportedBookingDraft,
  ctx: { companyUserId: string; companyName: string | null; createdByName?: string | null },
): Partial<InsertBookingInput> {
  const kind = (draft.kind ?? 'transfer') as DbCanonicalKind;
  const isTour = kind === 'tour';
  const days = isTour ? toTourDaysPersisted(draft.tour_days) : null;
  const ends = days ? tourEndpointsFromDays(days) : { from: null, to: null };
  const dayRoute = days
    ? buildTourRouteText(days, (day, from, to) => i18n.t('newBooking.dayLine', { day, from, to }))
    : null;
  const languages = sanitizeLanguageCodes(draft.required_languages ?? []);

  return {
    company_id: ctx.companyUserId,
    company_name: ctx.companyName,
    kind,
    from_location: isTour ? ends.from ?? draft.from_location : draft.from_location,
    to_location: isTour ? ends.to ?? draft.to_location : draft.to_location,
    route: draft.route ?? dayRoute,
    date_display: isTour ? tourStartIso(draft, days) : draft.date_display,
    passengers: draft.passengers ?? 1,
    vehicle_type: draft.vehicle_type,
    vehicle_class: draft.vehicle_class,
    flight_number: draft.flight_number,
    flight_direction: isTour ? null : draft.flight_direction,
    pickup_time: draft.pickup_time,
    passenger_name: draft.passenger_name,
    passenger_phone: draft.passenger_phone,
    meet_greet: draft.meet_greet ?? false,
    sign_text: draft.sign_text,
    hotel: draft.hotel,
    client_price: draft.client_price,
    payment_method: draft.payment_method,
    comment: draft.comment,
    tour_days: days,
    itinerary: days ? itineraryFromTourDays(days) : null,
    transfer_in: isTour ? toLegDb(draft.transfer_in, 'in') : null,
    transfer_out: isTour ? toLegDb(draft.transfer_out, 'out') : null,
    required_languages: languages.length > 0 ? languages : null,
    created_by_name: ctx.createdByName ?? null,
  };
}

/** Fields the company must still fill in before this draft can be sent. */
export function missingRequiredFields(draft: ImportedBookingDraft): string[] {
  const missing: string[] = [];
  const isTour = draft.kind === 'tour';
  const days = draft.tour_days ?? [];
  if (!draft.date_display && !(isTour && days.some((d) => d.date))) missing.push('თარიღი');
  if (!draft.vehicle_type) missing.push('ტრანსპორტის ტიპი');
  if (!draft.passengers || draft.passengers < 1) missing.push('მგზავრების რაოდენობა');
  if (isTour) {
    if (days.length === 0) missing.push('ტურის დღეები');
    if (days.some((d) => !d.date)) missing.push('ტურის დღის თარიღი');
    if (draft.transfer_in && !draft.transfer_in.date_display) missing.push('ჩამოსვლის ტრანსფერის თარიღი');
    if (draft.transfer_out && !draft.transfer_out.date_display) missing.push('გაცილების ტრანსფერის თარიღი');
  } else if (!draft.from_location && !draft.route) {
    missing.push('აყვანის ადგილი');
  }
  return missing;
}
