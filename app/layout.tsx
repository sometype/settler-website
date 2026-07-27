import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_Georgian, Noto_Serif_Georgian } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Georgian-first: this font self-hosts the Georgian glyphs (the old Geist font
// was Latin-only, so Georgian text fell back to an ugly system font).
const georgian = Noto_Sans_Georgian({
  subsets: ["georgian", "latin"],
  variable: "--font-georgian",
  display: "swap",
});

// The wordmark ONLY. It used to be the display face for every heading, which is
// most of why the site read as a magazine rather than as a live feed. Kept here
// as a single cultural hook — Georgian serif is almost unused on the local web.
const georgianSerif = Noto_Serif_Georgian({
  subsets: ["georgian", "latin"],
  variable: "--font-georgian-serif",
  weight: ["700"],
  display: "swap",
});

// Numerals only (see the `.num` note in globals.css). Georgian text must never
// route through this face — it has no Georgian coverage and would fall back
// silently mid-string. Latin subset is therefore the correct and only subset.
const monoNum = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-num",
  weight: ["500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mepatrone.com"),
  title: "მე პატრონი — ბინები პირდაპირ პატრონებისგან",
  description:
    "ბინები ქირავდება და იყიდება თბილისში — პირდაპირ პატრონებისგან. აგენტების, სპამის და ძველი განცხადებების გარეშე.",
  openGraph: {
    title: "მე პატრონი — ბინები პირდაპირ პატრონებისგან",
    description:
      "აგენტების, სპამის და ძველი განცხადებების გარეშე — მხოლოდ ნამდვილი, ახალი განცხადებები.",
    locale: "ka_GE",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ka"
      className={`${georgian.variable} ${georgianSerif.variable} ${monoNum.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper font-sans text-ink">
        {/* Chrome sits on a white panel against the cool page ground, separated
            by a hairline — the whole system is panels and hairlines, not
            shadows and rounded slabs. 44px tall on a phone; the fold budget
            below it is measured and tight. */}
        <header className="sticky top-0 z-20 border-b border-sand bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-2.5">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span
                className="text-[19px] font-bold tracking-tight text-ink"
                style={{ fontFamily: "var(--font-serif-wordmark)" }}
              >
                მე <span className="text-clay">პატრონი</span>
              </span>
              <span className="hidden text-[13px] font-medium text-mink sm:inline">
                ბინები პირდაპირ პატრონებისგან
              </span>
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-sand bg-card">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-mink">
            <p
              className="text-base font-bold text-ink"
              style={{ fontFamily: "var(--font-serif-wordmark)" }}
            >
              მე <span className="text-clay">პატრონი</span>
            </p>
            <p className="mt-1.5 max-w-md">
              ნამდვილი, ახალი განცხადებები თბილისში — პირდაპირ პატრონებისგან, აგენტების გარეშე.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
