import { fetchStats, CHECK_WINDOW_H, type FeedStats } from "@/lib/listings";

/**
 * Compact on phones, generous on desktop.
 *
 * Measured on production before the fold work: hero 594px against an 812px
 * viewport, first apartment at y=1230 — a phone user scrolled 1.5 screens of
 * marketing copy before seeing a single flat. That budget still holds: nothing
 * here may grow the mobile hero past ~300px.
 *
 * Visual language: deep pine ground, cream serif display, one clay accent word,
 * moss for anything alive. The two soft glows are the only decoration — warm
 * light on dark green, no imagery to compete with the listing photos below.
 */
function Stat({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-start sm:gap-0">
      <span
        className={`font-display text-xl font-bold leading-none sm:text-4xl ${
          accent ? "text-moss-bright" : "text-cream"
        }`}
      >
        {value}
      </span>
      <span className="text-[11px] font-medium leading-tight text-cream/60 sm:mt-1.5 sm:text-sm">
        {label}
      </span>
    </div>
  );
}

/** "N წთ წინ" / "N სთ წინ" — the newest listing's age, as proof of life. */
function newestLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 1) return "ახლახან";
  if (minutes < 60) return `${minutes} წთ წინ`;
  const h = Math.floor(minutes / 60);
  return `${h} სთ წინ`;
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
    // hero still renders without live numbers if the DB hiccups
  }

  const newest = newestLabel(stats.newestMinutes);

  return (
    <section className="relative overflow-hidden bg-pine">
      {/* Warm light on deep green — clay from the upper right, moss from the
          lower left. Pure decoration, so both are aria-hidden and cheap. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-clay/25 blur-3xl sm:h-96 sm:w-96"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-moss-bright/20 blur-3xl sm:h-80 sm:w-80"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:py-20">
        <p className="mb-2.5 inline-flex items-center gap-2 rounded-full bg-cream/5 px-3 py-1 text-[11px] font-semibold text-cream/80 ring-1 ring-inset ring-cream/15 sm:mb-4 sm:text-xs">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moss-bright opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-moss-bright" />
          </span>
          ცოცხალი განახლება
          {/* The river as one number: when the newest listing is minutes old,
              say so right here. Stronger than any adjective, and always true. */}
          {newest && <span className="text-cream/60">· ბოლო დამატება {newest}</span>}
        </p>

        <h1 className="max-w-3xl font-display text-[27px] font-bold leading-[1.14] tracking-tight text-cream sm:text-6xl sm:leading-[1.08]">
          ბინა პირდაპირ <span className="text-clay-soft">პატრონისგან</span>.
          <br className="hidden sm:block" /> აგენტების გარეშე.
        </h1>

        {/* Desktop only. On a phone this paragraph cost ~110px to restate what
            the headline already says, and it sat between the visitor and the
            flats. */}
        <p className="mt-5 hidden max-w-xl text-base text-cream/70 sm:block sm:text-lg">
          დაიღალე სპამით, ყალბი და ძველი განცხადებებით? აქ მხოლოდ ნამდვილი, ახალი ბინებია —
          გაფილტრული აგენტებისა და დუბლიკატებისგან.
        </p>

        {/* Live counts only — never hardcoded trust numbers.
            One wrapped inline row on phones, the original column set on desktop. */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 sm:mt-9 sm:gap-8 md:gap-12">
          <Stat value={stats.total.toLocaleString("ka-GE")} label="ნამდვილი განცხადება" />
          <Stat value={`+${stats.addedToday.toLocaleString("ka-GE")}`} label="დღეს დამატებული" accent />
          {/* The differentiator no incumbent shows: we re-visit listings, so a
              sold flat does not sit here for weeks. Rendered only when the
              number is genuinely high — a low percentage would advertise a
              broken monitor rather than build trust. */}
          {stats.checkedPct >= 90 && (
            <Stat
              value={`${stats.checkedPct}%`}
              label={`შემოწმებული ${CHECK_WINDOW_H} საათში`}
            />
          )}
        </div>
      </div>
    </section>
  );
}
