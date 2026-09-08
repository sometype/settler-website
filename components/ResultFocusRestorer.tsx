"use client";

import { useEffect } from "react";

const LISTING_TARGET_RE = /^listing-[1-9]\d*$/u;

/**
 * Give keyboard focus to the card named by a validated listing fragment.
 *
 * The browser already owns scrolling to `#listing-N`; this helper supplies the
 * separate accessibility behavior that fragments do not guarantee.  The
 * observer covers streamed result cards and expires after a bounded wait when
 * a listing has disappeared, leaving the visitor at the restored result set
 * without inventing another target.
 */
export function ResultFocusRestorer() {
  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!LISTING_TARGET_RE.test(targetId)) return;

    const restoreTarget = () => {
      const target = document.getElementById(targetId);
      if (!(target instanceof HTMLElement)) return false;
      const box = target.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= window.innerHeight) {
        target.scrollIntoView({ block: "center" });
      }
      target.focus({ preventScroll: true });
      return document.activeElement === target;
    };

    const observer = new MutationObserver(() => {
      restoreTarget();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    restoreTarget();

    let expiry = 0;
    const stopWatching = () => {
      observer.disconnect();
      window.clearTimeout(expiry);
      window.removeEventListener("pointerdown", stopOnUserIntent, true);
      window.removeEventListener("keydown", stopOnUserIntent, true);
      window.removeEventListener("touchstart", stopOnUserIntent, true);
    };
    const stopOnUserIntent = () => stopWatching();

    for (const event of ["pointerdown", "keydown", "touchstart"] as const) {
      window.addEventListener(event, stopOnUserIntent, { capture: true, once: true });
    }
    // Streaming rails can be inserted above the feed after its first card is
    // focusable. Keep correcting that layout shift briefly, then get out of the
    // visitor's way even if the target never appears.
    expiry = window.setTimeout(stopWatching, 10_000);

    return stopWatching;
  }, []);

  return null;
}
