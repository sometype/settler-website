"use client";

import { useEffect, useState } from "react";
import { relativeTimeKa } from "@/lib/time";

/**
 * `initialLabel` is computed on the server and used verbatim for the first
 * client render, so hydration never mismatches on a minute boundary. The tick
 * only starts after mount.
 */
export function TimeAgo({
  iso,
  initialLabel,
  className,
}: {
  iso: string;
  initialLabel: string;
  className?: string;
}) {
  const [label, setLabel] = useState(initialLabel);

  useEffect(() => {
    const update = () => setLabel(relativeTimeKa(iso));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <time dateTime={iso} className={className}>
      {label}
    </time>
  );
}
