/**
 * Canonical Tbilisi districts — mirror of the backend's normalize_lib.py
 * (single source of truth for codes; keep the two in sync).
 *
 * The DB stores `district_code` next to the raw `district` string, so
 * "Saburtalo" (myhome, English) and "საბურთალო" (ss, Georgian) are both
 * `saburtalo` and one filter matches both. Order below = display order in the
 * dropdown: majors by current inventory, then the long tail alphabetically.
 */
export interface District {
  code: string;
  ka: string;
}

export const DISTRICTS: District[] = [
  { code: "saburtalo", ka: "საბურთალო" },
  { code: "didi-dighomi", ka: "დიდი დიღომი" },
  { code: "gldani", ka: "გლდანი" },
  { code: "varketili", ka: "ვარკეთილი" },
  { code: "didube", ka: "დიდუბე" },
  { code: "vake", ka: "ვაკე" },
  { code: "isani", ka: "ისანი" },
  { code: "dighmis-masivi", ka: "დიღმის მასივი" },
  { code: "chughureti", ka: "ჩუღურეთი" },
  { code: "nadzaladevi", ka: "ნაძალადევი" },
  { code: "nutsubidze", ka: "ნუცუბიძის ფერდობი" },
  { code: "ortachala", ka: "ორთაჭალა" },
  { code: "sanzona", ka: "სანზონა" },
  { code: "samgori", ka: "სამგორი" },
  { code: "temka", ka: "თემქა" },
  { code: "mukhiani", ka: "მუხიანი" },
  { code: "vazisubani", ka: "ვაზისუბანი" },
  { code: "vashlijvari", ka: "ვაშლიჯვარი" },
  { code: "lisi", ka: "ლისის ტბა" },
  { code: "avlabari", ka: "ავლაბარი" },
  { code: "mtatsminda", ka: "მთაწმინდა" },
  { code: "sololaki", ka: "სოლოლაკი" },
  { code: "vera", ka: "ვერა" },
  { code: "bagebi", ka: "ბაგები" },
  // long tail, alphabetical by Georgian name
  { code: "abanotubani", ka: "აბანოთუბანი" },
  { code: "avchala", ka: "ავჭალა" },
  { code: "afrika", ka: "აფრიკა" },
  { code: "giorgitsminda", ka: "გიორგიწმინდა" },
  { code: "gldanula", ka: "გლდანულა" },
  { code: "elia", ka: "ელია" },
  { code: "vazha-kvartlebi", ka: "ვაჟა-ფშაველას კვარტლები" },
  { code: "vedzisi", ka: "ვეძისი" },
  { code: "zahesi", ka: "ზაჰესი" },
  { code: "ivertubani", ka: "ივერთუბანი" },
  { code: "kiketi", ka: "კიკეთი" },
  { code: "koniaki", ka: "კონიაკის დასახლება" },
  { code: "krtsanisi", ka: "კრწანისი" },
  { code: "kukia", ka: "კუკია" },
  { code: "lotkini", ka: "ლოტკინი" },
  { code: "mesame-masivi", ka: "მესამე მასივი" },
  { code: "moscow-ave", ka: "მოსკოვის გამზირი" },
  { code: "navtlughi", ka: "ნავთლუღი" },
  { code: "okrokana", ka: "ოქროყანა" },
  { code: "sopeli-dighomi", ka: "სოფ. დიღომი" },
  { code: "tabakhmela", ka: "ტაბახმელა" },
  { code: "shindisi", ka: "შინდისი" },
  { code: "tskneti", ka: "წყნეთი" },
];

const BY_CODE = new Map(DISTRICTS.map((d) => [d.code, d.ka]));

export function isKnownDistrictCode(code: string): boolean {
  return BY_CODE.has(code);
}

/**
 * Georgian display name for a listing's district. Falls back to the raw
 * source string for codes this map doesn't know yet (a new neighbourhood
 * shows its raw name rather than disappearing).
 */
export function districtLabel(
  code: string | null | undefined,
  raw: string | null | undefined
): string | null {
  return (code && BY_CODE.get(code)) || raw || null;
}
