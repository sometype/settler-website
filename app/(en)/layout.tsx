import type { Metadata } from "next";
import { Google_Sans, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "../globals.css";
import { SessionBeacon } from "@/components/SessionBeacon";

const latin = Google_Sans({
  subsets: ["latin"],
  variable: "--font-georgian",
  display: "swap",
});

const monoNum = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-num",
  weight: ["500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mepatrone.com"),
  title: "Apartments for rent in Tbilisi | Mepatrone",
  description:
    "Current Tbilisi rental listings with direct owner contact. Browse apartments by district, price, rooms and size.",
  openGraph: {
    title: "Apartments for rent in Tbilisi | Mepatrone",
    description: "Current rental listings with direct contact to property owners.",
    locale: "en_US",
    type: "website",
  },
};

export default function EnglishRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${latin.variable} ${monoNum.variable} h-full antialiased`}>
      <body className="flex min-h-full min-w-0 flex-col bg-paper font-sans text-ink">
        <header className="sticky top-0 z-20 border-b border-sand bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
            <Link href="/en/rent" className="flex items-baseline gap-2.5">
              <span className="text-[19px] font-bold tracking-tight text-ink">
                Me<span className="text-clay">patrone</span>
              </span>
              <span className="hidden text-[13px] font-medium text-mink sm:inline">
                Tbilisi rentals from property owners
              </span>
            </Link>
            <span className="ml-auto text-xs font-medium text-mink">English rental catalog</span>
          </div>
        </header>
        <SessionBeacon />
        <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
        <footer className="border-t border-sand bg-card">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-mink">
            <p className="text-base font-bold text-ink">
              Me<span className="text-clay">patrone</span>
            </p>
            <p className="mt-1.5 max-w-xl">
              Current rental listings in Tbilisi. Contact the property owner directly; Mepatrone is not an agency or concierge service.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
