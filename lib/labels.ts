/**
 * Georgian display labels for categorical values that arrive in BOTH English
 * (myhome) and Georgian (ss) spellings. Purely presentational — the DB keeps
 * raw values, and an unmapped value renders as itself rather than hiding.
 */

const CONDITION: Record<string, string> = {
  "Newly Renovated": "ახალი რემონტით",
  "ახალი რემონტით": "ახალი რემონტით",
  "Old renovated": "ძველი რემონტით",
  "ძველი რემონტით": "ძველი რემონტით",
  "გარემონტებული": "გარემონტებული",
  "Green frame": "მწვანე კარკასი",
  "მწვანე კარკასი": "მწვანე კარკასი",
  "White frame": "თეთრი კარკასი",
  "თეთრი კარკასი": "თეთრი კარკასი",
  "Black frame": "შავი კარკასი",
  "შავი კარკასი": "შავი კარკასი",
  "White Plus": "თეთრი პლუსი",
  "Current renovation": "მიმდინარე რემონტი",
  "მიმდინარე რემონტი": "მიმდინარე რემონტი",
  "Repairing": "სარემონტო",
  "სარემონტო": "სარემონტო",
};

/**
 * კარკასი filter codes — the unfinished-shell grades a buyer can filter by.
 *
 * ⚠️ CO-LOCATED HERE ON PURPOSE, in the map that already knows these strings.
 * The backend's `normalize_lib.condition_code()` writes `listings.condition_code`
 * and is the ONLY other place raw frame spellings may live. Adding a third file
 * (`lib/conditions.ts` was proposed) would mean three places encoding "these
 * strings mean green" — the same defect that produced the five-copy cover pick
 * and the three-copy rail, both of which shipped a fix to some copies and not
 * others. Two places, never three.
 *
 * Labels are READ FROM `CONDITION` above rather than retyped, so the chip and
 * the listing page can never disagree about what «მწვანე კარკასი» is called.
 *
 * ⚠️ `White Plus` is deliberately NOT a code (human decision 2026-07-29). It
 * displays under its own name «თეთრი პლუსი», so filing it under the თეთრი chip
 * would put listings behind a label their own page contradicts. Accepted cost:
 * those listings are reachable by no chip at all.
 */
/**
 * The closed condition choice an owner picks when adding a listing.
 *
 * Lives here, not in the upload flow, because this file is already one of the
 * two places allowed to know raw condition spellings. A list inside the form
 * would be the third map the rule above forbids. The stored value is the raw
 * Georgian spelling, which `normalize_lib.condition_code()` already recognises.
 */
export const OWNER_CONDITIONS = [
  "ახალი რემონტით",
  "ძველი რემონტით",
  "მწვანე კარკასი",
  "თეთრი კარკასი",
  "შავი კარკასი",
  "სარემონტო",
] as const;
export type OwnerCondition = (typeof OWNER_CONDITIONS)[number];

export function isOwnerCondition(v: string): v is OwnerCondition {
  return (OWNER_CONDITIONS as readonly string[]).includes(v);
}

export const CONDITION_CODES = ["black", "white", "green"] as const;
export type ConditionCode = (typeof CONDITION_CODES)[number];

/** Chip order: worst-finished first, so the row reads as a progression. */
export const FRAME_OPTIONS: { code: ConditionCode; ka: string }[] = [
  { code: "black", ka: CONDITION["შავი კარკასი"] },
  { code: "white", ka: CONDITION["თეთრი კარკასი"] },
  { code: "green", ka: CONDITION["მწვანე კარკასი"] },
];

export function isConditionCode(v: string): v is ConditionCode {
  return (CONDITION_CODES as readonly string[]).includes(v);
}

const STATUS: Record<string, string> = {
  "New building": "ახალი აშენებული",
  "ახალი აშენებული": "ახალი აშენებული",
  "Old building": "ძველი აშენებული",
  "ძველი აშენებული": "ძველი აშენებული",
  "Under construction": "მშენებარე",
  "მშენებარე": "მშენებარე",
};

/**
 * Closed choices for the owner upload form, same pattern and same law as
 * OWNER_CONDITIONS above: this file is the one place raw spellings live, and
 * the stored value is the Georgian spelling the label maps already recognise.
 * Mirrored in the backend's normalize_lib.py OWNER_BUILDING_STATUSES /
 * OWNER_PROJECT_TYPES, which fail closed on anything outside these sets.
 */
export const OWNER_STATUSES = [
  "ახალი აშენებული",
  "ძველი აშენებული",
  "მშენებარე",
] as const;
export type OwnerStatus = (typeof OWNER_STATUSES)[number];

const PROJECT_TYPE: Record<string, string> = {
  "Non-standard": "არასტანდარტული",
  "არასტანდარტული": "არასტანდარტული",
  "City": "ქალაქური",
  "ქალაქური": "ქალაქური",
  "Italian": "იტალიური ეზო",
  "თბილისური ეზო": "თბილისური ეზო",
  "Krushov": "ხრუშჩოვის",
  "ხრუშჩოვის": "ხრუშჩოვის",
  "Czech": "ჩეხური",
  "ჩეხური": "ჩეხური",
  "Moscow": "მოსკოვის",
  "მოსკოვის": "მოსკოვის",
  "Lviv": "ლვოვის",
  "ლვოვის": "ლვოვის",
  "Kavlashvili": "ყავლაშვილის",
  "ყავლაშვილის": "ყავლაშვილის",
  "Leningrad": "ლენინგრადის",
  "ლენინგრადის": "ლენინგრადის",
  "Tukhareli": "ტუხარელის",
  "Duplex": "დუპლექსი",
  "Triplex": "ტრიპლექსი",
  "Dormitory": "საერთო საცხოვრებელი",
  // developer/brand names stay as-is: "m2 Development", "OPTIMA by m2", "Metra park"
};

/**
 * Owner-form project types: the distinct Georgian display values of
 * PROJECT_TYPE above (developer/brand names stay out — an owner picks a
 * building era/shape, not a marketing name). Values not present as their own
 * key in the map (ტუხარელის, დუპლექსი…) still render verbatim through
 * `lookup`'s raw fallback, so form and page cannot disagree.
 */
export const OWNER_PROJECT_TYPES = [
  "ქალაქური",
  "არასტანდარტული",
  "იტალიური ეზო",
  "თბილისური ეზო",
  "ხრუშჩოვის",
  "ჩეხური",
  "მოსკოვის",
  "ლვოვის",
  "ყავლაშვილის",
  "ლენინგრადის",
  "ტუხარელის",
  "დუპლექსი",
  "ტრიპლექსი",
  "საერთო საცხოვრებელი",
] as const;
export type OwnerProjectType = (typeof OWNER_PROJECT_TYPES)[number];

function lookup(map: Record<string, string>, raw: string | null | undefined): string | null {
  if (!raw) return null;
  return map[raw.trim()] ?? raw;
}

export const conditionLabel = (raw: string | null | undefined) => lookup(CONDITION, raw);

/**
 * Feed-card variant: FAIL CLOSED on unknown values. `conditionLabel` returns
 * an unmapped raw value unchanged — right for the detail page (source fallback
 * beats a blank row), wrong for the feed, where a future English source value
 * would leak onto every card at once. Same dictionary on purpose: a second
 * condition map is exactly the drift this module's header warns about.
 */
export const knownConditionLabel = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  return CONDITION[raw.trim()] ?? null;
};
export const statusLabel = (raw: string | null | undefined) => lookup(STATUS, raw);
export const projectTypeLabel = (raw: string | null | undefined) => lookup(PROJECT_TYPE, raw);

/**
 * Rooms as Georgian display text. myhome's ROOM_TYPE map yields the literal
 * string "studio" for room_type_id 8, which rendered as "studio-ოთახიანი ბინა"
 * in card alt text and screen readers — English leaking into a Georgian-first
 * page. Anything non-numeric falls through unchanged rather than being forced
 * into the "N ოთახი" shape.
 */
export function roomsLabelKa(rooms: string | number | null | undefined): string | null {
  if (rooms === null || rooms === undefined || rooms === "") return null;
  const r = String(rooms).trim();
  if (/^studio$/i.test(r)) return "სტუდიო";
  if (/^\d+\+?$/.test(r)) return `${r} ოთახი`;
  return r;
}

/** Same, for the "N-ოთახიანი ბინა" alt-text phrasing. */
export function roomsAltKa(rooms: string | number | null | undefined, place: string): string {
  const r = rooms === null || rooms === undefined ? null : String(rooms).trim();
  if (r && /^studio$/i.test(r)) return `სტუდიო ბინა, ${place}`;
  return `${r ?? "?"}-ოთახიანი ბინა, ${place}`;
}
