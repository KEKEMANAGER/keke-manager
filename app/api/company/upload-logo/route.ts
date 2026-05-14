import type { FieldSet } from "airtable";
import Airtable from "airtable";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAirtableBase } from "@/lib/airtable/client";
import { AIRTABLE_TABLES } from "@/lib/airtable/tables";
import {
  COMPANY_AIRTABLE_FIELDS,
  getCompanyProfile,
} from "@/lib/airtable/company-profile";
import { uploadDriverDocument, COMPANY_LOGO_FOLDER } from "@/lib/cloudinary";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

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

function isImageMime(mime: string, name: string): boolean {
  if (mime.startsWith("image/")) return true;
  if (!mime && /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name)) return true;
  return false;
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

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const name = file instanceof File ? file.name : "logo";
  const mime = file.type || "";
  if (!isImageMime(mime, name)) {
    return NextResponse.json(
      { error: "Only image files are allowed for the logo." },
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

  const profile = await getCompanyProfile(userId);
  if (!profile) {
    return NextResponse.json(
      { error: "Tourism company not linked to this user." },
      { status: 404 },
    );
  }

  let logoUrl: string;
  try {
    const { secureUrl } = await uploadDriverDocument(buf, {
      mimeType: mime || "application/octet-stream",
      folder: COMPANY_LOGO_FOLDER,
    });
    logoUrl = secureUrl;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cloudinary upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const attachment = { url: logoUrl, filename: name || "logo" };
  const base = getAirtableBase();
  try {
    await base(AIRTABLE_TABLES.TourismCompanies).update(
      profile.id,
      {
        [COMPANY_AIRTABLE_FIELDS.logo]: [attachment],
      } as unknown as Partial<FieldSet>,
    );
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, logoUrl });
}
