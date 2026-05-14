"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { VehicleClass } from "@/types/airtable";
import {
  VEHICLE_CLASS_LABELS,
  VEHICLE_CLASS_ORDER,
} from "@/lib/vehicle-class-labels";
import { DRIVER_LANGUAGE_FORM_OPTIONS } from "@/lib/driver-airtable-languages";

export type DriverUploadDocType =
  | "license"
  | "id"
  | "portrait"
  | "vehicle_front"
  | "vehicle_rear"
  | "vehicle_left"
  | "vehicle_right"
  | "vehicle_interior";

export type DriverEditFormProps = {
  initialName: string;
  initialMakeModel: string;
  initialLicensePlate: string;
  initialCategory: VehicleClass;
  initialYear: number;
  initialColor: string;
  initialBio: string;
  initialLanguages: string[];
  initialHasLicensePhoto: boolean;
  initialHasIdPhoto: boolean;
  initialHasPortraitPhoto: boolean;
  initialHasVehiclePhotoFront: boolean;
  initialHasVehiclePhotoRear: boolean;
  initialHasVehiclePhotoLeft: boolean;
  initialHasVehiclePhotoRight: boolean;
  initialHasVehiclePhotoInterior: boolean;
};

export function DriverEditForm({
  initialName,
  initialMakeModel,
  initialLicensePlate,
  initialCategory,
  initialYear,
  initialColor,
  initialBio,
  initialLanguages,
  initialHasLicensePhoto,
  initialHasIdPhoto,
  initialHasPortraitPhoto,
  initialHasVehiclePhotoFront,
  initialHasVehiclePhotoRear,
  initialHasVehiclePhotoLeft,
  initialHasVehiclePhotoRight,
  initialHasVehiclePhotoInterior,
}: DriverEditFormProps) {
  const router = useRouter();
  const licenseFileRef = useRef<HTMLInputElement>(null);
  const idFileRef = useRef<HTMLInputElement>(null);
  const portraitFileRef = useRef<HTMLInputElement>(null);
  const vehicleFrontRef = useRef<HTMLInputElement>(null);
  const vehicleRearRef = useRef<HTMLInputElement>(null);
  const vehicleLeftRef = useRef<HTMLInputElement>(null);
  const vehicleRightRef = useRef<HTMLInputElement>(null);
  const vehicleInteriorRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialName);
  const [makeModel, setMakeModel] = useState(initialMakeModel);
  const [licensePlate, setLicensePlate] = useState(initialLicensePlate);
  const [category, setCategory] = useState<VehicleClass>(initialCategory);
  const [color, setColor] = useState(initialColor);
  const [bio, setBio] = useState(initialBio.slice(0, 300));
  const [languages, setLanguages] = useState<string[]>(() =>
    [...new Set(initialLanguages)].filter((code) =>
      DRIVER_LANGUAGE_FORM_OPTIONS.some((o) => o.value === code),
    ),
  );
  const [year, setYear] = useState<number | "">(
    Number.isFinite(initialYear) ? initialYear : "",
  );
  const [hasLicensePhoto, setHasLicensePhoto] = useState(initialHasLicensePhoto);
  const [hasIdPhoto, setHasIdPhoto] = useState(initialHasIdPhoto);
  const [hasPortraitPhoto, setHasPortraitPhoto] = useState(initialHasPortraitPhoto);
  const [vehiclePhotos, setVehiclePhotos] = useState({
    front: initialHasVehiclePhotoFront,
    rear: initialHasVehiclePhotoRear,
    left: initialHasVehiclePhotoLeft,
    right: initialHasVehiclePhotoRight,
    interior: initialHasVehiclePhotoInterior,
  });

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function markUploaded(docType: DriverUploadDocType) {
    switch (docType) {
      case "license":
        setHasLicensePhoto(true);
        break;
      case "id":
        setHasIdPhoto(true);
        break;
      case "portrait":
        setHasPortraitPhoto(true);
        break;
      case "vehicle_front":
        setVehiclePhotos((s) => ({ ...s, front: true }));
        break;
      case "vehicle_rear":
        setVehiclePhotos((s) => ({ ...s, rear: true }));
        break;
      case "vehicle_left":
        setVehiclePhotos((s) => ({ ...s, left: true }));
        break;
      case "vehicle_right":
        setVehiclePhotos((s) => ({ ...s, right: true }));
        break;
      case "vehicle_interior":
        setVehiclePhotos((s) => ({ ...s, interior: true }));
        break;
      default:
        break;
    }
  }

  async function uploadDoc(docType: DriverUploadDocType, file: File) {
    setUploadMessage(null);
    setUploadBusy(true);
    const fd = new FormData();
    fd.set("docType", docType);
    fd.set("file", file);
    try {
      const res = await fetch("/api/driver/upload-doc", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { error?: string; hint?: string };
      if (!res.ok) {
        setUploadMessage(data.error ?? "ატვირთვა ვერ მოხერხდა.");
        setUploadBusy(false);
        return;
      }
      markUploaded(docType);
      setUploadMessage("ატვირთვა დასრულდა.");
      router.refresh();
    } catch {
      setUploadMessage("ატვირთვა ვერ მოხერხდა.");
    }
    setUploadBusy(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const y =
      year === ""
        ? null
        : typeof year === "number" && Number.isFinite(year)
          ? year
          : null;
    const res = await fetch("/api/driver/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        make_model: makeModel,
        license_plate: licensePlate,
        category,
        year: y,
        color,
        bio,
        languages,
      }),
    });
    setPending(false);
    if (!res.ok) {
      let msg = "შენახვა ვერ მოხერხდა.";
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) msg = data.error;
      } catch {
        /* ignore */
      }
      setError(msg);
      return;
    }
    router.push("/driver");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 space-y-4 text-sm"
    >
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className="text-keke-muted">სახელი</span>
        <input
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          placeholder="სრული სახელი"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">მანქანის მოდელი</span>
        <input
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          placeholder="მაგ. Toyota Camry"
          value={makeModel}
          onChange={(e) => setMakeModel(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">სანომრე ნიშანი</span>
        <input
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          placeholder="XX-000-XX"
          value={licensePlate}
          onChange={(e) => setLicensePlate(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">კლასი</span>
        <select
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white"
          value={category}
          onChange={(e) => setCategory(e.target.value as VehicleClass)}
        >
          {VEHICLE_CLASS_ORDER.map((vc) => (
            <option key={vc} value={vc}>
              {VEHICLE_CLASS_LABELS[vc]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-keke-muted">ფერი</span>
        <input
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          placeholder="მაგ. ვერცხლისფერი"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">წელი</span>
        <input
          type="number"
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          placeholder="YYYY"
          min={1980}
          max={2035}
          value={year === "" ? "" : year}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              setYear("");
              return;
            }
            const n = Number(v);
            setYear(Number.isFinite(n) ? n : "");
          }}
        />
      </label>

      <div className="border-t border-keke-line pt-6">
        <h2 className="text-sm font-semibold text-white">დამატებითი ინფორმაცია</h2>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-keke-muted">ბიო</span>
            <textarea
              className="mt-1 min-h-[96px] w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
              placeholder="მოკლე აღწერა თქვენ შესახებ..."
              maxLength={300}
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 300))}
            />
            <span className="mt-1 block text-xs text-keke-muted">
              {bio.length}/300
            </span>
          </label>

          <div>
            <span className="text-keke-muted">ენები</span>
            <div className="mt-2 flex flex-col gap-2">
              {DRIVER_LANGUAGE_FORM_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 text-white"
                >
                  <input
                    type="checkbox"
                    checked={languages.includes(opt.value)}
                    disabled={pending}
                    onChange={() => {
                      setLanguages((prev) =>
                        prev.includes(opt.value)
                          ? prev.filter((c) => c !== opt.value)
                          : [...prev, opt.value],
                      );
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-keke-line pt-6">
        <h2 className="text-sm font-semibold text-white">დოკუმენტები</h2>
        <p className="mt-2 text-xs text-keke-muted">
          JPG, PNG ან PDF · max 5 MB
        </p>
        {uploadMessage ? (
          <p className="mt-2 text-sm text-keke-muted" role="status">
            {uploadMessage}
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          <div>
            <span className="text-keke-muted">მართვის მოწმობა</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                ref={licenseFileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadDoc("license", f);
                }}
              />
              <button
                type="button"
                className="btn-outline"
                disabled={uploadBusy}
                onClick={() => licenseFileRef.current?.click()}
              >
                ატვირთვა
              </button>
              <span className="text-sm text-keke-muted">
                {hasLicensePhoto ? "✅ ატვირთულია" : "⏳ მოლოდინში"}
              </span>
            </div>
          </div>

          <div>
            <span className="text-keke-muted">პირადობის მოწმობა</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                ref={idFileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadDoc("id", f);
                }}
              />
              <button
                type="button"
                className="btn-outline"
                disabled={uploadBusy}
                onClick={() => idFileRef.current?.click()}
              >
                ატვირთვა
              </button>
              <span className="text-sm text-keke-muted">
                {hasIdPhoto ? "✅ ატვირთულია" : "⏳ მოლოდინში"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-keke-line pt-6">
        <h2 className="text-sm font-semibold text-white">პორტრეტი</h2>
        <p className="mt-2 text-xs text-keke-muted">
          სურათი (JPG, PNG, WebP და სხვა) · max 5 MB · რეკომენდებულია 3×4 ან ახლო გეგმა
        </p>
        <div className="mt-4">
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <input
              ref={portraitFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadDoc("portrait", f);
              }}
            />
            <button
              type="button"
              className="btn-outline"
              disabled={uploadBusy}
              onClick={() => portraitFileRef.current?.click()}
            >
              ატვირთვა
            </button>
            <span className="text-sm text-keke-muted">
              {hasPortraitPhoto ? "✅ ატვირთულია" : "⏳ მოლოდინში"}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-keke-line pt-6">
        <h2 className="text-sm font-semibold text-white">მანქანის ფოტოები</h2>
        <p className="mt-2 text-xs text-keke-muted">
          მხოლოდ სურათები · max 5 MB · იტვირთება პირველ ჩაკავშირებულ მანქანაზე
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <span className="text-keke-muted">წინ</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                ref={vehicleFrontRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadDoc("vehicle_front", f);
                }}
              />
              <button
                type="button"
                className="btn-outline"
                disabled={uploadBusy}
                onClick={() => vehicleFrontRef.current?.click()}
              >
                ატვირთვა
              </button>
              <span className="text-sm text-keke-muted">
                {vehiclePhotos.front ? "✅ ატვირთულია" : "⏳ მოლოდინში"}
              </span>
            </div>
          </div>
          <div>
            <span className="text-keke-muted">უკან</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                ref={vehicleRearRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadDoc("vehicle_rear", f);
                }}
              />
              <button
                type="button"
                className="btn-outline"
                disabled={uploadBusy}
                onClick={() => vehicleRearRef.current?.click()}
              >
                ატვირთვა
              </button>
              <span className="text-sm text-keke-muted">
                {vehiclePhotos.rear ? "✅ ატვირთულია" : "⏳ მოლოდინში"}
              </span>
            </div>
          </div>
          <div>
            <span className="text-keke-muted">მარცხენა მხარე</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                ref={vehicleLeftRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadDoc("vehicle_left", f);
                }}
              />
              <button
                type="button"
                className="btn-outline"
                disabled={uploadBusy}
                onClick={() => vehicleLeftRef.current?.click()}
              >
                ატვირთვა
              </button>
              <span className="text-sm text-keke-muted">
                {vehiclePhotos.left ? "✅ ატვირთულია" : "⏳ მოლოდინში"}
              </span>
            </div>
          </div>
          <div>
            <span className="text-keke-muted">მარჯვენა მხარე</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                ref={vehicleRightRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadDoc("vehicle_right", f);
                }}
              />
              <button
                type="button"
                className="btn-outline"
                disabled={uploadBusy}
                onClick={() => vehicleRightRef.current?.click()}
              >
                ატვირთვა
              </button>
              <span className="text-sm text-keke-muted">
                {vehiclePhotos.right ? "✅ ატვირთულია" : "⏳ მოლოდინში"}
              </span>
            </div>
          </div>
          <div>
            <span className="text-keke-muted">სალონი</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                ref={vehicleInteriorRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadDoc("vehicle_interior", f);
                }}
              />
              <button
                type="button"
                className="btn-outline"
                disabled={uploadBusy}
                onClick={() => vehicleInteriorRef.current?.click()}
              >
                ატვირთვა
              </button>
              <span className="text-sm text-keke-muted">
                {vehiclePhotos.interior ? "✅ ატვირთულია" : "⏳ მოლოდინში"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          className="btn-gold"
          disabled={pending}
        >
          შენახვა
        </button>
        <Link href="/driver" className="btn-outline inline-flex items-center justify-center">
          უკან
        </Link>
      </div>
    </form>
  );
}
