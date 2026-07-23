import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Settler — Fresh Tbilisi rentals, curated.",
  description:
    "Curated apartment rentals in Tbilisi, Georgia. Fewer, better listings from real owners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-3.5">
            <Link href="/" className="text-xl font-bold tracking-tight text-stone-900">
              Settler
            </Link>
            <span className="hidden text-sm text-stone-500 sm:inline">
              Fresh Tbilisi rentals, curated.
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-stone-500">
            Settler — curated Tbilisi apartment rentals. Test launch.
          </div>
        </footer>
      </body>
    </html>
  );
}
