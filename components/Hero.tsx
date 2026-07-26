import { fetchStats, CHECK_WINDOW_H } from "@/lib/listings";

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
    <div className="flex flex-col">
      <span
        className={`text-3xl font-black leading-none sm:text-4xl ${
          accent ? "text-emerald-400" : "text-white"
        }`}
      >
        {value}
      </span>
      <span className="mt-1.5 text-xs font-medium text-stone-400 sm:text-sm">{label}</span>
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
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          ცოცხალი განახლება · ნამდვილი პატრონები
        </p>

        <h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">
          ბინა პირდაპირ <span className="text-emerald-400">პატრონისგან</span>.
          <br className="hidden sm:block" /> აგენტების გარეშე.
        </h1>

        <p className="mt-5 max-w-xl text-base text-stone-300 sm:text-lg">
          დაიღალე სპამით, ყალბი და ძველი განცხადებებით? აქ მხოლოდ ნამდვილი, ახალი ბინებია —
          გაფილტრული აგენტებისა და დუბლიკატებისგან.
        </p>

        {/* Live counts only — never hardcoded trust numbers. */}
        <div className="mt-9 flex flex-wrap gap-8 sm:gap-12">
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
