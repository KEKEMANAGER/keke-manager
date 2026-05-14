import { v2 as cloudinary } from "cloudinary";

export const DRIVER_DOC_FOLDER = "keke-manager/drivers";
export const VEHICLE_PHOTO_FOLDER = "keke-manager/vehicles";
export const COMPANY_LOGO_FOLDER = "keke-manager/companies";

function configureFromEnv(): void {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = process.env.CLOUDINARY_API_KEY?.trim();
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }
  cloudinary.config({ cloud_name, api_key, api_secret });
}

/**
 * Uploads binary to Cloudinary and returns HTTPS URL for Airtable attachments.
 */
export async function uploadDriverDocument(
  buffer: Buffer,
  meta: { mimeType: string; folder?: string },
): Promise<{ secureUrl: string }> {
  configureFromEnv();
  const mime = meta.mimeType || "application/octet-stream";
  const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;
  const folder = meta.folder ?? DRIVER_DOC_FOLDER;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "auto",
    use_filename: true,
    unique_filename: true,
  });
  const secureUrl = result.secure_url;
  if (typeof secureUrl !== "string" || !secureUrl) {
    throw new Error("Cloudinary upload did not return a secure URL.");
  }
  return { secureUrl };
}
