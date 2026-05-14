"use client";

import Image from "next/image";
import { Link, useRouter } from "@/i18n/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import DatePicker from "react-datepicker";
import { ka } from "date-fns/locale";
import {
  COMPANY_PLAN_OPTIONS,
  companyInitialsFromName,
  type CompanyProfile,
} from "@/lib/airtable/company-profile";

export type CompanyEditFormProps = {
  profile: CompanyProfile;
};

function defaultPlan(current: string | null): (typeof COMPANY_PLAN_OPTIONS)[number] {
  if (current && (COMPANY_PLAN_OPTIONS as readonly string[]).includes(current)) {
    return current as (typeof COMPANY_PLAN_OPTIONS)[number];
  }
  return COMPANY_PLAN_OPTIONS[0]!;
}

function parseLocalYyyyMmDd(s: string | null | undefined): Date | null {
  if (!s?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return new Date(y, mo, d);
}

function toYyyyMmDdLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function CompanyEditForm({ profile }: CompanyEditFormProps) {
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [companyName, setCompanyName] = useState(profile.companyName ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [employeesCount, setEmployeesCount] = useState<number | "">(
    profile.employeesCount != null && Number.isFinite(profile.employeesCount)
      ? profile.employeesCount
      : "",
  );
  const [description, setDescription] = useState(profile.description ?? "");
  const [licenseNumber, setLicenseNumber] = useState(profile.licenseNumber ?? "");
  const [commissionPercent, setCommissionPercent] = useState<number | "">(
    profile.commissionPercent != null && Number.isFinite(profile.commissionPercent)
      ? profile.commissionPercent
      : "",
  );
  const [trialEndsDate, setTrialEndsDate] = useState<Date | null>(() =>
    parseLocalYyyyMmDd(profile.trialEnds),
  );
  const [plan, setPlan] = useState(defaultPlan(profile.plan));

  const [logoUrl, setLogoUrl] = useState<string | null>(profile.logoUrl);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onLogoChange(file: File | undefined) {
    if (!file) return;
    setUploadMessage(null);
    setUploadBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/company/upload-logo", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { error?: string; logoUrl?: string };
      if (!res.ok) {
        setUploadMessage(data.error ?? "ლოგოს ატვირთვა ვერ მოხერხდა.");
        setUploadBusy(false);
        return;
      }
      if (data.logoUrl) setLogoUrl(data.logoUrl);
      setUploadMessage("ლოგო განახლებულია.");
      router.refresh();
    } catch {
      setUploadMessage("ლოგოს ატვირთვა ვერ მოხერხდა.");
    }
    setUploadBusy(false);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/company/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: companyName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        employeesCount:
          employeesCount === "" ? null : Math.max(0, Math.round(employeesCount)),
        description: description.trim(),
        licenseNumber: licenseNumber.trim(),
        commissionPercent:
          commissionPercent === "" ? null : Number(commissionPercent),
        trialEnds: trialEndsDate ? toYyyyMmDdLocal(trialEndsDate) : null,
        plan,
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
    router.push("/company");
    router.refresh();
  }

  const initials = companyInitialsFromName(companyName);

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5 text-sm">
      <div className="flex flex-col gap-4 border border-keke-line bg-keke-black p-4 sm:flex-row sm:items-center">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-keke-line bg-keke-ink">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt=""
              fill
              className="object-cover"
              sizes="96px"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-black text-[#f5a623]">
              {initials}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-keke-muted">ლოგო (Cloudinary)</p>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            disabled={uploadBusy}
            className="w-full text-white file:mr-3 file:rounded file:border-0 file:bg-[#f5a623] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#0f0f0f]"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              void onLogoChange(f);
            }}
          />
          {uploadMessage ? (
            <p className="text-xs text-keke-muted" role="status">
              {uploadMessage}
            </p>
          ) : null}
        </div>
      </div>

      <label className="block">
        <span className="text-keke-muted">Company name *</span>
        <input
          required
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">Email</span>
        <input
          type="email"
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">Phone</span>
        <input
          type="tel"
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">employees_count</span>
        <input
          type="number"
          min={0}
          step={1}
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white"
          value={employeesCount}
          onChange={(e) => {
            const v = e.target.value;
            setEmployeesCount(v === "" ? "" : Number(v));
          }}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">description</span>
        <textarea
          rows={5}
          className="mt-1 w-full resize-y rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">License number</span>
        <input
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">Commission %</span>
        <input
          type="number"
          step="0.01"
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white"
          value={commissionPercent}
          onChange={(e) => {
            const v = e.target.value;
            setCommissionPercent(v === "" ? "" : Number(v));
          }}
        />
      </label>

      <label className="block">
        <span className="text-keke-muted">საცდელი პერიოდის დასასრული</span>
        <div className="mt-1 w-full [&_.react-datepicker-wrapper]:block [&_.react-datepicker-wrapper]:w-full">
          <DatePicker
            selected={trialEndsDate}
            onChange={(date) => setTrialEndsDate(date)}
            dateFormat="dd/MM/yyyy"
            minDate={startOfToday}
            locale={ka}
            isClearable
            placeholderText="აირჩიეთ თარიღი…"
            popperClassName="keke-datepicker-popper"
            calendarClassName="keke-datepicker-calendar"
            popperProps={{ strategy: "fixed" }}
            className="w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
          />
        </div>
      </label>

      <label className="block">
        <span className="text-keke-muted">Plan</span>
        <select
          className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white"
          value={plan}
          onChange={(e) =>
            setPlan(e.target.value as (typeof COMPANY_PLAN_OPTIONS)[number])
          }
        >
          {COMPANY_PLAN_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="text-sm text-keke-muted" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          className="btn-gold"
          disabled={pending || uploadBusy}
        >
          შენახვა
        </button>
        <Link href="/company" className="btn-outline inline-block px-6 py-2 text-center">
          გაუქება
        </Link>
      </div>
    </form>
  );
}
