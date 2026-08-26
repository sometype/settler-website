"use client";

import { trackEvent } from "@/lib/events";

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function normalizedPhone(phone: string): string {
  const digits = digitsOnly(phone);
  return digits.startsWith("995") ? digits : `995${digits}`;
}

function displayPhone(phone: string): string {
  const digits = normalizedPhone(phone);
  return digits.length === 12
    ? `+995 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
    : `+${digits}`;
}

export function EnglishContact({
  phone,
  listingId,
  compact = false,
}: {
  phone: string | null | undefined;
  listingId: number;
  compact?: boolean;
}) {
  const number = phone?.trim();
  if (!number) {
    return compact ? null : (
      <div className="rounded-lg border border-sand bg-card p-4 text-sm text-mink">
        The owner&apos;s number is not available yet.
      </div>
    );
  }

  const digits = normalizedPhone(number);
  const message = encodeURIComponent(
    `Hello, I am interested in listing ${listingId} on Mepatrone.`
  );
  const attribution = { rail: null, sort: "new" as const, deal: "rent" as const };

  return (
    <div className={compact ? "space-y-2" : "rounded-lg border border-sand bg-card p-4"}>
      {!compact && (
        <>
          <h2 className="font-semibold text-ink">Contact the property owner directly</h2>
          <p className="mt-1 text-sm text-mink">
            Response languages vary. WhatsApp is usually easiest when you do not share a language.
          </p>
          <p className="num mt-3 text-lg font-semibold text-ink">{displayPhone(number)}</p>
        </>
      )}
      <a
        href={`https://wa.me/${digits}?text=${message}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          trackEvent("wa_tap", {
            listingId,
            meta: { surface: compact ? "card" : "phone_block", ...attribution },
          })
        }
        className="flex w-full items-center justify-center rounded bg-ink px-4 py-3 text-sm font-bold text-card transition hover:bg-pine"
      >
        Message owner on WhatsApp
      </a>
      <a
        href={`tel:+${digits}`}
        onClick={() =>
          trackEvent("call_tap", {
            listingId,
            meta: { surface: compact ? "card" : "phone_block", ...attribution },
          })
        }
        className="flex w-full items-center justify-center rounded border border-sand-strong bg-card px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ink"
      >
        Call owner
      </a>
    </div>
  );
}
