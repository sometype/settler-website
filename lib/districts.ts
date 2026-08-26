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
  en: string;
}

export const DISTRICTS: District[] = [
  { code: "saburtalo", ka: "საბურთალო", en: "Saburtalo" },
  { code: "didi-dighomi", ka: "დიდი დიღომი", en: "Didi Dighomi" },
  { code: "gldani", ka: "გლდანი", en: "Gldani" },
  { code: "varketili", ka: "ვარკეთილი", en: "Varketili" },
  { code: "didube", ka: "დიდუბე", en: "Didube" },
  { code: "vake", ka: "ვაკე", en: "Vake" },
  { code: "isani", ka: "ისანი", en: "Isani" },
  { code: "dighmis-masivi", ka: "დიღმის მასივი", en: "Dighomi Massive" },
  { code: "chughureti", ka: "ჩუღურეთი", en: "Chughureti" },
  { code: "nadzaladevi", ka: "ნაძალადევი", en: "Nadzaladevi" },
  { code: "nutsubidze", ka: "ნუცუბიძის ფერდობი", en: "Nutsubidze Plateau" },
  { code: "ortachala", ka: "ორთაჭალა", en: "Ortachala" },
  { code: "sanzona", ka: "სანზონა", en: "Sanzona" },
  { code: "samgori", ka: "სამგორი", en: "Samgori" },
  { code: "temka", ka: "თემქა", en: "Temka" },
  { code: "mukhiani", ka: "მუხიანი", en: "Mukhiani" },
  { code: "vazisubani", ka: "ვაზისუბანი", en: "Vazisubani" },
  { code: "vashlijvari", ka: "ვაშლიჯვარი", en: "Vashlijvari" },
  { code: "lisi", ka: "ლისის ტბა", en: "Lisi Lake" },
  { code: "avlabari", ka: "ავლაბარი", en: "Avlabari" },
  { code: "mtatsminda", ka: "მთაწმინდა", en: "Mtatsminda" },
  { code: "sololaki", ka: "სოლოლაკი", en: "Sololaki" },
  { code: "vera", ka: "ვერა", en: "Vera" },
  { code: "bagebi", ka: "ბაგები", en: "Bagebi" },
  // long tail, alphabetical by Georgian name
  { code: "abanotubani", ka: "აბანოთუბანი", en: "Abanotubani" },
  { code: "avchala", ka: "ავჭალა", en: "Avchala" },
  { code: "afrika", ka: "აფრიკა", en: "Afrika" },
  { code: "giorgitsminda", ka: "გიორგიწმინდა", en: "Giorgitsminda" },
  { code: "gldanula", ka: "გლდანულა", en: "Gldanula" },
  { code: "elia", ka: "ელია", en: "Elia" },
  { code: "vazha-kvartlebi", ka: "ვაჟა-ფშაველას კვარტლები", en: "Vazha-Pshavela Quarters" },
  { code: "vedzisi", ka: "ვეძისი", en: "Vedzisi" },
  { code: "zahesi", ka: "ზაჰესი", en: "Zahesi" },
  { code: "ivertubani", ka: "ივერთუბანი", en: "Ivertubani" },
  { code: "kiketi", ka: "კიკეთი", en: "Kiketi" },
  { code: "koniaki", ka: "კონიაკის დასახლება", en: "Koniaki Settlement" },
  { code: "krtsanisi", ka: "კრწანისი", en: "Krtsanisi" },
  { code: "kukia", ka: "კუკია", en: "Kukia" },
  { code: "lotkini", ka: "ლოტკინი", en: "Lotkini" },
  { code: "mesame-masivi", ka: "მესამე მასივი", en: "Third Massive" },
  { code: "moscow-ave", ka: "მოსკოვის გამზირი", en: "Moscow Avenue" },
  { code: "navtlughi", ka: "ნავთლუღი", en: "Navtlughi" },
  { code: "okrokana", ka: "ოქროყანა", en: "Okrokana" },
  { code: "sopeli-dighomi", ka: "სოფ. დიღომი", en: "Dighomi Village" },
  { code: "tabakhmela", ka: "ტაბახმელა", en: "Tabakhmela" },
  { code: "shindisi", ka: "შინდისი", en: "Shindisi" },
  { code: "tskneti", ka: "წყნეთი", en: "Tskneti" },
];

const BY_CODE = new Map(DISTRICTS.map((d) => [d.code, d.ka]));
const EN_BY_CODE = new Map(DISTRICTS.map((d) => [d.code, d.en]));

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

export function englishDistrictLabel(code: string | null | undefined): string | null {
  return (code && EN_BY_CODE.get(code)) || null;
}
