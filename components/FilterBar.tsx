"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { DISTRICTS } from "@/lib/districts";
import { FRAME_OPTIONS, isConditionCode } from "@/lib/labels";
import type { ConditionCounts } from "@/lib/listings";

const ROOM_OPTIONS = ["1", "2", "3", "4", "5+"];

export function FilterBar({ frameCounts }: { frameCounts?: ConditionCounts | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [district, setDistrict] = useState(params.get("district") ?? "");
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const [minArea, setMinArea] = useState(params.get("mina") ?? "");
  const [maxArea, setMaxArea] = useState(params.get("maxa") ?? "");
  const rooms = params.get("rooms") ?? "";
  // Default rent when param missing (matches parseFilters).
  const deal = params.get("deal") ?? "rent";
  // URL-driven like the room chips, so no local state and no filterKey entry.
  const rawFrame = params.get("frame") ?? "";
  const frame = deal === "sale" && isConditionCode(rawFrame) ? rawFrame : "";

  // Phones only: everything except the rent/sale toggle collapses behind a
  // button. Measured before this change — hero 260px + filter bar 471px meant
  // the first apartment sat at y=896 on a 812px screen, so a visitor still had
  // to scroll past a full screen of chrome to see the product. Desktop keeps the
  // bar always open (sm:block below); it has the room.
  // Opens by default when filters are already applied, so a returning visitor
  // can see and clear what is narrowing their results.
  const [openOnMobile, setOpenOnMobile] = useState(false);

  // ⚠️ Reads the URL, not local state: this decides whether the mobile panel
  // opens for someone arriving on a bookmarked filtered link. Legacy `amen` is
  // deliberately absent — it no longer narrows anything, so it must not light
  // the panel up either.
  const hasFilters = Boolean(
    params.get("district") ||
      params.get("min") ||
      params.get("max") ||
      params.get("mina") ||
      params.get("maxa") ||
      frame ||
      rooms ||
      (params.get("deal") && params.get("deal") !== "rent")
  );

  function apply(overrides: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    const values: Record<string, string> = {
      district: district.trim(),
      min: min.trim(),
      max: max.trim(),
      mina: minArea.trim(),
      maxa: maxArea.trim(),
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page"); // filter change resets pagination
    // Sweep the retired amenity param out of any URL that still carries it, so
    // a bookmarked ?amen= link stops propagating through pagination once the
    // visitor touches a control. Nothing reads it any more (lib/filters.ts).
    next.delete("amen");
    // Same reasoning for `view`: it names a SURFACE (a channel opened
    // full-screen), and narrowing the catalogue means you have left that
    // surface. Without this it survives every filter interaction, so a visitor
    // who filters from inside the channel and then clears would land back on a
    // homepage with the rails silently missing and nothing to explain why.
    next.delete("view");
    startTransition(() => {
      router.push(next.size ? `/?${next.toString()}` : "/");
    });
  }

  const chip = (active: boolean) =>
    `rounded px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
      active
        ? "bg-ink text-white ring-ink"
        : "bg-card text-mink ring-sand-strong hover:ring-sand-strong"
    }`;

  // Hidden on phones unless toggled or already filtering; always shown from sm up.
  const openFilters = `${
    openOnMobile || hasFilters ? "block" : "hidden"
  } sm:block`;

  return (
    <form
      className="-mx-4 border-b border-sand bg-card px-4 py-2"  /* Full-bleed control strip.
         A floating rounded card read as a form to fill in; the strip reads as
         instrument chrome and gives ~20px back to the fold budget. */
      onSubmit={(e) => {
        e.preventDefault();
        apply({});
      }}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["rent", "ქირავდება"],
            ["sale", "იყიდება"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            // Leaving sale must drop `frame` in the SAME navigation, or a rent
            // URL keeps a parameter with no chip to show or clear it.
            onClick={() => apply({ deal: value, ...(value === "rent" ? { frame: "" } : {}) })}
            className={`rounded px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
              deal === value
                ? "bg-ink text-white ring-ink"
                : "bg-card text-mink ring-sand-strong hover:ring-sand-strong"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpenOnMobile((v) => !v)}
          aria-expanded={openOnMobile}
          className="ml-auto inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold text-mink ring-1 ring-inset ring-sand-strong transition hover:ring-sand-strong sm:hidden"
        >
          ფილტრი
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition ${openOnMobile ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.58l3.3-3.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.42Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <div className={openFilters}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[1fr_repeat(2,minmax(0,0.6fr))_auto]">
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-xs font-medium text-mink">უბანი</span>
          <select
            value={district}
            onChange={(e) => {
              // Apply immediately — a dropdown pick is a complete intent,
              // unlike typing a price which needs the ძებნა commit.
              setDistrict(e.target.value);
              apply({ district: e.target.value });
            }}
            className="rounded border border-sand-strong bg-card px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          >
            <option value="">ყველა უბანი</option>
            {DISTRICTS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.ka}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-mink">მინ. $</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="0"
            className="num rounded border border-sand-strong px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-mink">მაქს. $</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="ნებისმიერი"
            className="num rounded border border-sand-strong px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-1">
          <button
            type="submit"
            className="rounded bg-ink px-4 py-2 text-sm font-semibold text-card transition hover:bg-pine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            ძებნა
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setDistrict("");
                setMin("");
                setMax("");
                setMinArea("");
                setMaxArea("");
                startTransition(() => router.push("/?deal=rent"));
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-mink transition hover:text-ink"
            >
              გასუფთავება
            </button>
          )}
        </div>
      </div>
      {/* Area sits directly under price, ABOVE the room chips: both are typed
          ranges committed by ძებნა, so separating them with chips would split
          the one group a visitor fills in together. Its own row rather than
          joining price in one line — four numeric boxes side by side is
          unusable on a phone. Removing the eight amenity chips gave back more
          height than this row costs. */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-mink">მ²-დან</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={minArea}
            onChange={(e) => setMinArea(e.target.value)}
            placeholder="30"
            className="num rounded border border-sand-strong px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-mink">მ²-მდე</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={maxArea}
            onChange={(e) => setMaxArea(e.target.value)}
            placeholder="ნებისმიერი"
            className="num rounded border border-sand-strong px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </label>
      </div>
      {/* კარკასი — unfinished shells, SALE ONLY (149 of 151 such listings are
          sale; rent had 2). Each chip carries its live sale-wide count, which
          is also what lets a grade with no stock hide itself instead of
          promising results it cannot deliver — the black grade sat at 12-19
          and would otherwise look broken on a thin day. */}
      {deal === "sale" && frameCounts && FRAME_OPTIONS.some((o) => frameCounts[o.code] > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-mink">კარკასი:</span>
          {FRAME_OPTIONS.filter((o) => frameCounts[o.code] > 0).map((o) => {
            const active = frame === o.code;
            return (
              <button
                key={o.code}
                type="button"
                aria-pressed={active}
                // Single-select: tapping the active chip clears it. The grades
                // are mutually exclusive, so multi-select would buy nothing and
                // cost list parsing, `.in()`, and an ambiguous combined label.
                onClick={() => apply({ frame: active ? "" : o.code })}
                className={`inline-flex items-center gap-1.5 ${chip(active)}`}
              >
                {o.ka}
                <span className={`num text-[10px] ${active ? "text-white/70" : "text-faint"}`}>
                  {frameCounts[o.code]}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-mink">ოთახები:</span>
        <button type="button" onClick={() => apply({ rooms: "" })} className={chip(rooms === "")}>
          ნებისმიერი
        </button>
        {ROOM_OPTIONS.map((r) => (
          <button key={r} type="button" onClick={() => apply({ rooms: r })} className={chip(rooms === r)}>
            {r}
          </button>
        ))}
      </div>
      </div>
    </form>
  );
}
