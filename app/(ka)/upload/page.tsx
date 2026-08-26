import type { Metadata } from "next";
import Script from "next/script";
import UploadFlow from "@/components/UploadFlow";

/**
 * /upload — owner self-listing (OWNERUPLOADDISCUSSION, Grok manifesto freeze).
 *
 * ⚠️ LAUNCH LAW: noindex + NOT linked from the site nav until the board's
 * exposure checklist closes (real Resend path ✓, P0s, one human E2E upload,
 * reviewer call once). First 48h it lives as a direct URL only; the header
 * link comes after (Grok §A "Soft").
 */

export const metadata: Metadata = {
  title: "განცხადების დამატება — Mepatrone",
  robots: { index: false, follow: false },
};

const TURNSTILE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function UploadPage() {
  return (
    <main className="min-h-screen bg-paper">
      {TURNSTILE_KEY ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      ) : null}
      <UploadFlow />
    </main>
  );
}
