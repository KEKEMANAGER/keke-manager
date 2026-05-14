"use client";

import { useEffect, useState } from "react";
import { UserProfile } from "@clerk/nextjs";

const clerkAppearance = {
  variables: {
    colorPrimary: "#1a1a2e",
    colorBackground: "#ffffff",
    colorText: "#1a1a2e",
    colorTextSecondary: "rgba(0,0,0,0.5)",
    colorInputBackground: "#f5f5f0",
    colorInputText: "#1a1a2e",
    borderRadius: "8px",
  },
  elements: {
    rootBox: "w-full",
    card: "shadow-sm border border-black/8 rounded-2xl",
    formButtonPrimary:
      "bg-[#1a1a2e] text-white hover:bg-[#1a1a2e]/90 rounded-lg",
    footerActionLink: "text-[#1a1a2e] font-medium",
    identityPreviewEditButton: "text-[#1a1a2e]",
    formFieldInput: "bg-[#f5f5f0] border-black/10 text-[#1a1a2e] rounded-lg",
    dividerLine: "bg-black/10",
    dividerText: "text-black/30",
    socialButtonsBlockButton: "border-black/10 text-[#1a1a2e] rounded-lg",
  },
};

const LS_NEW = "keke.driver.notify.new_order";
const LS_CANCEL = "keke.driver.notify.cancel";
const LS_PAY = "keke.driver.notify.payment";

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "1" || v === "true";
}

function NotifyToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm font-medium text-[#1a1a2e]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? "bg-[#1a1a2e]" : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? "translate-x-[22px]" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function DriverSettingsClient() {
  const [newOrder, setNewOrder] = useState(true);
  const [cancelled, setCancelled] = useState(true);
  const [payment, setPayment] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setNewOrder(readBool(LS_NEW, true));
    setCancelled(readBool(LS_CANCEL, true));
    setPayment(readBool(LS_PAY, true));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS_NEW, newOrder ? "1" : "0");
  }, [newOrder, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS_CANCEL, cancelled ? "1" : "0");
  }, [cancelled, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS_PAY, payment ? "1" : "0");
  }, [payment, hydrated]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 text-[#1a1a2e] md:px-6">
      <div>
        <h1 className="text-xl font-bold">პარამეტრები</h1>
        <p className="mt-1 text-sm text-black/50">ანგარიში და შეტყობინებები</p>
      </div>

      <section className="rounded-2xl border-[0.5px] border-black/[0.08] bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">ანგარიში</h2>
        <p className="mt-1 text-sm text-black/50">Clerk პროფილი და უსაფრთხოება</p>
        <div className="mt-4 flex justify-center">
          <UserProfile appearance={clerkAppearance} />
        </div>
      </section>

      <section className="rounded-2xl border-[0.5px] border-black/[0.08] bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">შეტყობინებები</h2>
        <p className="mt-1 text-sm text-black/50">მობილური / ელფოსტა (ლოკალური პარამეტრები)</p>
        <div className="mt-2 divide-y divide-black/[0.06]">
          <NotifyToggle
            label="ახალი შეკვეთა"
            checked={newOrder}
            onChange={setNewOrder}
          />
          <NotifyToggle
            label="შეკვეთის გაუქმება"
            checked={cancelled}
            onChange={setCancelled}
          />
          <NotifyToggle label="გადახდა" checked={payment} onChange={setPayment} />
        </div>
      </section>
    </div>
  );
}
