import { SignUp } from "@clerk/nextjs";

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
    formFieldInput:
      "bg-[#f5f5f0] border-black/10 text-[#1a1a2e] rounded-lg",
    dividerLine: "bg-black/10",
    dividerText: "text-black/30",
    socialButtonsBlockButton:
      "border-black/10 text-[#1a1a2e] rounded-lg",
  },
};

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <div className="mx-auto max-w-[420px] px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <img
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-lg object-contain"
          />
          <span className="font-medium text-[#1a1a2e]">
            KEKE<span className="text-[#f5a623]">.</span>MANAGER
          </span>
        </div>
        <SignUp
          appearance={clerkAppearance}
          forceRedirectUrl="/onboarding"
        />
      </div>
    </div>
  );
}
