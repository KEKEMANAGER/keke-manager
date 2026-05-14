"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import DatePicker from "react-datepicker";
import { ka } from "date-fns/locale";
import type { BookingKind, DriverProfile } from "@/lib/types";
import type { PaymentMethod, VehicleClass } from "@/types/airtable";
import {
  VEHICLE_CLASS_LABELS,
  VEHICLE_CLASS_ORDER,
} from "@/lib/vehicle-class-labels";

const STEPS = [
  "ტიპი",
  "მარშრუტი",
  "კლასი",
  "მძღოლი",
  "დეტალები",
  "გადახდა",
] as const;

const KIND_OPTIONS: readonly { value: BookingKind; label: string }[] = [
  { value: "transfer", label: "ტრანსფერი" },
  { value: "tour", label: "ტური" },
  { value: "one_day_tour", label: "ერთდღიანი ტური" },
];

const KIND_LABEL: Record<BookingKind, string> = {
  transfer: "ტრანსფერი",
  tour: "ტური",
  one_day_tour: "ერთდღიანი ტური",
};

export type CompanySearchWizardProps = {
  drivers: DriverProfile[];
};

function toYyyyMmDdLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function CompanySearchWizard({ drivers }: CompanySearchWizardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [kind, setKind] = useState<BookingKind | null>(null);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupAt, setPickupAt] = useState<Date | null>(null);
  const [passengersCount, setPassengersCount] = useState<number | "">(1);
  const [childrenCount, setChildrenCount] = useState<number | "">(0);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [vehicleClass, setVehicleClass] = useState<VehicleClass>("sedan");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [signText, setSignText] = useState("");
  const [comment, setComment] = useState("");
  const [luggageCount, setLuggageCount] = useState<number | "">("");

  const [tourStartDate, setTourStartDate] = useState<Date | null>(null);
  const [tourEndDate, setTourEndDate] = useState<Date | null>(null);
  const [overnightStay, setOvernightStay] = useState(false);
  const [routeDescription, setRouteDescription] = useState("");

  const [payment, setPayment] = useState<PaymentMethod>("pay_now");
  const [clientPrice, setClientPrice] = useState<number | "">("");
  const [commissionGel, setCommissionGel] = useState<number | "">("");

  const filteredDrivers = useMemo(
    () =>
      drivers.filter(
        (d) =>
          d.primaryVehicleId &&
          d.vehicleCategory === vehicleClass,
      ),
    [drivers, vehicleClass],
  );

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId) ?? null,
    [drivers, selectedDriverId],
  );

  const selectedVehicleId = selectedDriver?.primaryVehicleId ?? null;

  function validateCurrentStep(): boolean {
    setStepError(null);
    if (step === 0) {
      if (!kind) {
        setStepError("აირჩიეთ ტიპი.");
        return false;
      }
      return true;
    }
    if (step === 1) {
      if (!pickup.trim() || !dropoff.trim() || !pickupAt) {
        setStepError("შეავსეთ დაწყება, დანიშნულება და დრო.");
        return false;
      }
      const t = pickupAt.getTime();
      if (!Number.isFinite(t)) {
        setStepError("არასწორი თარიღი/დრო.");
        return false;
      }
      if (t < Date.now() - 30_000) {
        setStepError("აირჩიეთ მომავალი თარიღი და დრო.");
        return false;
      }
      const pax =
        passengersCount === ""
          ? NaN
          : Math.max(0, Math.floor(Number(passengersCount)));
      if (!Number.isFinite(pax) || pax < 1) {
        setStepError("მიუთითეთ მგზავრების რაოდენობა (მინიმუმ 1).");
        return false;
      }
      const ch =
        childrenCount === "" ? 0 : Math.max(0, Math.floor(Number(childrenCount)));
      if (!Number.isFinite(ch)) {
        setStepError("ბავშვების რაოდენობა არასწორია.");
        return false;
      }
      return true;
    }
    if (step === 2) return true;
    if (step === 3) {
      if (!selectedDriverId || !selectedVehicleId) {
        setStepError("აირჩიეთ მძღოლი.");
        return false;
      }
      return true;
    }
    if (step === 4) {
      if (!kind) {
        setStepError("აირჩიეთ ტიპი.");
        return false;
      }
      if (kind === "transfer") {
        if (!passengerName.trim() || !passengerPhone.trim()) {
          setStepError("შეავსეთ მგზავრის სახელი/გვარი და ტელეფონი.");
          return false;
        }
        return true;
      }
      if (kind === "tour" || kind === "one_day_tour") {
        if (!tourStartDate) {
          setStepError("აირჩიეთ ტურის დაწყების თარიღი.");
          return false;
        }
        if (kind === "tour") {
          if (!tourEndDate) {
            setStepError("აირჩიეთ ტურის დასრულების თარიღი.");
            return false;
          }
          const a = toYyyyMmDdLocal(tourStartDate);
          const b = toYyyyMmDdLocal(tourEndDate);
          if (b < a) {
            setStepError("დასრულების თარიღი უნდა იყოს დაწყების თარიღზე მეტი ან იგივე.");
            return false;
          }
        }
        return true;
      }
      return true;
    }
    return true;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function onConfirm() {
    if (!kind || !selectedDriverId || !selectedVehicleId) return;
    if (!pickup.trim() || !dropoff.trim() || !pickupAt) return;

    const pax =
      passengersCount === ""
        ? NaN
        : Math.max(1, Math.floor(Number(passengersCount)));
    const ch =
      childrenCount === "" ? 0 : Math.max(0, Math.floor(Number(childrenCount)));
    if (!Number.isFinite(pax) || pax < 1) return;
    if (!Number.isFinite(ch)) return;

    if (kind === "transfer" && (!passengerName.trim() || !passengerPhone.trim())) {
      setSubmitError("შეავსეთ მგზავრის მონაცემები.");
      return;
    }
    if ((kind === "tour" || kind === "one_day_tour") && !tourStartDate) {
      setSubmitError("აირჩიეთ ტურის დაწყების თარიღი.");
      return;
    }
    if (kind === "tour" && !tourEndDate) {
      setSubmitError("აირჩიეთ ტურის დასრულების თარიღი.");
      return;
    }

    const pickupTimeIso = pickupAt.toISOString();
    const tourStartStr =
      tourStartDate && (kind === "tour" || kind === "one_day_tour")
        ? toYyyyMmDdLocal(tourStartDate)
        : "";
    const tourEndStr =
      tourEndDate && kind === "tour" ? toYyyyMmDdLocal(tourEndDate) : "";
    const overnightPayload = kind === "tour" ? overnightStay : false;

    const cp = clientPrice === "" ? null : Number(clientPrice);
    const cg = commissionGel === "" ? null : Number(commissionGel);
    if (cp != null && !Number.isFinite(cp)) {
      setSubmitError("კლიენტის ფასი არასწორია.");
      return;
    }
    if (cg != null && !Number.isFinite(cg)) {
      setSubmitError("კომისია არასწორია.");
      return;
    }

    let luggage: number | null = null;
    if (luggageCount !== "") {
      const n = Math.max(0, Math.floor(Number(luggageCount)));
      if (!Number.isFinite(n)) {
        setSubmitError("ბარგის რაოდენობა არასწორია.");
        return;
      }
      luggage = n;
    }

    setSubmitError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/bookings/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            pickup: pickup.trim(),
            dropoff: dropoff.trim(),
            pickupTime: pickupTimeIso,
            driverId: selectedDriverId,
            vehicleId: selectedVehicleId,
            passengersCount: pax,
            childrenCount: ch,
            passengerName: passengerName.trim(),
            passengerPhone: passengerPhone.trim(),
            contactPerson: contactPerson.trim(),
            flightNumber: flightNumber.trim(),
            signText: signText.trim(),
            comment: comment.trim(),
            luggageCount: luggage,
            tourStartDate: tourStartStr,
            tourEndDate: tourEndStr,
            overnightStay: overnightPayload,
            routeDescription: routeDescription.trim(),
            paymentMethod: payment,
            clientPrice: cp,
            commissionGel: cg,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
        if (!res.ok) {
          setSubmitError(data.error ?? "დაჯავშნა ვერ მოხერხდა.");
          return;
        }
        router.push("/company");
        router.refresh();
      } catch {
        setSubmitError("დაჯავშნა ვერ მოხერხდა.");
      }
    });
  }

  const tourEndMinDate = tourStartDate ?? startOfToday;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#f5a623]">
        ძებნა · MVP ფორმა
      </p>
      <h1 className="mt-2 text-3xl font-black text-white">{STEPS[step]}</h1>
      <div className="mt-6 flex gap-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`h-1 flex-1 rounded ${i <= step ? "bg-[#f5a623]" : "bg-keke-line"}`}
            title={label}
          />
        ))}
      </div>

      <div className="mt-10 space-y-6 rounded-lg border border-keke-line bg-keke-ink p-6">
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-keke-muted">არჩეული ტიპი განსაზღვრავს ფასის ფორმულას.</p>
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-white p-1 sm:grid-cols-3">
              {KIND_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setKind(value);
                    if (value === "one_day_tour") {
                      setTourEndDate(null);
                      setOvernightStay(false);
                    }
                  }}
                  className={`rounded-lg px-2 py-2.5 text-center text-xs font-semibold leading-tight transition sm:text-sm ${
                    kind === value
                      ? "bg-[#1a1a2e] text-white"
                      : "bg-white text-neutral-900 hover:bg-neutral-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 text-sm">
            <Field
              label="დაწყება"
              placeholder="ქალაქი / აეროპორტი"
              value={pickup}
              onChange={setPickup}
            />
            <Field
              label="დანიშნულება"
              placeholder="ქალაქი / ლოკაცია"
              value={dropoff}
              onChange={setDropoff}
            />
            <label className="block">
              <span className="text-keke-muted">დაწყების თარიღი და დრო</span>
              <div className="mt-1 w-full [&_.react-datepicker-wrapper]:block [&_.react-datepicker-wrapper]:w-full">
                <DatePicker
                  selected={pickupAt}
                  onChange={(date) => setPickupAt(date)}
                  showTimeSelect
                  timeIntervals={15}
                  dateFormat="dd/MM/yyyy HH:mm"
                  timeFormat="HH:mm"
                  timeCaption="დრო"
                  minDate={startOfToday}
                  filterTime={(time) => time.getTime() > Date.now() - 30_000}
                  locale={ka}
                  placeholderText="დააჭირეთ ასარჩევად…"
                  popperClassName="keke-datepicker-popper"
                  calendarClassName="keke-datepicker-calendar"
                  popperProps={{ strategy: "fixed" }}
                  className="w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
                />
              </div>
            </label>
            <NumberField
              label="მგზავრების რაოდენობა"
              min={1}
              value={passengersCount}
              onChange={setPassengersCount}
            />
            <NumberField
              label="ბავშვები"
              min={0}
              value={childrenCount}
              onChange={setChildrenCount}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 text-sm">
            <p className="text-keke-muted">
              კლასის შემდეგ იხსნება ფიქსირებული / km / დღიური განაკვეთი.
            </p>
            <select
              className="w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white"
              value={vehicleClass}
              onChange={(e) => {
                setVehicleClass(e.target.value as VehicleClass);
                setSelectedDriverId(null);
              }}
            >
              {VEHICLE_CLASS_ORDER.map((vc) => (
                <option key={vc} value={vc}>
                  {VEHICLE_CLASS_LABELS[vc]}
                </option>
              ))}
            </select>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <p className="text-keke-muted">
              აირჩიეთ მძღოლი ({VEHICLE_CLASS_LABELS[vehicleClass]}).
            </p>
            {filteredDrivers.length === 0 ? (
              <p className="text-keke-muted">
                ამ კლასისთვის ხელმისაწვდომი მძღოლი ვერ მოიძებნა.
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredDrivers.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer flex-col gap-1 rounded border border-keke-line bg-keke-black px-4 py-3 hover:border-[#f5a623]/50"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="driver"
                        checked={selectedDriverId === d.id}
                        onChange={() => setSelectedDriverId(d.id)}
                        className="accent-[#f5a623]"
                      />
                      <span className="font-medium text-white">
                        {d.firstName} {d.lastName}
                      </span>
                    </div>
                    <span className="pl-7 text-xs text-keke-muted">
                      {d.vehicleModel}
                      {d.licensePlate ? ` · ${d.licensePlate}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 4 && kind === "transfer" && (
          <div className="space-y-4 text-sm text-white">
            <p className="text-keke-muted">ტრანსფერის დეტალები</p>
            <Field
              label="მგზავრის სახელი გვარი"
              placeholder="სახელი გვარი"
              value={passengerName}
              onChange={setPassengerName}
            />
            <Field
              label="მგზავრის ტელეფონი"
              placeholder="+995…"
              value={passengerPhone}
              onChange={setPassengerPhone}
              type="tel"
            />
            <Field
              label="კონტაქტური პირი"
              placeholder="სახელი (არასავალდებულო)"
              value={contactPerson}
              onChange={setContactPerson}
            />
            <Field
              label="რეისის ნომერი"
              placeholder="მაგ. TK123"
              value={flightNumber}
              onChange={setFlightNumber}
            />
            <Field
              label="ტაბლოს ტექსტი"
              placeholder="Meet & greet"
              value={signText}
              onChange={setSignText}
            />
            <label className="block">
              <span className="text-keke-muted">კომენტარი</span>
              <textarea
                className="mt-1 w-full resize-y rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
                rows={3}
                placeholder="დამატებითი ინფორმაცია"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <NumberField
              label="ბარგის რაოდენობა"
              min={0}
              value={luggageCount}
              onChange={setLuggageCount}
            />
          </div>
        )}

        {step === 4 && kind === "tour" && (
          <div className="space-y-4 text-sm text-white">
            <p className="text-keke-muted">ტურის დეტალები</p>
            <label className="block">
              <span className="text-keke-muted">ტურის დაწყება</span>
              <div className="mt-1 w-full [&_.react-datepicker-wrapper]:block [&_.react-datepicker-wrapper]:w-full">
                <DatePicker
                  selected={tourStartDate}
                  onChange={(date) => {
                    setTourStartDate(date);
                    if (date && tourEndDate && tourEndDate < date) {
                      setTourEndDate(date);
                    }
                  }}
                  dateFormat="dd/MM/yyyy"
                  minDate={startOfToday}
                  locale={ka}
                  placeholderText="აირჩიეთ თარიღი…"
                  popperClassName="keke-datepicker-popper"
                  calendarClassName="keke-datepicker-calendar"
                  popperProps={{ strategy: "fixed" }}
                  className="w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-keke-muted">ტურის დასრულება</span>
              <div className="mt-1 w-full [&_.react-datepicker-wrapper]:block [&_.react-datepicker-wrapper]:w-full">
                <DatePicker
                  selected={tourEndDate}
                  onChange={(date) => setTourEndDate(date)}
                  dateFormat="dd/MM/yyyy"
                  minDate={tourEndMinDate}
                  locale={ka}
                  placeholderText="აირჩიეთ თარიღი…"
                  popperClassName="keke-datepicker-popper"
                  calendarClassName="keke-datepicker-calendar"
                  popperProps={{ strategy: "fixed" }}
                  className="w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
                />
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded border border-keke-line bg-keke-black px-4 py-3">
              <input
                type="checkbox"
                checked={overnightStay}
                onChange={(e) => setOvernightStay(e.target.checked)}
                className="accent-[#f5a623]"
              />
              <span>ღამის გაჩერება</span>
            </label>
            <label className="block">
              <span className="text-keke-muted">მარშრუტის აღწერა</span>
              <textarea
                className="mt-1 w-full resize-y rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
                rows={4}
                placeholder="ქალაქები, გაჩერებები, მინდორი…"
                value={routeDescription}
                onChange={(e) => setRouteDescription(e.target.value)}
              />
            </label>
          </div>
        )}

        {step === 4 && kind === "one_day_tour" && (
          <div className="space-y-4 text-sm text-white">
            <p className="text-keke-muted">ერთდღიანი ტური — მხოლოდ დაწყების თარიღი და მარშრუტი</p>
            <label className="block">
              <span className="text-keke-muted">ტურის თარიღი</span>
              <div className="mt-1 w-full [&_.react-datepicker-wrapper]:block [&_.react-datepicker-wrapper]:w-full">
                <DatePicker
                  selected={tourStartDate}
                  onChange={(date) => setTourStartDate(date)}
                  dateFormat="dd/MM/yyyy"
                  minDate={startOfToday}
                  locale={ka}
                  placeholderText="აირჩიეთ თარიღი…"
                  popperClassName="keke-datepicker-popper"
                  calendarClassName="keke-datepicker-calendar"
                  popperProps={{ strategy: "fixed" }}
                  className="w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-keke-muted">მარშრუტის აღწერა</span>
              <textarea
                className="mt-1 w-full resize-y rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
                rows={4}
                placeholder="ქალაქები, გაჩერებები, მინდორი…"
                value={routeDescription}
                onChange={(e) => setRouteDescription(e.target.value)}
              />
            </label>
          </div>
        )}

        {step === 4 && !kind && (
          <p className="text-sm text-keke-muted">დაბრუნდით პირველ ნაბიჯზე და აირჩიეთ ტიპი.</p>
        )}

        {step === 5 && (
          <div className="space-y-4 text-sm text-white">
            <p className="font-semibold">შეჯამება</p>
            <ul className="space-y-2 text-keke-muted">
              <li>
                <span className="text-white/80">ტიპი: </span>
                {kind ? KIND_LABEL[kind] : "—"}
              </li>
              <li>
                <span className="text-white/80">დაწყება: </span>
                {pickup || "—"}
              </li>
              <li>
                <span className="text-white/80">დანიშნულება: </span>
                {dropoff || "—"}
              </li>
              <li>
                <span className="text-white/80">დრო: </span>
                {pickupAt ? pickupAt.toLocaleString("ka-GE") : "—"}
              </li>
              <li>
                <span className="text-white/80">მგზავრები / ბავშვები: </span>
                {passengersCount === "" ? "—" : passengersCount} /{" "}
                {childrenCount === "" ? "0" : childrenCount}
              </li>
              <li>
                <span className="text-white/80">კლასი: </span>
                {VEHICLE_CLASS_LABELS[vehicleClass]}
              </li>
              <li>
                <span className="text-white/80">მძღოლი: </span>
                {selectedDriver
                  ? `${selectedDriver.firstName} ${selectedDriver.lastName}`
                  : "—"}
              </li>
              {kind === "transfer" ? (
                <>
                  <li>
                    <span className="text-white/80">მგზავრი: </span>
                    {passengerName || "—"} · {passengerPhone || "—"}
                  </li>
                  {flightNumber ? (
                    <li>
                      <span className="text-white/80">რეისი: </span>
                      {flightNumber}
                    </li>
                  ) : null}
                </>
              ) : null}
              {kind === "tour" ? (
                <li>
                  <span className="text-white/80">ტური: </span>
                  {tourStartDate ? toYyyyMmDdLocal(tourStartDate) : "—"} —{" "}
                  {tourEndDate ? toYyyyMmDdLocal(tourEndDate) : "—"}
                  {overnightStay ? " · ღამის გაჩერება" : ""}
                </li>
              ) : null}
              {kind === "one_day_tour" ? (
                <li>
                  <span className="text-white/80">ერთდღიანი ტური: </span>
                  {tourStartDate ? toYyyyMmDdLocal(tourStartDate) : "—"}
                  {routeDescription.trim() ? ` · ${routeDescription.trim().slice(0, 80)}${routeDescription.trim().length > 80 ? "…" : ""}` : ""}
                </li>
              ) : null}
            </ul>

            <NumberField
              label="კლიენტის ფასი (ლარი)"
              min={0}
              step="0.01"
              value={clientPrice}
              onChange={setClientPrice}
            />
            <NumberField
              label="კომისია (ლარი)"
              min={0}
              step="0.01"
              value={commissionGel}
              onChange={setCommissionGel}
            />

            <label className="block">
              <span className="text-keke-muted">გადახდა</span>
              <select
                className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white"
                value={payment}
                onChange={(e) => setPayment(e.target.value as PaymentMethod)}
              >
                <option value="pay_now">ახლავე</option>
                <option value="reserve_then_pay">რეზერვაცია, შემდეგ გადახდა</option>
                <option value="client_card">კლიენტის ბარათი (+ კომისია)</option>
              </select>
            </label>
            <p className="text-xs text-keke-muted">
              გადახდის პირობები და ბოლო ვადები — შიდა წესებისა და Airtable ჩანაწერების მიხედვით.
            </p>
          </div>
        )}
      </div>

      {stepError ? (
        <p className="mt-4 text-sm text-keke-muted" role="alert">
          {stepError}
        </p>
      ) : null}

      {submitError ? (
        <p className="mt-4 text-sm text-keke-muted" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="mt-8 flex justify-between gap-4">
        <button
          type="button"
          className="btn-outline"
          disabled={step === 0 || pending}
          onClick={() => {
            setStepError(null);
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          უკან
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn-gold"
            disabled={pending}
            onClick={goNext}
          >
            შემდეგი
          </button>
        ) : (
          <button
            type="button"
            className="btn-gold"
            disabled={
              !kind ||
              !selectedDriverId ||
              !selectedVehicleId ||
              !pickup.trim() ||
              !dropoff.trim() ||
              !pickupAt ||
              pending
            }
            onClick={onConfirm}
          >
            დადასტურება
          </button>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-keke-muted">{label}</span>
      <input
        type={type}
        className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white placeholder:text-neutral-600"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  min?: number;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-keke-muted">{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        className="mt-1 w-full rounded border border-keke-line bg-keke-black px-3 py-2 text-white"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
      />
    </label>
  );
}
