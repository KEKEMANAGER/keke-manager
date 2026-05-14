import type { FieldSet } from "airtable";
import Airtable from "airtable";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAirtableBase } from "@/lib/airtable/client";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import { fetchVehiclesByDriverRecordIds } from "@/lib/airtable/drivers";
import { linkedRecordIds } from "@/lib/airtable/field-utils";
import {
  uploadDriverDocument,
  DRIVER_DOC_FOLDER,
  VEHICLE_PHOTO_FOLDER,
} from "@/lib/cloudinary";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const AIRTABLE_DRIVER_VEHICLES_FIELD = "Vehicles" as const;

const DRIVER_FIELD_MAP = {
  license: "license_photo",
  id: "id_photo",
  portrait: "portrait_photo",
} as const;

const VEHICLE_FIELD_MAP = {
  vehicle_front: "photo_front",
  vehicle_rear: "photo_rear",
  vehicle_left: "photo_left",
  vehicle_right: "photo_right",
  vehicle_interior: "photo_interior",
} as const;

export type UploadDocType =
  | keyof typeof DRIVER_FIELD_MAP
  | keyof typeof VEHICLE_FIELD_MAP;

const ALL_DOC_TYPES: UploadDocType[] = [
  "license",
  "id",
  "portrait",
  "vehicle_front",
  "vehicle_rear",
  "vehicle_left",
  "vehicle_right",
  "vehicle_interior",
];

function isUploadDocType(v: unknown): v is UploadDocType {
  return typeof v === "string" && (ALL_DOC_TYPES as string[]).includes(v);
}

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function safeApiErrorMessage(error: unknown): string {
  if (error instanceof Airtable.Error) {
    const bits = [
      error.message,
      error.error ? `[${error.error}]` : null,
      error.statusCode ? `HTTP ${error.statusCode}` : null,
    ].filter(Boolean);
    return bits.join(" ");
  }
  if (error instanceof Error) return error.message;
  return "Upload failed.";
}

function isAllowedMimeForDoc(
  docType: UploadDocType,
  mime: string,
  name: string,
): boolean {
  const imageOnly =
    docType === "portrait" || docType.startsWith("vehicle_");
  if (imageOnly) {
    if (mime.startsWith("image/")) return true;
    if (!mime && /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name)) return true;
    return false;
  }
  if (mime.startsWith("image/")) return true;
  if (mime === "application/pdf") return true;
  if (!mime && name.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

async function resolvePrimaryVehicleId(
  driverRecordId: string,
  driverFields: Record<string, unknown>,
): Promise<string | null> {
  const fromLink = linkedRecordIds(driverFields[AIRTABLE_DRIVER_VEHICLES_FIELD])[0];
  if (fromLink) return fromLink;
  const map = await fetchVehiclesByDriverRecordIds([driverRecordId]);
  return map.get(driverRecordId)?.id ?? null;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const docTypeRaw = formData.get("docType");
  const file = formData.get("file");
  if (!isUploadDocType(docTypeRaw)) {
    return NextResponse.json({ error: "Invalid docType." }, { status: 400 });
  }
  const docType = docTypeRaw;
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const name = file instanceof File ? file.name : "upload";
  const mime = file.type || "";
  if (!isAllowedMimeForDoc(docType, mime, name)) {
    return NextResponse.json(
      {
        error:
          docType === "portrait" || docType.startsWith("vehicle_")
            ? "Only image files are allowed for this upload."
            : "Only image/* or application/pdf is allowed.",
      },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }
  if (buf.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 5 MB)." },
      { status: 400 },
    );
  }

  const cloudFolder =
    docType.startsWith("vehicle_") ? VEHICLE_PHOTO_FOLDER : DRIVER_DOC_FOLDER;

  let cloudinarySecureUrl: string;
  try {
    const { secureUrl } = await uploadDriverDocument(buf, {
      mimeType: mime || "application/octet-stream",
      folder: cloudFolder,
    });
    cloudinarySecureUrl = secureUrl;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cloudinary upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const attachment: { url: string; filename?: string } = {
    url: cloudinarySecureUrl,
    filename: name || undefined,
  };

  const base = getAirtableBase();
  const q = escapeFormulaString(userId);
  let driverRows;
  try {
    driverRows = await base(AIRTABLE_TABLES.Drivers)
      .select({ filterByFormula: `{clerk_id} = '${q}'`, maxRecords: 1 })
      .firstPage();
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error) },
      { status: 500 },
    );
  }

  if (!driverRows.length) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  const driverId = driverRows[0].id;
  const driverFields = driverRows[0].fields as Record<string, unknown>;

  if (docType in DRIVER_FIELD_MAP) {
    const field = DRIVER_FIELD_MAP[docType as keyof typeof DRIVER_FIELD_MAP];
    try {
      await base(AIRTABLE_TABLES.Drivers).update(driverId, {
        [field]: [attachment],
      } as unknown as Partial<FieldSet>);
    } catch (error) {
      return NextResponse.json(
        { error: safeApiErrorMessage(error) },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true as const });
  }

  const vehicleId = await resolvePrimaryVehicleId(driverId, driverFields);
  if (!vehicleId) {
    return NextResponse.json(
      { error: "No primary vehicle linked. Save vehicle info first." },
      { status: 404 },
    );
  }

  const field =
    VEHICLE_FIELD_MAP[docType as keyof typeof VEHICLE_FIELD_MAP];
  try {
    await base(AIRTABLE_TABLES.Vehicles).update(vehicleId, {
      [field]: [attachment],
    } as unknown as Partial<FieldSet>);
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true as const });
}
