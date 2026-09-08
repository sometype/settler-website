"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { listingAnchorId } from "@/lib/returnContext";

/**
 * Put the originating card into the current results history entry immediately
 * before a same-tab detail navigation. Native browser Back then restores the
 * same hash target as the detail page's explicit Back link.
 *
 * Modified, middle-button, and already-cancelled clicks do not navigate this
 * tab and therefore must not rewrite its history entry.
 */
export function rememberResultOrigin(
  listingId: number,
  event?: MouseEvent<HTMLElement>
): void {
  if (
    event &&
    (event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey)
  ) {
    return;
  }
  if (!Number.isSafeInteger(listingId) || listingId <= 0) return;

  const current = new URL(window.location.href);
  current.hash = listingAnchorId(listingId);
  window.history.replaceState(window.history.state, "", current);
}

export function ResultDetailLink({
  listingId,
  href,
  className,
  children,
}: {
  listingId: number;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => rememberResultOrigin(listingId, event)}
    >
      {children}
    </Link>
  );
}
