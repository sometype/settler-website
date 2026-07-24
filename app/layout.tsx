import type { Metadata } from "next";
import { Noto_Sans_Georgian } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Georgian-first: this font self-hosts the Georgian glyphs (the old Geist font
// was Latin-only, so Georgian text fell back to an ugly system font).
const georgian = Noto_Sans_Georgian({
  subsets: ["georgian", "latin"],
  variable: "--font-georgian",
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
    <html lang="ka" className={`${georgian.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 font-sans text-stone-900">
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-stone-900">
                მე პატრონი
              </span>
              <span className="hidden text-sm font-medium text-emerald-700 sm:inline">
                ბინები პირდაპირ პატრონებისგან
              </span>
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-stone-500">
            <p className="font-black text-stone-800">მე პატრონი</p>
            <p className="mt-1">
              ნამდვილი, ახალი განცხადებები თბილისში — პირდაპირ პატრონებისგან, აგენტების გარეშე.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
