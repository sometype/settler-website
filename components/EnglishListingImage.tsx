"use client";

import { useEffect, useRef, useState } from "react";

const IMAGE_FAILURE_MESSAGE = "Image temporarily unavailable";

export function EnglishListingImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const failed = src !== null && failedSrc === src;

  useEffect(() => {
    const image = imageRef.current;
    if (src && image?.complete && image.naturalWidth === 0) setFailedSrc(src);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-sand/50 text-center text-xs text-faint ${className ?? ""}`}
        aria-label={src ? IMAGE_FAILURE_MESSAGE : "No photo available"}
      >
        {src ? IMAGE_FAILURE_MESSAGE : "No photo available"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- the first-party /img route already owns CDN delivery
    <img
      ref={imageRef}
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
