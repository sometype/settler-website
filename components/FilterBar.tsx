"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { DISTRICTS } from "@/lib/districts";
import { FILTER_AMENITIES } from "@/lib/amenities";
import { AmenityIcon } from "./AmenityIcon";

const ROOM_OPTIONS = ["1", "2", "3", "4", "5+"];

export function FilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [district, setDistrict] = useState(params.get("district") ?? "");
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const rooms = params.get("rooms") ?? "";
  // Default rent when param missing (matches parseFilters).
  const deal = params.get("deal") ?? "rent";
  const selectedAmenities = (params.get("amen") ?? "").split(",").filter(Boolean);

  // Phones only: everything except the rent/sale toggle collapses behind a
  // button. Measured before this change — hero 260px + filter bar 471px meant
  // the first apartment sat at y=896 on a 812px screen, so a visitor still had
  // to scroll past a full screen of chrome to see the product. Desktop keeps the
  // bar always open (sm:block below); it has the room.
  // Opens by default when filters are already applied, so a returning visitor
  // can see and clear what is narrowing their results.
  const [openOnMobile, setOpenOnMobile] = useState(false);

  const hasFilters = Boolean(
    params.get("district") ||
      params.get("min") ||
      params.get("max") ||
      rooms ||
      selectedAmenities.length > 0 ||
      (params.get("deal") && params.get("deal") !== "rent")
  );

  function apply(overrides: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    const values: Record<string, string> = {
      district: district.trim(),
      min: min.trim(),
      max: max.trim(),
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page"); // filter change resets pagination
    startTransition(() => {
      router.push(next.size ? `/?${next.toString()}` : "/");
    });
  }

  function toggleAmenity(key: string) {
    const set = new Set(selectedAmenities);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    apply({ amen: [...set].join(",") });
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
            onClick={() => apply({ deal: value })}
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
                startTransition(() => router.push("/?deal=rent"));
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-mink transition hover:text-ink"
            >
              გასუფთავება
            </button>
          )}
        </div>
      </div>
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
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {FILTER_AMENITIES.map((a) => {
          const active = selectedAmenities.includes(a.key);
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => toggleAmenity(a.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 ${chip(active)}`}
            >
              <AmenityIcon name={a.key} className="h-3.5 w-3.5" />
              {a.ka}
            </button>
          );
        })}
      </div>
      </div>
    </form>
  );
}
