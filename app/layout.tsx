import type { Metadata } from "next";
import { Noto_Sans_Georgian, Noto_Serif_Georgian } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Georgian-first: this font self-hosts the Georgian glyphs (the old Geist font
// was Latin-only, so Georgian text fell back to an ugly system font).
const georgian = Noto_Sans_Georgian({
  subsets: ["georgian", "latin"],
  variable: "--font-georgian",
  display: "swap",
});

// Display face for headlines, prices and the wordmark. Georgian serif is
// almost unused on the local web — it is the cheapest possible way to not look
// like every other classifieds site. Weights limited to what we actually set.
const georgianSerif = Noto_Serif_Georgian({
  subsets: ["georgian", "latin"],
  variable: "--font-georgian-serif",
  weight: ["600", "700", "800"],
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
      className={`${georgian.variable} ${georgianSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper font-sans text-ink">
        <header className="sticky top-0 z-20 border-b border-sand bg-paper/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="font-display text-[22px] font-extrabold tracking-tight text-ink">
                მე პატრონი
              </span>
              <span className="hidden text-[13px] font-medium text-clay-deep sm:inline">
                ბინები პირდაპირ პატრონებისგან
              </span>
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        {/* Pine bookend: the page opens and closes in the same deep green, so
            the paper middle reads as a deliberate spread, not a default. */}
        <footer className="bg-pine">
          <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-cream/70">
            <p className="font-display text-lg font-bold text-cream">მე პატრონი</p>
            <p className="mt-1.5 max-w-md">
              ნამდვილი, ახალი განცხადებები თბილისში — პირდაპირ პატრონებისგან, აგენტების გარეშე.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
