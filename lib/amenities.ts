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

/*
 * ⚠️ AMENITIES ARE DISPLAY-ONLY. There is deliberately no filter subset here.
 *
 * Eight amenity chips used to sit on the feed. Removed 2026-07-29 on measured
 * evidence: over 24h they appeared in 6.8% of filter applications but in 48% of
 * every dead-end search — the single biggest source of "no results" on the
 * site. The presence map's semantics are the reason. Absence means UNKNOWN, not
 * "doesn't have", so ANDing several chips silently demands that every one of
 * them was explicitly recorded, and the result set collapses.
 *
 * The data model, the listing-page section and `presentAmenities` all stay —
 * showing what a flat has is useful; making people guess which combination the
 * source happened to record is not. Bringing chips back needs a different data
 * model (a tri-state, not a presence map), not just a new constant.
 */

/** Amenities present on a listing, in display order. */
export function presentAmenities(map: AmenityMap | null | undefined): Amenity[] {
  if (!map) return [];
  return AMENITIES.filter((a) => map[a.key] === true);
}
