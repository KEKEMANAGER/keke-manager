import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import i18n from '../src/lib/i18n';
import type {
  DbCanonicalKind,
  InsertBookingInput,
  ItineraryDay,
  TourDayPersisted,
  TourTransferLeg,
} from './bookings';
import {
  AIRPORT_OPTIONS,
  isLocationType,
  locationMapLinkIsInvalid,
  locationValueIsComplete,
  persistLocationFields,
  persistLocationLink,
  TRAIN_STATION_OPTIONS,
  type LocationType,
  type LocationValue,
} from './bookingLocations';
import { extractGoogleMapsLink, locationTypeTakesMapLink, mapLinkState } from './googleMapsLink';
import { ensureMediaPermission } from './mediaPermissions';
import { sanitizeLanguageCodes } from './spokenLanguages';
import { supabase } from './supabase';
import { buildTourRouteText, itineraryFromTourDays, tourEndpointsFromDays } from './tourDays';
import { normalizeVehicleClass, normalizeVehicleType } from './vehicleCatalog';

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
  // WhatsApp's "Export chat" on an iPhone is always a zip.
  'application/zip',
  'application/x-zip-compressed',
  // A screenshot saved as a file is still a request — read it as a photo.
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const IMPORT_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.txt', '.csv', '.zip'] as const;

export type ImportFieldSource = 'template' | 'ai' | 'none';

export type ImportedTourDay = {
  day: number;
  date: string | null;
  fromPlace: string | null;
  toPlace: string | null;
  stops: string | null;
  /** Where the group sleeps that night, as the operator wrote it. */
  hotel: string | null;
  /** That hotel's Google Maps link, when the request carried one or the company pasted it. */
  hotel_link?: string | null;
  /** Where the driver sleeps that night — the company's to fill, as on the form. */
  driver_overnight?: string | null;
};

/** One transfer leg of a tour: the arrival that opens it or the departure that closes it. */
export type ImportedLeg = {
  /** ISO instant, like the booking's own date. */
  date_display: string | null;
  /**
   * HH:MM when the leg's clock time was read or set. Null with a date-only
   * start, which is stored at midnight and is not a time anyone asked for.
   */
  pickup_time?: string | null;
  from: string | null;
  from_type?: LocationType | null;
  from_link?: string | null;
  to: string | null;
  to_type?: LocationType | null;
  to_link?: string | null;
  flight: string | null;
  /** A departure's flight time (ISO instant) — context for the pickup, never the pickup. */
  flight_at?: string | null;
};

export type ImportedBookingDraft = {
  kind: DbCanonicalKind | null;
  date_display: string | null;
  from_location: string | null;
  to_location: string | null;
  /** The form's place kind for each end. */
  from_location_type?: LocationType | null;
  to_location_type?: LocationType | null;
  /** Google Maps links, as the form stores them for a hotel or an address. */
  from_location_link?: string | null;
  to_location_link?: string | null;
  route: string | null;
  passengers: number | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  flight_number: string | null;
  flight_direction: 'arrival' | 'departure' | null;
  /** A departure flight's own time (ISO instant). The pickup is `date_display`. */
  flight_at?: string | null;
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
  /**
   * The form's own choices, which no request carries. They start at the form's
   * defaults and the company can change them on the review screen.
   */
  price_includes_fuel?: boolean | null;
  driver_overnight_by?: 'keke' | 'company' | null;
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
    case 'application/zip':
    case 'application/x-zip-compressed':
      return 'chat.zip';
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

/** A file dropped on the page or pasted from the clipboard (browser only), read for sending. */
async function pickedFileFromWebFile(file: File): Promise<PickedFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error(i18n.t('importBooking.fileTooBig'));
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(i18n.t('importBooking.fileReadFailed')));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
  return {
    name: file.name || defaultNameForMime(file.type),
    base64: stripDataUrlPrefix(dataUrl),
    sizeBytes: file.size,
    mimeType: file.type || null,
  };
}

function isPictureFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

/** What a drop or a paste turned into: pictures of a request, or one file. */
export type DroppedInput =
  | { kind: 'photos'; images: PickedImage[] }
  | { kind: 'file'; file: PickedFile };

/**
 * Files dropped on the import screen or pasted into it in a browser — a PDF
 * dragged from the desktop, a screenshot straight from the clipboard. A
 * document wins over pictures and is read on its own; otherwise up to five
 * pictures go together, in order, the same way the gallery sends them.
 */
export async function prepareDroppedFiles(files: File[]): Promise<DroppedInput | null> {
  const list = files.filter((f) => f && f.size > 0);
  if (list.length === 0) return null;

  const docFile = list.find((f) => !isPictureFile(f));
  if (docFile) return { kind: 'file', file: await pickedFileFromWebFile(docFile) };

  const images: PickedImage[] = [];
  for (const picture of list.slice(0, MAX_IMPORT_PHOTOS)) {
    const picked = await pickedFileFromWebFile(picture);
    // Redrawing needs a URL the browser can decode; it is let go straight after.
    const uri = typeof URL !== 'undefined' ? URL.createObjectURL(picture) : '';
    try {
      images.push(await prepareImage({ uri, base64: picked.base64, mimeType: picked.mimeType }));
    } finally {
      if (uri) URL.revokeObjectURL(uri);
    }
  }
  assertPhotoSizes(images);
  return { kind: 'photos', images };
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

// ------------------------------------------------------------------ places

const AIRPORT_PRESETS: [RegExp, string][] = [
  [/tbilisi|tiflis|თბილის|тбилис|\bTBS\b/i, AIRPORT_OPTIONS[0]],
  [/batumi|ბათუმ|батум/i, AIRPORT_OPTIONS[1]],
  [/kutaisi|ქუთაის|кутаис|\bKUT\b/i, AIRPORT_OPTIONS[2]],
];

const STATION_PRESETS: [RegExp, string][] = [
  [/tbilisi|თბილის|тбилис/i, TRAIN_STATION_OPTIONS[0]],
  [/batumi|ბათუმ|батум/i, TRAIN_STATION_OPTIONS[1]],
  [/kutaisi|ქუთაის|кутаис/i, TRAIN_STATION_OPTIONS[2]],
];

/**
 * The form's own name for one of Georgia's airports or stations, so an imported
 * "Tbilisi International Airport" is the same choice the form offers — and reads
 * to the driver exactly like a typed booking.
 */
export function presetPlaceName(type: LocationType | null, name: string): string {
  const presets = type === 'airport' ? AIRPORT_PRESETS : type === 'train_station' ? STATION_PRESETS : null;
  const hit = presets?.find(([re]) => re.test(name));
  return hit ? hit[1] : name;
}

/**
 * A place from the draft, as the form's place picker holds it. A name the reader
 * found always stays in view: with no type the picker would hide it behind
 * "choose a type", so a name without one is shown — and saved — as an address
 * until the company picks otherwise. An empty end starts on the form's own
 * default, like the airport side of a transfer.
 */
export function draftPlace(
  name: string | null | undefined,
  type: string | null | undefined,
  link?: string | null,
  emptyType: LocationType | null = null,
): LocationValue {
  const trimmed = name?.trim() ?? '';
  const kind: LocationType | null = isLocationType(type) ? type : trimmed ? 'address' : emptyType;
  const value: LocationValue = { type: kind, name: trimmed ? presetPlaceName(kind, trimmed) : '' };
  const typedLink = link?.trim();
  if (typedLink && locationTypeTakesMapLink(kind)) value.link = typedLink;
  return value;
}

/** What a place picker writes back into the draft. */
export function placeFields(value: LocationValue): {
  name: string | null;
  type: LocationType | null;
  link: string | null;
} {
  return {
    name: value.name.trim() || null,
    type: value.type,
    link: locationTypeTakesMapLink(value.type) ? value.link?.trim() || null : null,
  };
}

/** The form's starting type for each end: the airport side of an arrival or a departure. */
export function transferEndDefaults(direction: ImportedBookingDraft['flight_direction']): {
  from: LocationType | null;
  to: LocationType | null;
} {
  if (direction === 'arrival') return { from: 'airport', to: null };
  if (direction === 'departure') return { from: null, to: 'airport' };
  return { from: null, to: null };
}

/** A transfer's two ends, as the picker shows them. */
export function transferPlaces(draft: ImportedBookingDraft): { from: LocationValue; to: LocationValue } {
  const defaults = transferEndDefaults(draft.flight_direction);
  return {
    from: draftPlace(draft.from_location, draft.from_location_type, draft.from_location_link, defaults.from),
    to: draftPlace(draft.to_location, draft.to_location_type, draft.to_location_link, defaults.to),
  };
}

/** A tour leg's two ends: an arrival comes from the airport, a departure goes to it. */
export function legPlaces(
  leg: ImportedLeg,
  key: 'transfer_in' | 'transfer_out',
): { from: LocationValue; to: LocationValue } {
  return {
    from: draftPlace(leg.from, leg.from_type, leg.from_link, key === 'transfer_in' ? 'airport' : null),
    to: draftPlace(leg.to, leg.to_type, leg.to_link, key === 'transfer_out' ? 'airport' : null),
  };
}

// ------------------------------------------------------------------- times

function isTbilisiMidnight(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const local = new Date(t + 4 * 3600 * 1000);
  return local.getUTCHours() === 0 && local.getUTCMinutes() === 0;
}

/**
 * A date read without its clock time. The reader stores such a date at
 * midnight in Tbilisi, which no one asked for; a time the company set — even a
 * real 00:00 — comes with `pickupTime`.
 */
export function draftTimeMissing(iso: string | null | undefined, pickupTime: string | null | undefined): boolean {
  return !!iso && !pickupTime && isTbilisiMidnight(iso);
}

export function clockOf(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "01:30", or "01:30 (28.10)" when the flight is not on the pickup's own day. */
export function flightTimeLabel(flightAt: string, pickupIso: string | null | undefined): string {
  const f = new Date(Date.parse(flightAt));
  if (Number.isNaN(f.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = clockOf(f);
  const p = pickupIso ? new Date(Date.parse(pickupIso)) : null;
  const sameDay =
    !!p &&
    !Number.isNaN(p.getTime()) &&
    p.getFullYear() === f.getFullYear() &&
    p.getMonth() === f.getMonth() &&
    p.getDate() === f.getDate();
  return sameDay ? time : `${time} (${pad(f.getDate())}.${pad(f.getMonth() + 1)})`;
}

/**
 * A departure's pickup against its flight. After the flight is impossible — a
 * 01:30 flight with the pickup put on the same calendar day at 22:30 is the
 * classic slip. Half a day early is possible, but worth a second look.
 */
export function pickupFlightProblem(
  pickupIso: string | null | undefined,
  flightAt: string | null | undefined,
): 'after' | 'early' | null {
  if (!pickupIso || !flightAt) return null;
  const p = Date.parse(pickupIso);
  const f = Date.parse(flightAt);
  if (!Number.isFinite(p) || !Number.isFinite(f)) return null;
  if (p >= f) return 'after';
  if (f - p > 12 * 3600 * 1000) return 'early';
  return null;
}

/** The line a departure's flight time leaves in the booking, so the driver sees it. */
function flightNote(flightAt: string | null | undefined, pickupIso: string | null | undefined): string | null {
  if (!flightAt) return null;
  const when = flightTimeLabel(flightAt, pickupIso);
  return when ? i18n.t('importBooking.flightAtNote', { time: when }) : null;
}

// --------------------------------------------------------------- the booking

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
  return sorted.map((d, i) => {
    const hotel = d.hotel?.trim();
    const hotelLink = hotel ? extractGoogleMapsLink(d.hotel_link) : null;
    const overnight = d.driver_overnight?.trim();
    return {
      day: i + 1,
      date: d.date ?? '',
      fromPlace: d.fromPlace?.trim() ?? '',
      toPlace: d.toPlace?.trim() ?? '',
      stops: d.stops?.trim() ?? '',
      ...(i < last && hotel ? { touristHotel: hotel } : {}),
      ...(i < last && hotelLink ? { touristHotelLink: hotelLink } : {}),
      ...(i < last && overnight ? { driverOvernight: overnight } : {}),
    };
  });
}

/**
 * An arrival goes airport -> hotel, a departure hotel -> airport, stored with
 * their types and links exactly as the form stores them. A departure's flight
 * time rides on its flight line, where the driver looks for it.
 */
function toLegDb(leg: ImportedLeg | null | undefined, key: 'transfer_in' | 'transfer_out'): TourTransferLeg | null {
  if (!leg?.date_display) return null;
  const { from, to } = legPlaces(leg, key);
  const [airportEnd, hotelEnd] = key === 'transfer_in' ? [from, to] : [to, from];
  const airport = persistLocationFields(airportEnd);
  const hotel = persistLocationFields(hotelEnd);
  const airportLink = persistLocationLink(airportEnd);
  const hotelLink = persistLocationLink(hotelEnd);
  const flight = [leg.flight?.trim(), key === 'transfer_out' ? flightNote(leg.flight_at, leg.date_display) : null]
    .filter(Boolean)
    .join(' · ');
  return {
    date: leg.date_display,
    ...(airport.name ? { airport: airport.name, airport_type: airport.type } : {}),
    ...(hotel.name ? { hotel: hotel.name, hotel_type: hotel.type } : {}),
    ...(airportLink ? { airport_link: airportLink } : {}),
    ...(hotelLink ? { hotel_link: hotelLink } : {}),
    ...(flight ? { flight } : {}),
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

function dayLine(day: number, from: string, to: string): string {
  return i18n.t('newBooking.dayLine', { day, from, to });
}

/** Nights in a tour, as the form counts them: one fewer than its days. */
export function tourNights(draft: ImportedBookingDraft): number {
  return Math.max(0, (draft.tour_days?.length ?? 0) - 1);
}

/**
 * Turn a reviewed draft into the input the normal creation path expects —
 * field for field what the new-booking form sends for the same booking, so a
 * driver, a voucher and every report treat an imported booking exactly like a
 * typed one.
 *
 *  - a transfer: both ends with their types and map links, arrival or
 *    departure, the pickup as its date and time, the flight;
 *  - a day tour: one itinerary day (from, to, the places visited) and the
 *    route line built from it, as the form builds it;
 *  - a tour: its days, itinerary, start and end, the arrival and departure
 *    legs with their types and links.
 *
 * The price offered is the price entered, as on the form. Driver selection
 * stays the company's, as does who is booking it (`createdByName`).
 */
export function draftToInsertInput(
  draft: ImportedBookingDraft,
  ctx: { companyUserId: string; companyName: string | null; createdByName?: string | null },
): InsertBookingInput {
  const kind = (draft.kind ?? 'transfer') as DbCanonicalKind;
  const isTour = kind === 'tour';
  const isDayTour = kind === 'day_tour';
  const isTransfer = !isTour && !isDayTour;
  const languages = sanitizeLanguageCodes(draft.required_languages ?? []);
  const price = draft.client_price != null && draft.client_price > 0 ? draft.client_price : 0;
  const comment = draft.comment?.trim() || null;

  let from: { name: string | null; type: string | null; link: string | null } = { name: null, type: null, link: null };
  let to: { name: string | null; type: string | null; link: string | null } = { name: null, type: null, link: null };
  let route: string | null = null;
  let days: TourDayPersisted[] | null = null;
  let itinerary: ItineraryDay[] | null = null;
  let dateDisplay = draft.date_display;
  let bookingComment = comment;

  if (isTransfer) {
    const places = transferPlaces(draft);
    from = { ...persistLocationFields(places.from), link: persistLocationLink(places.from) };
    to = { ...persistLocationFields(places.to), link: persistLocationLink(places.to) };
    // The flight's own time, which has no column of its own, is kept where the
    // driver reads it.
    const note = draft.flight_direction !== 'arrival' ? flightNote(draft.flight_at, draft.date_display) : null;
    bookingComment = [note, comment].filter(Boolean).join('\n') || null;
  } else if (isDayTour) {
    const start = draft.from_location?.trim() ?? '';
    const end = draft.to_location?.trim() ?? '';
    const places = draft.route?.trim() ?? '';
    itinerary = [{ day: 1, from: start, to: end, stops: places }];
    from = { name: start || null, type: null, link: null };
    to = { name: end || null, type: null, link: null };
    const line = start || end ? dayLine(1, start || '—', end || '—') : null;
    route = [places, line].filter(Boolean).join('\n\n') || null;
  } else {
    days = toTourDaysPersisted(draft.tour_days);
    itinerary = days ? itineraryFromTourDays(days) : null;
    const ends = days ? tourEndpointsFromDays(days) : { from: null, to: null };
    from = { name: ends.from ?? draft.from_location ?? null, type: null, link: null };
    to = { name: ends.to ?? draft.to_location ?? null, type: null, link: null };
    route = draft.route?.trim() || (days ? buildTourRouteText(days, dayLine) : null);
    dateDisplay = tourStartIso(draft, days);
  }

  const meetGreet = draft.meet_greet === true;

  return {
    company_id: ctx.companyUserId,
    company_name: ctx.companyName,
    kind,
    from_location: from.name,
    from_location_type: from.type,
    from_location_link: from.link,
    to_location: to.name,
    to_location_type: to.type,
    to_location_link: to.link,
    route,
    date_display: dateDisplay,
    passengers: draft.passengers != null && draft.passengers > 0 ? draft.passengers : 1,
    vehicle_type: draft.vehicle_type,
    vehicle_class: draft.vehicle_class ?? 'comfort',
    flight_number: draft.flight_number?.trim() || null,
    flight_direction: isTransfer ? draft.flight_direction : null,
    pickup_time: draft.pickup_time,
    passenger_name: draft.passenger_name?.trim() || null,
    passenger_phone: draft.passenger_phone?.trim() || null,
    meet_greet: meetGreet,
    sign_text: meetGreet ? draft.sign_text?.trim() || null : null,
    hotel: draft.hotel?.trim() || null,
    client_price: price,
    price_gel: price,
    commission: null,
    price_includes_fuel: isTransfer ? null : draft.price_includes_fuel ?? true,
    driver_overnight_by: isTour && tourNights(draft) > 0 ? draft.driver_overnight_by ?? 'keke' : null,
    // The company pays either way and the driver's IBAN is on the voucher —
    // the form stopped asking, and so does this.
    payment_method: null,
    comment: bookingComment,
    tour_days: days,
    itinerary,
    transfer_in: isTour ? toLegDb(draft.transfer_in, 'transfer_in') : null,
    transfer_out: isTour ? toLegDb(draft.transfer_out, 'transfer_out') : null,
    required_languages: languages.length > 0 ? languages : null,
    created_by_name: ctx.createdByName ?? null,
  };
}

/** A pasted link that is not a Google Maps one would send the driver nowhere. */
function mapLinksInvalid(draft: ImportedBookingDraft): boolean {
  const places: LocationValue[] = [];
  if ((draft.kind ?? 'transfer') === 'transfer') {
    const t = transferPlaces(draft);
    places.push(t.from, t.to);
  }
  if (draft.kind === 'tour') {
    for (const key of ['transfer_in', 'transfer_out'] as const) {
      const leg = draft[key];
      if (!leg) continue;
      const p = legPlaces(leg, key);
      places.push(p.from, p.to);
    }
    const days = draft.tour_days ?? [];
    if (days.some((d, i) => i < days.length - 1 && mapLinkState(d.hotel_link) === 'invalid')) return true;
  }
  return places.some((p) => locationMapLinkIsInvalid(p));
}

/**
 * What the company must still fill in before this draft can be sent — the
 * booking form's own rules, in the form's own words, plus the two checks only
 * a read request needs: a date that came without its time, and a departure
 * pickup put after its flight.
 */
export function missingRequiredFields(draft: ImportedBookingDraft): string[] {
  const t = (key: string) => i18n.t(key);
  const missing: string[] = [];
  const kind = draft.kind ?? 'transfer';
  const days = draft.tour_days ?? [];

  if (kind === 'tour') {
    if (!draft.date_display && !days.some((d) => d.date)) missing.push(t('newBooking.validation.tourDates'));
    if (days.length === 0 || !days.some((d) => d.fromPlace?.trim())) missing.push(t('newBooking.validation.tourDays'));
    if (days.some((d) => !d.date)) missing.push(t('importBooking.missing.dayDate'));
    for (const key of ['transfer_in', 'transfer_out'] as const) {
      const leg = draft[key];
      if (!leg) continue;
      const name = t(key === 'transfer_in' ? 'newBooking.form.transferArrivalSection' : 'newBooking.form.transferDepartureSection');
      if (!leg.date_display) missing.push(`${name}: ${t('newBooking.validation.dateTime')}`);
      else if (draftTimeMissing(leg.date_display, leg.pickup_time)) missing.push(`${name}: ${t('importBooking.missing.time')}`);
      const places = legPlaces(leg, key);
      if (!locationValueIsComplete(places.from)) missing.push(`${name}: ${t('newBooking.validation.locationFrom')}`);
      if (!locationValueIsComplete(places.to)) missing.push(`${name}: ${t('newBooking.validation.locationTo')}`);
      if (key === 'transfer_out' && pickupFlightProblem(leg.date_display, leg.flight_at) === 'after') {
        missing.push(`${name}: ${t('importBooking.missing.pickupAfterFlight')}`);
      }
    }
  } else {
    if (!draft.date_display) missing.push(t('newBooking.validation.dateTime'));
    else if (draftTimeMissing(draft.date_display, draft.pickup_time)) missing.push(t('importBooking.missing.time'));
    if (kind === 'transfer') {
      const places = transferPlaces(draft);
      if (!locationValueIsComplete(places.from)) missing.push(t('newBooking.validation.locationFrom'));
      if (!locationValueIsComplete(places.to)) missing.push(t('newBooking.validation.locationTo'));
      if (draft.flight_direction !== 'arrival' && pickupFlightProblem(draft.date_display, draft.flight_at) === 'after') {
        missing.push(t('importBooking.missing.pickupAfterFlight'));
      }
    } else if (!draft.route?.trim() && !draft.from_location?.trim()) {
      missing.push(t('newBooking.validation.tourRoute'));
    }
  }

  if (!normalizeVehicleType(draft.vehicle_type)) missing.push(t('newBooking.validation.vehicleType'));
  if (!normalizeVehicleClass(draft.vehicle_class)) missing.push(t('newBooking.validation.vehicleClass'));
  if (!draft.passengers || draft.passengers < 1) missing.push(t('newBooking.validation.passengers'));
  if (!(draft.client_price != null && draft.client_price > 0)) missing.push(t('newBooking.validation.offeredPrice'));
  if (mapLinksInvalid(draft)) missing.push(t('newBooking.validation.mapLink'));
  return missing;
}

/**
 * A freshly read draft with the form's own defaults where the request said
 * nothing: comfort class, fuel included, KEKE arranging the driver's nights.
 * The company sees and can change every one of them before sending.
 */
export function withFormDefaults(draft: ImportedBookingDraft): ImportedBookingDraft {
  const kind = draft.kind ?? 'transfer';
  return {
    ...draft,
    vehicle_class: normalizeVehicleClass(draft.vehicle_class) ?? 'comfort',
    price_includes_fuel: kind === 'transfer' ? null : draft.price_includes_fuel ?? true,
    driver_overnight_by: kind === 'tour' ? draft.driver_overnight_by ?? 'keke' : null,
  };
}
