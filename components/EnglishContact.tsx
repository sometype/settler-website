"use client";

import { trackEvent } from "@/lib/events";
import type { EnglishAgentContact } from "@/lib/english-agent-contact-core";
import { sendGoogleAdsConversion } from "@/lib/google-ads-conversion-client";

export function EnglishContact({
  contact,
  listingId,
  compact = false,
}: {
  contact?: EnglishAgentContact | null;
  listingId: number;
  compact?: boolean;
}) {
  if (!contact) {
    return compact ? null : (
      <div className="rounded-lg border border-sand bg-card p-4 text-sm text-mink">
        Mepatrone agent contact is temporarily unavailable.
      </div>
    );
  }

  const attribution = { rail: null, sort: "new" as const, deal: "rent" as const };

  return (
    <div className={compact ? "space-y-2" : "rounded-lg border border-sand bg-card p-4"}>
      {!compact && (
        <>
          <h2 className="font-semibold text-ink">Speak with a Mepatrone agent</h2>
          <p className="mt-1 text-sm text-mink">
            An English-speaking Mepatrone agent can contact the owner, confirm availability, arrange a viewing, and assist with the rental process.
          </p>
          <p className="num mt-3 text-lg font-semibold text-ink">{contact.displayPhone}</p>
        </>
      )}
      <a
        href={contact.whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          trackEvent("wa_tap", {
            listingId,
            meta: { surface: compact ? "card" : "phone_block", ...attribution },
          });
          sendGoogleAdsConversion("wa_tap");
        }}
        className="flex w-full items-center justify-center rounded bg-ink px-4 py-3 text-sm font-bold text-card transition hover:bg-pine"
      >
        Message a Mepatrone agent on WhatsApp
      </a>
      <a
        href={contact.callHref}
        onClick={() => {
          trackEvent("call_tap", {
            listingId,
            meta: { surface: compact ? "card" : "phone_block", ...attribution },
          });
          sendGoogleAdsConversion("call_tap");
        }}
        className="flex w-full items-center justify-center rounded border border-sand-strong bg-card px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ink"
      >
        Call a Mepatrone agent
      </a>
    </div>
  );
}
