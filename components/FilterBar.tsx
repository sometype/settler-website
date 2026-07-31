"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { DISTRICTS, districtLabel } from "@/lib/districts";
import {
  MAX_DISTRICTS,
  parseDistrictCodes,
  serializeDistricts,
} from "@/lib/filters";
import { FRAME_OPTIONS, isConditionCode } from "@/lib/labels";
import type { ConditionCounts, DistrictCounts } from "@/lib/listings";
import { trackEvent } from "@/lib/events";

const ROOM_OPTIONS = ["1", "2", "3", "4", "5+"];

/**
 * m² presets, cut at real inventory boundaries rather than round numbers.
 *
 * ⚠️ WHY PRESETS AT ALL. A free min/max is the footgun: measured 24h on
 * 2026-07-30, an area bound appeared in 144 of 405 zero-result sessions, and
 * shapes like "min 200" are trivially typed and never match anything. Presets
 * cannot express an empty range.
 *
 * ⚠️ AND WHY NOT DELETE m² LIKE THE AMENITY CHIPS. Amenities were removed
 * because absence meant "unknown", so the filter was lying. Area data is
 * sound — it is only the unbounded input that fails. Measured bucket sizes,
 * rent / sale: <50 → 425/176 · 50-80 → 626/429 · 80-120 → 185/230 ·
 * 120+ → 68/96. No chip is a dead end on either deal, which is the property
 * that has to hold if these boundaries are ever re-cut.
 *
 * ⚠️ The boundaries OVERLAP by design: the filter is gte/lte, so a flat of
 * exactly 80 m² appears under both "50–80" and "80–120". Do not "fix" this to
 * 79/80 — chips are not a partition, and a gap would make a real listing
 * unreachable from either side, which is the failure this control exists to
 * prevent. An overlap costs nothing.
 */
const AREA_PRESETS: { label: string; mina: string; maxa: string }[] = [
  { label: "50 მ²-მდე", mina: "", maxa: "50" },
  { label: "50–80 მ²", mina: "50", maxa: "80" },
  { label: "80–120 მ²", mina: "80", maxa: "120" },
  { label: "120 მ²-დან", mina: "120", maxa: "" },
];

export function FilterBar({
  frameCounts,
  districtCounts,
}: {
  frameCounts?: ConditionCounts | null;
  /**
   * Live count per district for the ACTIVE deal. Optional on purpose: absent
   * or null renders exactly as before, so a failed count degrades to today's
   * UI rather than hiding districts.
   */
  districtCounts?: DistrictCounts | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const districtListId = useId();
  const districtPanelRef = useRef<HTMLDivElement>(null);

  // Multi-district: comma-separated `district` query (and array form).
  const districtUrlValues = params.getAll("district");
  const districtUrlKey = districtUrlValues.join("\u001f");
  const [districts, setDistricts] = useState<string[]>(() =>
    parseDistrictCodes(districtUrlValues.length > 1
      ? districtUrlValues
      : params.get("district") ?? undefined)
  );
  // Synchronous source of truth between router navigations. React state and
  // useSearchParams update after navigation; a ref keeps two quick taps from
  // both reading the same old URL and dropping the first district.
  const districtsRef = useRef(districts);
  const [syncedDistrictUrlKey, setSyncedDistrictUrlKey] = useState(districtUrlKey);
  const [districtOpen, setDistrictOpen] = useState(false);
  // ⚠️ SALE PRICES ARE ENTERED IN THOUSANDS. Georgians quote flats as "80",
  // meaning $80,000 — measured 117 sessions/day typed bounds like 30–40 or
  // 100–110 on the sale tab and got ZERO every single time, because the field
  // read them as $30 and $110.
  //
  // ⚠️ THE CONVERSION LIVES ONLY AT THIS BOUNDARY. The URL, `parseFilters`,
  // `listings_public` and every analytics row stay in REAL DOLLARS, so old
  // bookmarks, `meta.min`/`meta.max` history and the price-drop writers are
  // untouched. Only what the human types and reads is denominated in thousands.
  //
  // ⚠️ And it is never silent: the resolved dollars render under the fields as
  // they type. A guess that shows its work is a unit; a guess that hides it is
  // the invisible ×1000 this round refused.
  // Read straight off the URL: `deal` is declared below, and FilterBar remounts
  // on a deal change (page.tsx filterKey), so this is stable for the mount.
  const priceUnit = (params.get("deal") ?? "sale") === "sale" ? 1000 : 1;
  const toField = (raw: string | null) => {
    if (!raw) return "";
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return "";
    const v = n / priceUnit;
    // Trim 80.0 -> 80 but keep 85.5 for a bookmarked $85,500.
    return String(Number(v.toFixed(3)));
  };
  const toUsd = (field: string) => {
    const t = field.trim();
    if (!t) return "";
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return "";
    return String(Math.round(n * priceUnit));
  };
  const usdLabel = (field: string) => {
    const usd = toUsd(field);
    return usd ? `$${Number(usd).toLocaleString("en-US")}` : null;
  };

  const [min, setMin] = useState(() => toField(params.get("min")));
  const [max, setMax] = useState(() => toField(params.get("max")));
  const [minArea, setMinArea] = useState(params.get("mina") ?? "");
  const [maxArea, setMaxArea] = useState(params.get("maxa") ?? "");
  // Exact-range panel: open when the URL carries a range no preset expresses,
  // so a bookmarked ?mina=105&maxa=140 is visible and editable rather than
  // filtering invisibly behind a "ნებისმიერი" chip.
  const [exactArea, setExactArea] = useState(() => {
    const mina = params.get("mina") ?? "";
    const maxa = params.get("maxa") ?? "";
    if (!mina && !maxa) return false;
    return !AREA_PRESETS.some((p) => p.mina === mina && p.maxa === maxa);
  });
  const rooms = params.get("rooms") ?? "";
  // Default sale when param missing (matches parseFilters).
  const deal = params.get("deal") ?? "sale";
  // URL-driven like the room chips, so no local state and no filterKey entry.
  const rawFrame = params.get("frame") ?? "";
  const frame = deal === "sale" && isConditionCode(rawFrame) ? rawFrame : "";
  const isSale = deal === "sale";

  // Adjust URL-backed state during render (React's guarded previous-value
  // pattern), so back/forward and district-rail links update chips without an
  // effect-driven extra render. Keeping the component mounted also keeps the
  // multi-select panel open while each checkbox immediately updates the URL.
  if (districtUrlKey !== syncedDistrictUrlKey) {
    const fromUrl = parseDistrictCodes(
      districtUrlValues.length > 1
        ? districtUrlValues
        : params.get("district") ?? undefined
    );
    setDistricts(fromUrl);
    setSyncedDistrictUrlKey(districtUrlKey);
  }

  useEffect(() => {
    districtsRef.current = districts;
  }, [districts]);

  // Close the district panel on outside click / Escape.
  useEffect(() => {
    if (!districtOpen) return;
    function onDoc(e: MouseEvent) {
      if (
        districtPanelRef.current &&
        !districtPanelRef.current.contains(e.target as Node)
      ) {
        setDistrictOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDistrictOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [districtOpen]);

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
    districts.length > 0 ||
      params.get("min") ||
      params.get("max") ||
      params.get("mina") ||
      params.get("maxa") ||
      frame ||
      rooms ||
      (params.get("deal") && params.get("deal") !== "sale")
  );

  function apply(overrides: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    // Drop repeated district keys so we never double-apply array + CSV.
    next.delete("district");
    const values: Record<string, string> = {
      district: serializeDistricts(districtsRef.current),
      // Thousands -> real dollars for sale; identity for rent. The URL is
      // always dollars, so nothing downstream needs to know about the unit.
      min: toUsd(min),
      max: toUsd(max),
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

  function updateDistricts(next: string[]) {
    districtsRef.current = next;
    setDistricts(next);
  }

  function toggleDistrict(code: string) {
    const current = districtsRef.current;
    let next: string[];
    if (current.includes(code)) {
      next = current.filter((c) => c !== code);
    } else if (current.length >= MAX_DISTRICTS) {
      // Cap hit — keep existing selection; visitor must deselect first.
      return;
    } else {
      next = [...current, code];
    }
    updateDistricts(next);
    // Apply with the next list immediately — same "complete intent" rule as
    // the old single-select dropdown, but for multi-toggle.
    apply({ district: serializeDistricts(next) });
  }

  function clearDistricts() {
    updateDistricts([]);
    apply({ district: "" });
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

  const districtSummary =
    districts.length === 0
      ? "ყველა უბანი"
      : districts.length === 1
        ? (districtLabel(districts[0], null) ?? districts[0])
        : `${districts.length} უბანი`;

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
            onClick={() =>
              apply({
                deal: value,
                // Rent and sale use different input units. Carrying an
                // unsubmitted sale `80` into rent created `min=80000`; clear
                // both bounds only when the deal actually changes.
                ...(value !== deal ? { min: "", max: "" } : {}),
                ...(value === "rent" ? { frame: "" } : {}),
              })
            }
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
        <div
          ref={districtPanelRef}
          className="relative col-span-2 flex flex-col gap-1 sm:col-span-1"
        >
          <span className="text-xs font-medium text-mink" id={`${districtListId}-label`}>
            უბანი
          </span>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={districtOpen}
            aria-controls={districtListId}
            aria-labelledby={`${districtListId}-label ${districtListId}-summary`}
            onClick={() => setDistrictOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded border border-sand-strong bg-card px-3 py-2 text-left text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          >
            <span
              id={`${districtListId}-summary`}
              className={districts.length === 0 ? "text-mink" : "text-ink"}
            >
              {districtSummary}
            </span>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-mink transition ${districtOpen ? "rotate-180" : ""}`}
            >
              <path fillRule="evenodd" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.58l3.3-3.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.42Z" clipRule="evenodd" />
            </svg>
          </button>
          {districtOpen && (
            <div
              id={districtListId}
              role="listbox"
              aria-multiselectable="true"
              aria-labelledby={`${districtListId}-label`}
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded border border-sand-strong bg-card py-1 shadow-md"
            >
              <button
                type="button"
                role="option"
                aria-selected={districts.length === 0}
                onClick={clearDistricts}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sand/40 ${
                  districts.length === 0 ? "font-semibold text-ink" : "text-mink"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                    districts.length === 0
                      ? "border-ink bg-ink text-white"
                      : "border-sand-strong"
                  }`}
                  aria-hidden="true"
                >
                  {districts.length === 0 ? "✓" : ""}
                </span>
                ყველა უბანი
              </button>
              {DISTRICTS.map((d) => {
                const selected = districts.includes(d.code);
                const atCap = !selected && districts.length >= MAX_DISTRICTS;
                // ⚠️ Counts are optional and absence is NOT zero. When
                // districtCounts is null (query failed, or the caller did not
                // fetch) every district stays selectable exactly as before —
                // a failed count must never silently hide inventory.
                const n = districtCounts ? (districtCounts[d.code] ?? 0) : null;
                const empty = n === 0 && !selected;
                return (
                  <button
                    key={d.code}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={atCap || empty}
                    onClick={() => toggleDistrict(d.code)}
                    title={empty ? "ამ უბანში ახლა არაფერია" : undefined}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sand/40 disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected ? "font-semibold text-ink" : "text-mink"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                        selected
                          ? "border-ink bg-ink text-white"
                          : "border-sand-strong"
                      }`}
                      aria-hidden="true"
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{d.ka}</span>
                    {/* .num on the FIGURE only — Georgian must never route
                        through the mono face (it has no coverage). */}
                    {n !== null && (
                      <span className="num shrink-0 text-[11px] tabular-nums text-mink">
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {districts.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {districts.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleDistrict(code)}
                  className="inline-flex items-center gap-1 rounded bg-sand/50 px-1.5 py-0.5 text-[11px] font-medium text-ink ring-1 ring-inset ring-sand-strong hover:bg-sand"
                  title="ამოშლა"
                >
                  {districtLabel(code, null) ?? code}
                  <span aria-hidden="true" className="text-mink">
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-mink">
            {isSale ? "მინ. $ (ათასებში)" : "მინ. $"}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder={isSale ? "80" : "0"}
            // Sale is denominated in thousands, so a bookmarked $85,500 shows as
            // 85.5 — the default step of 1 would mark that invalid and block submit.
            step="any"
            className="num rounded border border-sand-strong px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
          {/* ⚠️ .num on the FIGURE only — Georgian never routes through the
              mono face. This line is what keeps the unit honest: the visitor
              always sees the dollars that will actually be searched. */}
          {isSale && usdLabel(min) && (
            <span className="num text-[11px] text-faint">{usdLabel(min)}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-mink">
            {isSale ? "მაქს. $ (ათასებში)" : "მაქს. $"}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder={isSale ? "120" : "ნებისმიერი"}
            // Sale is denominated in thousands, so a bookmarked $85,500 shows as
            // 85.5 — the default step of 1 would mark that invalid and block submit.
            step="any"
            className="num rounded border border-sand-strong px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
          {isSale && usdLabel(max) && (
            <span className="num text-[11px] text-faint">{usdLabel(max)}</span>
          )}
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
                updateDistricts([]);
                setMin("");
                setMax("");
                setMinArea("");
                setMaxArea("");
                // ⚠️ Clearing to a bare feed emits NOTHING today, so "gave up"
                // and "cleared and kept browsing" are indistinguishable. That
                // is the question the zero screen raises and cannot answer.
                // `before` is the filter state at the moment of clearing —
                // without it we learn THAT people clear, not WHICH filter drove
                // them to. sendBeacon survives the navigation below.
                trackEvent("filter_clear", {
                  meta: {
                    scope: "all",
                    source: "filterbar",
                    before: {
                      deal,
                      districts: districtsRef.current,
                      district: districtsRef.current[0] ?? null,
                      rooms: rooms || null,
                      min: params.get("min"),
                      max: params.get("max"),
                      min_area: params.get("mina"),
                      max_area: params.get("maxa"),
                      condition_code: frame || null,
                    },
                  },
                });
                startTransition(() => router.push("/"));
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
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs font-medium text-mink">ფართი:</span>
        <button
          type="button"
          onClick={() => {
            setMinArea("");
            setMaxArea("");
            apply({ mina: "", maxa: "" });
          }}
          className={chip(!minArea && !maxArea)}
        >
          ნებისმიერი
        </button>
        {AREA_PRESETS.map((preset) => {
          const on = minArea === preset.mina && maxArea === preset.maxa;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={on}
              onClick={() => {
                // Toggling off returns to "any" rather than leaving a half
                // range behind — a preset is a whole answer, not two numbers.
                const next = on
                  ? { mina: "", maxa: "" }
                  : { mina: preset.mina, maxa: preset.maxa };
                setMinArea(next.mina);
                setMaxArea(next.maxa);
                apply(next);
              }}
              className={chip(on)}
            >
              {preset.label}
            </button>
          );
        })}
        {/* ⚠️ The exact range stays reachable, just not the default path. A
            bookmarked ?mina=105&maxa=140 matches no chip, so this opens
            automatically — otherwise the visitor would see "ნებისმიერი"
            highlighted while a range was silently filtering their results. */}
        <button
          type="button"
          onClick={() => setExactArea((v) => !v)}
          className="ml-1 text-xs font-medium text-mink underline underline-offset-2 hover:text-ink"
        >
          {exactArea ? "დახურვა" : "ზუსტი"}
        </button>
      </div>
      {exactArea && (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-sm">
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
      )}
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
