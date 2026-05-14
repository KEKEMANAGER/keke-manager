import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-keke-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KEKE MANAGER — B2B ტრანსპორტის პლატფორმა",
  description:
    "ტურისტული კომპანიების და ფრილანსერ მძღოლების გაერთიანება — ჯავშანი, GPS, რეიტინგი.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ka" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
