/**
 * Canonical amenity keys — mirror of the backend's normalize_lib.py, which
 * extracts them from myhome's parameters list and ss's boolean fields. The
 * view additionally merges facts the description worker read out of the
 * LISTING TEXT (furnished / parking / pets / metro), so an amenity being
 * present means either the source form said so or the owner wrote it.
 *
 * Presence map semantics: absence = UNKNOWN, never "doesn't have".
 */
export type AmenityMap = Record<string, boolean>;

export interface Amenity {
  key: string;
  ka: string;
}

/** Display order on the listing page. Keys missing here don't render. */
export const AMENITIES: Amenity[] = [
  { key: "furniture", ka: "ავეჯი" },
  { key: "air_conditioning", ka: "კონდიციონერი" },
  { key: "heating", ka: "გათბობა" },
  { key: "hot_water", ka: "ცხელი წყალი" },
  { key: "gas", ka: "ბუნებრივი აირი" },
  { key: "internet", ka: "ინტერნეტი" },
  { key: "tv", ka: "ტელევიზორი" },
  { key: "washing_machine", ka: "სარეცხი მანქანა" },
  { key: "fridge", ka: "მაცივარი" },
  { key: "stove", ka: "გაზქურა" },
  { key: "oven", ka: "ღუმელი" },
  { key: "dishwasher", ka: "ჭურჭლის სარეცხი" },
  { key: "kitchen", ka: "სამზარეულო ტექნიკით" },
  { key: "elevator", ka: "ლიფტი" },
  { key: "parking", ka: "პარკინგი" },
  { key: "garage", ka: "გარაჟი" },
  { key: "storage", ka: "სათავსო" },
  { key: "pets_allowed", ka: "ცხოველები დასაშვებია" },
  { key: "pool", ka: "აუზი" },
  { key: "metro_nearby", ka: "მეტროსთან ახლოს" },
  { key: "coded_door", ka: "კოდური კარი" },
  { key: "alarm", ka: "სიგნალიზაცია" },
  { key: "guard", ka: "დაცვა" },
  { key: "gym", ka: "სავარჯიშო დარბაზი" },
  { key: "fireplace", ka: "ბუხარი" },
];

const BY_KEY = new Map(AMENITIES.map((a) => [a.key, a]));

/**
 * The subset offered as feed filter chips — the ones a renter actually
 * searches by, not everything a listing can mention.
 */
export const FILTER_AMENITIES: Amenity[] = [
  "furniture",
  "air_conditioning",
  "heating",
  "elevator",
  "parking",
  "washing_machine",
  "pets_allowed",
  "metro_nearby",
].map((k) => BY_KEY.get(k)!);

export function isFilterAmenity(key: string): boolean {
  return FILTER_AMENITIES.some((a) => a.key === key);
}

/** Amenities present on a listing, in display order. */
export function presentAmenities(map: AmenityMap | null | undefined): Amenity[] {
  if (!map) return [];
  return AMENITIES.filter((a) => map[a.key] === true);
}
