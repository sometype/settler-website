/**
 * Inline stroke icons for canonical amenity keys (lib/amenities.ts).
 * Hand-drawn on a 24×24 grid — no icon dependency, no external requests.
 */
const PATHS: Record<string, React.ReactNode> = {
  furniture: (
    <>
      <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
      <rect x="3" y="11" width="18" height="6" rx="2" />
      <path d="M5 17v2M19 17v2" />
    </>
  ),
  air_conditioning: (
    <path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7" />
  ),
  heating: (
    <path d="M12 3c2 4 6 5.5 6 10a6 6 0 0 1-12 0c0-2 .8-3.5 2-5 .5 2 1.5 3 3 3-1-3-.5-6 1-8z" />
  ),
  hot_water: <path d="M12 3c3.5 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-11z" />,
  gas: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M18.4 5.6l-2.2 2.2M7.8 16.2l-2.2 2.2" />
    </>
  ),
  internet: (
    <>
      <path d="M5 12a10 10 0 0 1 14 0M8 15a6 6 0 0 1 8 0" />
      <circle cx="12" cy="18.5" r="1" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M9 21h6" />
    </>
  ),
  washing_machine: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M7 6.5h2" />
    </>
  ),
  fridge: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M6 10h12M15 6v2M15 13v3" />
    </>
  ),
  stove: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.8" />
      <circle cx="15.5" cy="8.5" r="1.8" />
      <circle cx="8.5" cy="15.5" r="1.8" />
      <circle cx="15.5" cy="15.5" r="1.8" />
    </>
  ),
  oven: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16" />
      <rect x="7" y="12" width="10" height="5" />
    </>
  ),
  dishwasher: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 8h16" />
      <circle cx="12" cy="14" r="3.5" />
    </>
  ),
  kitchen: (
    <path d="M7 3v6M5 3v4a2 2 0 0 0 4 0V3M7 12v9M16 3v18M16 3c2.5 2 3.5 4.5 3.5 6.5S18 12 16 12" />
  ),
  elevator: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M12 3v18M8 10V7.5m0 0L6.7 9M8 7.5 9.3 9M16 14v2.5m0 0 1.3-1.5M16 16.5 14.7 15" />
    </>
  ),
  parking: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M10 16.5v-9h3a2.75 2.75 0 0 1 0 5.5h-3" />
    </>
  ),
  garage: <path d="M3 21V10l9-6 9 6v11M7 21v-8h10v8M7 16.5h10" />,
  storage: <path d="M3 8l9-4 9 4-9 4-9-4zM3 8v9l9 4 9-4V8M12 12v9" />,
  pets_allowed: (
    <>
      <circle cx="7.5" cy="8.5" r="1.6" />
      <circle cx="12" cy="6.5" r="1.6" />
      <circle cx="16.5" cy="8.5" r="1.6" />
      <path d="M12 11c2.8 0 4.8 1.8 4.8 4a3 3 0 0 1-3 3c-.7 0-1.3-.2-1.8-.5-.5.3-1.1.5-1.8.5a3 3 0 0 1-3-3c0-2.2 2-4 4.8-4z" />
    </>
  ),
  pool: (
    <path d="M3 9c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 15c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
  ),
  metro_nearby: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 16V8l4 5 4-5v8" />
    </>
  ),
  coded_door: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01M12 16h.01" />
    </>
  ),
  alarm: (
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 0 0 4 0" />
  ),
  guard: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  gym: <path d="M7 8v8M4 10v4M17 8v8M20 10v4M7 12h10" />,
  fireplace: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 7.5h18M12 10.5c1.2 2 3 2.6 3 4.7a3 3 0 0 1-6 0c0-2.1 1.8-2.7 3-4.7z" />
    </>
  ),
};

export function AmenityIcon({ name, className }: { name: string; className?: string }) {
  const node = PATHS[name];
  if (!node) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
    >
      {node}
    </svg>
  );
}
