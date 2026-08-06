"use client";

import { useState } from "react";

function Placeholder({ label }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-sand/50">
      <div className="flex flex-col items-center gap-1 text-faint">
        <svg
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
          />
        </svg>
        {label && <span className="text-xs">{label}</span>}
      </div>
    </div>
  );
}

/**
 * <img> with graceful fallback: an image the /img route can't serve swaps in a
 * clean placeholder rather than a broken-image icon.
 */
export function ListingImage({
  src,
  alt,
  className,
  placeholderLabel,
}: {
  src: string | null;
  alt: string;
  className?: string;
  placeholderLabel?: string;
}) {
  // Track the URL that failed instead of a component-wide boolean. A stable
  // gallery image element can then change from one src to another without a
  // failure on the previous photo poisoning every later photo. This also lets
  // callers keep the component mounted and avoid a visible remount blink.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src != null && failedSrc === src;

  if (!src || failed) {
    // Keep className (often absolute inset-0) so a failed load cannot collapse
    // a fixed-aspect gallery frame and reflow the page.
    return (
      <div className={className}>
        <Placeholder label={placeholderLabel} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- next/image would add a second hop on top of the /img route; revisit with the CDN work
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}
