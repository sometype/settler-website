"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { trackEvent } from "@/lib/events";

/**
 * A recovery link on the zero-result screen that records what it undid.
 *
 * ⚠️ WHY A CLIENT ISLAND FOR A LINK. `EmptyState` is a server component, so it
 * cannot attach a click handler — and the whole point of these links is to
 * learn whether anyone uses them. Without the event, "left the site" and
 * "cleared and carried on" stay indistinguishable, which is the exact question
 * the zero screen was built to answer. Measured 2026-07-30: 100 sessions/day
 * end at a zero.
 *
 * ⚠️ Fires on CLICK, before navigating — not from the destination page, which
 * cannot know what was cleared. `trackEvent` uses `sendBeacon`, which is
 * designed to survive the navigation that follows.
 *
 * ⚠️ `before` is the filter state at the moment of clearing. It is the field
 * that cannot be added later: without it we would learn THAT people clear, not
 * WHICH filter drove them to.
 */
export function ClearLink({
  href,
  scope,
  axis,
  before,
  className,
  children,
}: {
  href: string;
  scope: "all" | "axis";
  /** Which single axis this link drops. `scope: "axis"` only. */
  axis?: string;
  before: Record<string, unknown>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        trackEvent("filter_clear", {
          meta: {
            scope,
            ...(axis ? { axis } : {}),
            source: "empty_state",
            before,
          },
        });
      }}
    >
      {children}
    </Link>
  );
}
