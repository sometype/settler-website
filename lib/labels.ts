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

function lookup(map: Record<string, string>, raw: string | null | undefined): string | null {
  if (!raw) return null;
  return map[raw.trim()] ?? raw;
}

export const conditionLabel = (raw: string | null | undefined) => lookup(CONDITION, raw);
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
