import type { FeedFilters } from "./types";

export type SearchParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s.trim() : undefined;
}

function num(v: string | string[] | undefined): number | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export function parseFilters(params: SearchParams): FeedFilters {
  const source = str(params.source);
  const rooms = str(params.rooms);
  return {
    district: str(params.district),
    minPrice: num(params.min),
    maxPrice: num(params.max),
    rooms: rooms && ["1", "2", "3", "4", "5+"].includes(rooms) ? rooms : undefined,
    source: source === "myhome" || source === "ss" ? source : undefined,
    page: Math.max(1, num(params.page) ?? 1),
  };
}

export function hasActiveFilters(f: FeedFilters): boolean {
  return Boolean(
    f.district || f.minPrice !== undefined || f.maxPrice !== undefined || f.rooms || f.source
  );
}
