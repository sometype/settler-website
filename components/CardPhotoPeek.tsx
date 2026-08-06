"use client";

import Link from "next/link";
import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";
import type { ListingImage as ListingImageRow } from "@/lib/types";
import { resolveImageUrl } from "@/lib/images";
import { trackEvent } from "@/lib/events";
import type { CardPhotoContext } from "@/lib/event-contract";
import { ListingImage } from "./ListingImage";

const EXPOSURE_KEY = "mp_card_photo_exposure";
let exposureClaimedWithoutStorage = false;

function claimExposure(): boolean {
  try {
    if (sessionStorage.getItem(EXPOSURE_KEY)) return false;
    sessionStorage.setItem(EXPOSURE_KEY, "1");
    return true;
  } catch {
    if (exposureClaimedWithoutStorage) return false;
    exposureClaimedWithoutStorage = true;
    return true;
  }
}

function SlideImage({
  image,
  alt,
}: {
  image: ListingImageRow | null;
  alt: string;
}) {
  const src = image ? resolveImageUrl(image) : null;
  return (
    <>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- same /img URL as the contained image; browser cache deduplicates the request
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
        />
      )}
      <ListingImage
        src={src}
        alt={alt}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
      />
    </>
  );
}

/**
 * Three-photo feed preview. Native scrolling owns the gesture; JS only settles
 * the active index and suppresses the click produced after a horizontal drag.
 * Facts and call controls remain separate siblings in ListingCard.
 */
export function CardPhotoPeek({
  listingId,
  images,
  alt,
  href,
  eventContext,
  children,
}: {
  listingId: number;
  images: ListingImageRow[];
  alt: string;
  href: string;
  eventContext: CardPhotoContext;
  children?: ReactNode;
}) {
  const slides = images.slice(0, 3);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; scrollLeft: number } | null>(null);
  const suppressClickRef = useRef(false);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  // Only slides 0 and 1 have image elements on first paint. Slide 2 mounts
  // after slide 1 becomes active; already-loaded slides stay mounted.
  const [loadedThrough, setLoadedThrough] = useState(Math.min(1, slides.length - 1));

  useEffect(() => {
    if (slides.length < 2 || !rootRef.current) return;
    const target = rootRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.5) return;
        observer.disconnect();
        if (!claimExposure()) return;
        trackEvent("card_photo_exposure", {
          listingId,
          meta: { n: slides.length, surface: "feed", ...eventContext },
        });
      },
      { threshold: 0.5 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [eventContext, listingId, slides.length]);

  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    []
  );

  function settleIndex() {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth <= 0) return;
    const next = Math.max(
      0,
      Math.min(
        slides.length - 1,
        Math.round(viewport.scrollLeft / viewport.clientWidth)
      )
    );
    const previous = activeRef.current;
    if (next === previous) return;
    activeRef.current = next;
    setActive(next);
    setLoadedThrough((current) =>
      Math.max(current, Math.min(slides.length - 1, next + 1))
    );
    trackEvent("card_photo_swipe", {
      listingId,
      meta: {
        from: previous,
        to: next,
        n: slides.length,
        surface: "feed",
        ...eventContext,
      },
    });
  }

  function onScroll() {
    const start = pointerStartRef.current;
    const viewport = viewportRef.current;
    if (start && viewport && Math.abs(viewport.scrollLeft - start.scrollLeft) > 4) {
      suppressClickRef.current = true;
    }
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(settleIndex, 140);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewportRef.current?.scrollLeft ?? 0,
    };
    suppressClickRef.current = false;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current;
    if (!start) return;
    const dx = Math.abs(event.clientX - start.x);
    const dy = Math.abs(event.clientY - start.y);
    if (dx > 8 && dx > dy) suppressClickRef.current = true;
  }

  function finishPointer() {
    pointerStartRef.current = null;
    // The synthetic click follows pointerup in the same task. Clear only after
    // it has had a chance to be cancelled.
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  function onOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function moveTo(index: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    // A dot can jump straight from photo 1 to photo 3. Mount the requested
    // target before scrolling toward it; otherwise Safari visibly reaches an
    // empty slide and the image appears only after settleIndex() runs.
    setLoadedThrough((current) => Math.max(current, index));
    requestAnimationFrame(() => {
      const currentViewport = viewportRef.current;
      if (!currentViewport) return;
      currentViewport.scrollTo({
        left: index * currentViewport.clientWidth,
        behavior: "smooth",
      });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveTo(
      event.key === "ArrowRight"
        ? Math.min(slides.length - 1, active + 1)
        : Math.max(0, active - 1)
    );
  }

  if (slides.length <= 1) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden bg-well">
        <Link
          href={href}
          aria-label={`${alt} — განცხადების გახსნა`}
          className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
        >
          <SlideImage image={slides[0] ?? null} alt={alt} />
        </Link>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${alt} — ფოტოები`}
      className="relative aspect-[4/3] min-w-0 max-w-full overflow-hidden bg-well [contain:paint]"
      onKeyDown={onKeyDown}
    >
      <div
        ref={viewportRef}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        {slides.map((image, index) => {
          const content =
            index <= loadedThrough ? (
              <SlideImage
                image={image}
                alt={index === active ? `${alt} — ფოტო ${index + 1}` : ""}
              />
            ) : null;
          return (
            <div
              key={`${image.listing_id}-${image.position}`}
              aria-hidden={index === active ? undefined : "true"}
              className="relative h-full w-full shrink-0 snap-start"
            >
              {content}
              {index === active && (
                <Link
                  href={href}
                  aria-label={`${alt} — ფოტო ${index + 1} ${slides.length}-დან, განცხადების გახსნა`}
                  className="absolute inset-0 z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                  onClick={onOpen}
                  draggable={false}
                />
              )}
            </div>
          );
        })}
      </div>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        ფოტო {active + 1} {slides.length}-დან
      </span>
      <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full bg-pine/75 px-2 py-1 backdrop-blur-[2px]">
        {slides.map((image, index) => (
          <button
            key={`dot-${image.listing_id}-${image.position}`}
            type="button"
            aria-label={`ფოტო ${index + 1}`}
            aria-current={index === active ? "true" : undefined}
            onClick={() => moveTo(index)}
            className={`h-1.5 w-1.5 rounded-full transition ${
              index === active ? "bg-card" : "bg-card/45 hover:bg-card/75"
            }`}
          />
        ))}
      </div>
      {children}
    </div>
  );
}
