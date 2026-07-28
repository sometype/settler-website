import { fetchStats, CHECK_WINDOW_H, type FeedStats } from "@/lib/listings";

/**
 * Status strip + one claim. NOT a marketing hero.
 *
 * The old version was a deep-pine brand panel: badge, 27px serif headline,
 * desktop paragraph, and four stat columns. It measured 594px on production at
 * 375x812 and pushed the first apartment to y=1230 — 1.5 screens of chrome
 * before a single flat. It was cut to ~260px in the fold work; this rebuild
 * takes it further by changing what it IS.
 *
 * The strip carries the product's only honest health check: how long ago the
 * machine last found something. If intake dies, that number visibly rots on its
 * own — no "9/9 workers up" service grid, which would be an ops surface on a
 * consumer page AND would leak pipeline topology to a competitor (see the
 * no-provenance rule).
 *
 * ⚠️ Any change here must re-measure the mobile fold. The budget is the
 * constraint everything else lives inside.
 */

/** "N წთ" / "N სთ" — the newest listing's age, as proof of life. */
function newestLabel(minutes: number | null): { value: string; unit: string } | null {
  if (minutes === null) return null;
  if (minutes < 1) return { value: "<1", unit: "წთ" };
  if (minutes < 60) return { value: String(minutes), unit: "წთ" };
  return { value: String(Math.floor(minutes / 60)), unit: "სთ" };
}

/**
 * One reading on the strip. The figure is mono/tabular, the caption is Georgian
 * sans — that split IS the instrument register, since Georgian has no uppercase
 * to build terminal chrome out of.
 */
function Reading({
  label,
  value,
  unit,
  tone = "ink",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "ink" | "moss";
}) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-mink">{label}</span>
      {/* .num on the figure only — unit is Georgian ("წთ"/"სთ"/"%") and must
          stay on the sans face (JetBrains Mono has no Georgian glyphs). */}
      <span
        className={`text-[13px] font-bold ${tone === "moss" ? "text-moss" : "text-ink"}`}
      >
        <span className="num">{value}</span>
        {unit && <span className="ml-0.5 text-[11px] font-medium">{unit}</span>}
      </span>
    </span>
  );
}

export async function Hero() {
  let stats: FeedStats = {
    total: 0,
    addedToday: 0,
    checkedPct: 0,
    newestMinutes: null,
  };
  try {
    stats = await fetchStats();
  } catch {
    // strip still renders without live numbers if the DB hiccups
  }

  const newest = newestLabel(stats.newestMinutes);

  return (
    <section className="border-b border-sand bg-card">
      {/* Status strip. Horizontally scrollable rather than wrapping, so a long
          Georgian label can never push the strip into a second row and eat the
          fold budget. */}
      <div className="border-b border-sand/70">
        <div className="mx-auto flex max-w-6xl items-center gap-3 overflow-x-auto px-4 py-2 text-[11.5px] whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moss opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-moss" />
          </span>
          {newest && (
            <Reading label="ბოლო დამატება" value={newest.value} unit={newest.unit} tone="moss" />
          )}
          {/* Only when genuinely high — a low number would advertise a broken
              monitor rather than build trust. Floored and capped at 99 upstream:
              "100%" reads as a fake marketing number even when it is true. */}
          {stats.checkedPct >= 90 && (
            <>
              <span className="shrink-0 text-sand-strong" aria-hidden="true">
                ·
              </span>
              <Reading
                label={`შემოწმებული ${CHECK_WINDOW_H}სთ-ში`}
                value={String(stats.checkedPct)}
                unit="%"
              />
            </>
          )}
          <span className="shrink-0 text-sand-strong" aria-hidden="true">
            ·
          </span>
          <Reading label="დღეს" value={`+${stats.addedToday.toLocaleString("ka-GE")}`} />
          <span className="shrink-0 text-sand-strong" aria-hidden="true">
            ·
          </span>
          <Reading label="სულ" value={stats.total.toLocaleString("ka-GE")} />
        </div>
      </div>

      {/* The claim. One line on a phone, two on desktop. No supporting
          paragraph: on a phone it cost ~110px to restate the headline while
          standing between the visitor and the flats. */}
      <div className="mx-auto max-w-6xl px-4 py-3.5 sm:py-10">
        <h1 className="max-w-3xl text-[21px] font-bold leading-[1.2] tracking-tight text-ink sm:text-5xl sm:leading-[1.08]">
          ბინა პირდაპირ <span className="text-clay">პატრონისგან</span>.{" "}
          <span className="text-mink">აგენტების გარეშე.</span>
        </h1>
      </div>
    </section>
  );
}
