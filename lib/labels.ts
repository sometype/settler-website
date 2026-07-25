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
