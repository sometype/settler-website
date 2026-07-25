"use client";

import { trackEvent } from "@/lib/events";
import { displayPhone } from "./PhoneBlock";

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

/**
 * Mobile call-first bar — fixed above the thumb zone so contact is never
 * buried under amenities/description. Hidden on lg+ (desktop uses the aside).
 */
export function StickyContactBar({
  phone,
  listingId,
}: {
  phone: string;
  listingId: number;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden"
      role="region"
      aria-label="დაკავშირება"
    >
      <p className="mb-2 text-center text-xs font-medium tracking-wide text-stone-600">
        {displayPhone(phone)}
      </p>
      <div className="mx-auto flex max-w-lg gap-2">
        <a
          href={telHref(phone)}
          onClick={() =>
            trackEvent("call_tap", {
              listingId,
              meta: { surface: "sticky_bar" },
            })
          }
          className="flex flex-1 items-center justify-center rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white"
        >
          დარეკვა
        </a>
        <a
          href={waHref(phone)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackEvent("wa_tap", {
              listingId,
              meta: { surface: "sticky_bar" },
            })
          }
          className="flex flex-1 items-center justify-center rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
