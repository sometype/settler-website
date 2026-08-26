import { englishDistrictLabel } from "./districts";
import { sanePriceUsd } from "./prices";

const MKHEDRULI_RE = /[\u10A0-\u10FF]/u;
const CYRILLIC_RE = /[\u0400-\u052F]/u;
const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/u;
const LATIN_RE = /[A-Za-z]/g;

const GEORGIAN_TO_LATIN: Record<string, string> = {
  "ა": "a", "ბ": "b", "გ": "g", "დ": "d", "ე": "e", "ვ": "v",
  "ზ": "z", "თ": "t", "ი": "i", "კ": "k", "ლ": "l", "მ": "m",
  "ნ": "n", "ო": "o", "პ": "p", "ჟ": "zh", "რ": "r", "ს": "s",
  "ტ": "t", "უ": "u", "ფ": "p", "ქ": "k", "ღ": "gh", "ყ": "q",
  "შ": "sh", "ჩ": "ch", "ც": "ts", "ძ": "dz", "წ": "ts", "ჭ": "ch",
  "ხ": "kh", "ჯ": "j", "ჰ": "h",
};

export type EnglishListingInput = {
  id: number;
  deal_type: "rent" | "sale";
  district: string | null;
  district_code: string | null;
  street_display?: string | null;
  rooms: string | number | null;
  price_usd: number | null;
  area: number | null;
  floor: string | null;
  description?: string | null;
  description_ka?: string | null;
};

export type EnglishListingPresentation = {
  id: number;
  district: string;
  street: string | null;
  rooms: string | null;
  price: string | null;
  area: string | null;
  floor: string | null;
  description: string | null;
  title: string;
};

export function containsMkhedruli(value: string): boolean {
  return MKHEDRULI_RE.test(value);
}

function tidy(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function transliterateGeorgian(value: string): string | null {
  const transliterated = [...value]
    .map((char) => GEORGIAN_TO_LATIN[char] ?? char)
    .join("");
  const cleaned = tidy(transliterated);
  if (!cleaned || MKHEDRULI_RE.test(cleaned)) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function safeEnglishStreet(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = tidy(value);
  if (!cleaned) return null;
  if (CYRILLIC_RE.test(cleaned) || CJK_RE.test(cleaned)) return null;
  if (MKHEDRULI_RE.test(cleaned)) return transliterateGeorgian(cleaned);
  return (cleaned.match(LATIN_RE)?.length ?? 0) > 0 ? cleaned : null;
}

export function englishOwnerDescription(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = tidy(value);
  if (!cleaned || MKHEDRULI_RE.test(cleaned) || CYRILLIC_RE.test(cleaned) || CJK_RE.test(cleaned)) {
    return null;
  }
  return (cleaned.match(LATIN_RE)?.length ?? 0) >= 20 ? cleaned : null;
}

export function roomsLabelEn(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim();
  if (/^studio$/iu.test(normalized) || normalized === "0") return "Studio";
  if (/^\d+$/u.test(normalized)) {
    return `${normalized} ${normalized === "1" ? "room" : "rooms"}`;
  }
  return null;
}

export function englishRentPrice(value: number | null | undefined): string | null {
  const sane = sanePriceUsd(value, "rent");
  return sane === null ? null : `$${sane.toLocaleString("en-US")} / month`;
}

function safeFloor(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = tidy(value);
  return /^[0-9]+(?:\s*\/\s*[0-9]+)?$/u.test(cleaned) ? cleaned.replace(/\s+/gu, "") : null;
}

export function englishListingPresentation(
  listing: EnglishListingInput
): EnglishListingPresentation | null {
  if (listing.deal_type !== "rent") return null;

  const district =
    englishDistrictLabel(listing.district_code) ??
    safeEnglishStreet(listing.district) ??
    "Tbilisi";
  const rooms = roomsLabelEn(listing.rooms);
  const street = safeEnglishStreet(listing.street_display);
  const description = englishOwnerDescription(listing.description);
  const title = rooms ? `${rooms} apartment in ${district}` : `Apartment in ${district}`;

  const presentation: EnglishListingPresentation = {
    id: listing.id,
    district,
    street,
    rooms,
    price: englishRentPrice(listing.price_usd),
    area:
      listing.area !== null && Number.isFinite(listing.area) && listing.area > 0
        ? `${listing.area} m²`
        : null,
    floor: safeFloor(listing.floor),
    description,
    title,
  };
  return containsMkhedruli(JSON.stringify(presentation)) ? null : presentation;
}

const AMENITY_LABELS: Record<string, string> = {
  furniture: "Furnished",
  air_conditioning: "Air conditioning",
  heating: "Heating",
  hot_water: "Hot water",
  gas: "Natural gas",
  internet: "Internet",
  tv: "TV",
  washing_machine: "Washing machine",
  fridge: "Refrigerator",
  stove: "Stove",
  oven: "Oven",
  dishwasher: "Dishwasher",
  kitchen: "Equipped kitchen",
  elevator: "Elevator",
  parking: "Parking",
  garage: "Garage",
  storage: "Storage",
  pets_allowed: "Pets allowed",
  pool: "Pool",
  metro_nearby: "Near metro",
  coded_door: "Coded entrance",
  alarm: "Alarm",
  guard: "Security",
  gym: "Gym",
  fireplace: "Fireplace",
};

export function englishAmenities(map: Record<string, boolean> | null | undefined): string[] {
  if (!map) return [];
  return Object.entries(AMENITY_LABELS)
    .filter(([key]) => map[key] === true)
    .map(([, label]) => label);
}
