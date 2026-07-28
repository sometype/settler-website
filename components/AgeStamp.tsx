"use client";

import { useEffect, useState } from "react";
import { AGE_BAND_CLASS, ageBand, compactAgeKa, type AgeBand } from "@/lib/time";

/**
 * The age reading on a card — the single loudest signal in the system.
 *
 * Both the label AND the ramp colour tick, because a listing crossing 15
 * minutes should visibly cool while the page is open. `initial*` props are
 * computed on the server and used verbatim for the first client render, so
 * hydration never mismatches on a minute boundary. This replaced TimeAgo,
 * which showed a prose age ("7 წუთის წინ") in a fixed colour — it could not
 * carry the ramp, and prose does not line up in a mono column.
 */
export function AgeStamp({
  iso,
  initialLabel,
  initialBand,
  className = "",
}: {
  iso: string;
  initialLabel: string;
  initialBand: AgeBand;
  className?: string;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [band, setBand] = useState<AgeBand>(initialBand);

  useEffect(() => {
    const update = () => {
      setLabel(compactAgeKa(iso));
      setBand(ageBand(iso));
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [iso]);

  // Split "3 წთ" so ONLY the digits go through .num. Georgian units (წთ/სთ/დღე)
  // and the word "ახლახან" must stay on the sans face — JetBrains Mono has no
  // Georgian coverage and would fall back mid-string (globals.css .num note).
  const m = label.match(/^(\d+)\s*(.*)$/);
  const figure = m?.[1] ?? null;
  const unit = m?.[2] ?? label;

  return (
    <time
      dateTime={iso}
      className={`font-bold ${AGE_BAND_CLASS[band]} ${className}`}
    >
      {figure ? (
        <>
          <span className="num">{figure}</span>
          {unit ? <> {unit}</> : null}
        </>
      ) : (
        unit
      )}
    </time>
  );
}
