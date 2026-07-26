import { fetchStats, CHECK_WINDOW_H } from "@/lib/listings";

/**
 * Compact on phones, generous on desktop.
 *
 * Measured on production before this change: hero 594px against an 812px
 * viewport, first apartment at y=1230 — a phone user scrolled 1.5 screens of
 * marketing copy before seeing a single flat. On a "river" site where the whole
 * proposition is live inventory, the product has to be visible immediately;
 * adding more sections on top of that wall would only have pushed it further
 * down.
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
        className={`text-xl font-black leading-none sm:text-4xl ${
          accent ? "text-emerald-400" : "text-white"
        }`}
      >
        {value}
      </span>
      <span className="text-[11px] font-medium leading-tight text-stone-400 sm:mt-1.5 sm:text-sm">
        {label}
      </span>
    </div>
  );
}

export async function Hero() {
  let stats = { total: 0, addedToday: 0, checkedPct: 0 };
  try {
    stats = await fetchStats();
  } catch {
    // hero still renders without live numbers if the DB hiccups
  }

  return (
    <section className="bg-stone-950">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-20">
        <p className="mb-2.5 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30 sm:mb-4 sm:text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          ცოცხალი განახლება · ნამდვილი პატრონები
        </p>

        <h1 className="max-w-3xl text-[26px] font-black leading-[1.1] tracking-tight text-white sm:text-6xl sm:leading-[1.05]">
          ბინა პირდაპირ <span className="text-emerald-400">პატრონისგან</span>.
          <br className="hidden sm:block" /> აგენტების გარეშე.
        </h1>

        {/* Desktop only. On a phone this paragraph cost ~110px to restate what
            the headline already says, and it sat between the visitor and the
            flats. */}
        <p className="mt-5 hidden max-w-xl text-base text-stone-300 sm:block sm:text-lg">
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
