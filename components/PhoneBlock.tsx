"use client";

import { trackEvent } from "@/lib/events";
import type { ContactAttribution } from "@/lib/event-contract";

/**
 * Buyer → seller contact. Shows real number when the public view provides it.
 * Taps fire first-party beacons (call_tap / wa_tap) with the current page's
 * whitelisted rail/sort/deal context — proxy for "time to contact" without a
 * stale sessionStorage attribution chain.
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
  altPhones,
  listingId,
  attribution,
}: {
  hasPhone: boolean;
  phone?: string | null;
  /** Merged-dual second number(s): two-SIM owners (sql/022). Both are real
   *  and verified for their own portal listing — the caller decides which. */
  altPhones?: string[] | null;
  listingId: number;
  attribution: ContactAttribution;
}) {
  const number = phone?.trim() || null;
  const show = Boolean(hasPhone && number);
  // Belt-and-braces dedupe against the main number: the view already filters
  // by normalized last-9, but a formatting drift must never show a twin.
  const extras = (altPhones ?? [])
    .map((p) => p.trim())
    .filter((p) => p && digitsOnly(p).slice(-9) !== digitsOnly(number ?? "").slice(-9));

  return (
    <div className="rounded-lg border border-sand bg-card p-4">
      <h2 className="text-sm font-semibold text-ink">დაუკავშირდი პატრონს</h2>
      {show && number ? (
        <div className="mt-3 space-y-2.5">
          {/* Phone digits are the figure; + and spaces stay with them in mono. */}
          <p className="num text-lg font-semibold tracking-wide text-ink">
            {displayPhone(number)}
          </p>
          <a
            href={telHref(number)}
            onClick={() =>
              trackEvent("call_tap", {
                listingId,
                meta: { surface: "phone_block", ...attribution },
              })
            }
            // Ink fill = the one loud control (matches card call). Moss stays
            // "checked/alive" only — a green call button diluted that meaning.
            className="flex w-full items-center justify-center rounded bg-ink px-4 py-3 text-sm font-bold text-card transition hover:bg-pine"
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
                meta: { surface: "phone_block", ...attribution },
              })
            }
            className="flex w-full items-center justify-center rounded border border-sand-strong bg-card px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ink"
          >
            WhatsApp
          </a>
          {extras.length > 0 && (
            <div className="border-t border-sand pt-2.5">
              {/* Two-SIM owner: the same flat was posted under a second number
                  on the other portal. Both are real; the caller picks. */}
              <p className="text-xs text-faint">დამატებითი ნომერი</p>
              {extras.map((p) => (
                <a
                  key={p}
                  href={telHref(p)}
                  onClick={() =>
                    trackEvent("call_tap", {
                      listingId,
                      meta: { surface: "phone_block_alt", ...attribution },
                    })
                  }
                  className="num mt-1 block text-base font-semibold tracking-wide text-ink underline decoration-sand-strong underline-offset-4 transition hover:decoration-ink"
                >
                  {displayPhone(p)}
                </a>
              ))}
            </div>
          )}
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
