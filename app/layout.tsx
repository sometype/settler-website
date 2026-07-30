import type { Metadata } from "next";
import { Google_Sans, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Georgian-first, and it must SELF-HOST the Georgian glyphs — the original Geist
// face was Latin-only, so every Georgian string fell back to a system font.
//
// Google Sans replaces Noto Sans Georgian (2026-07-28). Only three faces on
// Google Fonts carry the `georgian` subset at all — this one, Noto Sans
// Georgian and Noto Serif Georgian — so the choice is narrow by nature. This is
// the one with a true variable weight axis and a matching italic, which is what
// lets the wordmark, the UI and the body text come off a single family instead
// of three.
//
// ⚠️ Whatever replaces it MUST list "georgian" in its subsets. A Latin-only
// face greps identically to a working one and fails silently on every listing.
const georgian = Google_Sans({
  subsets: ["georgian", "latin"],
  variable: "--font-georgian",
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
  title: "Mepatrone — ბინები პირდაპირ პატრონებისგან",
  description:
    "ბინები ქირავდება და იყიდება თბილისში — პირდაპირ პატრონებისგან. აგენტების, სპამის და ძველი განცხადებების გარეშე.",
  openGraph: {
    title: "Mepatrone — ბინები პირდაპირ პატრონებისგან",
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
      className={`${georgian.variable} ${monoNum.variable} h-full antialiased`}
    >
      {/* min-w-0: flex children default to min-width:auto and can refuse to
          shrink below content — that alone can keep a horizontal page scroll
          alive even with overflow-x:clip on html/body (Grok 2026-07-30). */}
      <body className="flex min-h-full min-w-0 flex-col bg-paper font-sans text-ink">
        {/* Chrome sits on a white panel against the cool page ground, separated
            by a hairline — the whole system is panels and hairlines, not
            shadows and rounded slabs. 44px tall on a phone; the fold budget
            below it is measured and tight. */}
        <header className="sticky top-0 z-20 min-w-0 border-b border-sand bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-2.5">
            <Link href="/" className="flex items-baseline gap-2.5">
              {/* ONE Latin token — "Mepatrone" is the brand name, not a phrase.
                  It used to render as the Georgian "მე პატრონი", two words in a
                  Georgian serif. The two-tone split survives INSIDE the word so
                  the identity carries over; there is no space, because a space
                  would read as two words again. */}
              <span className="text-[19px] font-bold tracking-tight text-ink">
                Me<span className="text-clay">patrone</span>
              </span>
              <span className="hidden text-[13px] font-medium text-mink sm:inline">
                ბინები პირდაპირ პატრონებისგან
              </span>
            </Link>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
        <footer className="border-t border-sand bg-card">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-mink">
            <p className="text-base font-bold text-ink">
              Me<span className="text-clay">patrone</span>
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
