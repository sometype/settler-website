"use client";

import { trackEvent } from "@/lib/events";

/**
 * Buyer → seller contact. Shows real number when the public view provides it.
 * Taps fire first-party beacons (call_tap / wa_tap) — proxy for "time to contact".
 */

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function telHref(phone: string): string {
  const d = digitsOnly(phone);
  if (d.startsWith("995") && d.length >= 12) return `tel:+${d}`;
  if (d.length === 9) return `tel:+995${d}`;
  if (phone.trim().startsWith("+")) return `tel:${phone.trim()}`;
  return `tel:+${d}`;
}

function waHref(phone: string): string {
  const d = digitsOnly(phone);
  const full = d.startsWith("995") ? d : `995${d}`;
  return `https://wa.me/${full}`;
}

export function displayPhone(phone: string): string {
  const d = digitsOnly(phone);
  if (d.startsWith("995") && d.length === 12) {
    return `+995 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  }
  if (d.length === 9) {
    return `+995 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  return phone.trim();
}

export function PhoneBlock({
  hasPhone,
  phone,
  listingId,
}: {
  hasPhone: boolean;
  phone?: string | null;
  listingId?: number;
}) {
  const number = phone?.trim() || null;
  const show = Boolean(hasPhone && number);

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-sand">
      <h2 className="text-sm font-semibold text-ink">დაუკავშირდი პატრონს</h2>
      {show && number ? (
        <div className="mt-3 space-y-3">
          <p className="text-lg font-semibold tracking-wide text-ink">
            {displayPhone(number)}
          </p>
          <a
            href={telHref(number)}
            onClick={() =>
              trackEvent("call_tap", {
                listingId,
                meta: { surface: "phone_block" },
              })
            }
            className="flex w-full items-center justify-center rounded-lg bg-moss px-4 py-3 text-sm font-semibold text-white transition hover:bg-moss-deep"
          >
            დარეკვა
          </a>
          <a
            href={waHref(number)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEvent("wa_tap", {
                listingId,
                meta: { surface: "phone_block" },
              })
            }
            className="flex w-full items-center justify-center rounded-lg bg-sand/50 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-sand"
          >
            WhatsApp
          </a>
        </div>
      ) : (
        <p className="mt-2 text-sm text-mink">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sand-strong align-middle" />
          ნომერი მალე დაემატება — შემოგვიარე მოგვიანებით.
        </p>
      )}
    </div>
  );
}
