/**
 * The location line: district plus, when it adds something, the street.
 *
 * ⚠️ THE VALUE IS NOT ALWAYS A STREET, WHICH IS WHY THE LABEL IS `მდებარეობა`.
 * `street_display` deliberately carries microdistricts and settlements as well
 * as streets — `დიღომი 8`, `ვარკეთილი 3- 4 მ/რ`, `თემქა - ზღვისუბანი X კვარტ.`
 * Measured 2026-08-05: ~14% of live values are place-type or unclassifiable, so
 * a `ქუჩა` ("street") label would be plainly false on one card in seven.
 *
 * ⚠️ IT NEVER CONTAINS A HOUSE NUMBER. The owner's phone is public, so street +
 * number + phone would be a doorstep rather than a listing. That is enforced
 * upstream in normalize_lib.street_display(), which fails closed, plus a
 * reviewed allow/deny list for every value carrying a digit. Nothing in this
 * file may reconstruct or infer one. See STREETDISCUSSION.md.
 */

/** Characters that may bound a token. Note `.` is here as a BOUNDARY only. */
const BOUNDARY = "\\s.,\\-–—;:()";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove the district's own name from the location, when it appears as a whole
 * token. `დიღმის მასივი · დიღმის მასივი - III კვარტალი` reads as a stutter; the
 * useful half is `III კვარტალი`.
 *
 * ⚠️⚠️ WHOLE TOKENS ONLY — NEVER `String.replace` ON THE RAW TEXT. Georgian is
 * agglutinative, so a district name is routinely a PREFIX of a different word:
 * `კრწანისი` (the district) opens `კრწანისის ქ.` (a street named after it), and
 * `გლდანი` sits inside `გლდანისხევის ქ.`, which is somewhere else entirely.
 * Substring trimming mangles both. This exact prefix-vs-token confusion already
 * caused a house-number leak once in the normalizer (2026-07-30) and is the
 * reason that rule is token-anchored too.
 *
 * Returns null when nothing meaningful survives, so the caller shows the
 * district alone rather than an empty separator.
 */
export function trimDistrictFromLocation(
  location: string,
  districtName: string | null | undefined
): string | null {
  const trimmed = location.trim();
  if (!trimmed) return null;
  const district = districtName?.trim();
  if (!district) return trimmed;

  // ⚠️ EDIT IN PLACE — do NOT split into tokens and rejoin. Rejoining with
  // spaces destroys the abbreviation dots that carry the meaning: `ქ.` and
  // `გამზ.` are "street" and "avenue", and `პეკინის გამზ.` rendered as
  // `პეკინის გამზ` is simply wrong. The normalizer learned the same lesson —
  // its `_street_clean` deliberately preserves a trailing dot for exactly this
  // reason. Caught here by a unit test before it ever rendered.
  const bounded = new RegExp(
    `(^|[${BOUNDARY}])${escapeRegExp(district)}($|[${BOUNDARY}])`,
    "giu"
  );
  // Collapse the whole match — including BOTH boundary characters — to a single
  // space, then tidy. Preserving the boundaries individually left orphans:
  // "ც.დადიანის ქ. (ნაძალადევი)" kept its opening bracket. A space is safe
  // because "A - B" still reads as "A" or "B" once the edges are stripped.
  let out = trimmed.replace(bounded, " ");

  out = out
    .replace(/\(\s*\)/gu, "")            // the district was the whole parenthetical
    .replace(/\s{2,}/gu, " ")
    .replace(new RegExp(`^[${BOUNDARY}]+`, "u"), "")
    .replace(new RegExp(`[\\s,\\-–—;:]+$`, "u"), "")   // NB: not `.` — see above
    .trim();

  // Everything was the district itself ("ვაშლიჯვარი" under ვაშლიჯვარი), or all
  // that survives is separator noise.
  return out.length > 0 ? out : null;
}

/**
 * The location line for a card or detail page: `district · street`, or just the
 * district when the street adds nothing, or just the street when the district is
 * unknown. Null when there is nothing to say — the caller renders no line at all
 * rather than a placeholder.
 */
export function locationLine(
  districtName: string | null | undefined,
  streetDisplay: string | null | undefined
): string | null {
  const district = districtName?.trim() || null;
  const street = streetDisplay?.trim() || null;
  if (!street) return district;
  const extra = trimDistrictFromLocation(street, district);
  if (!district) return extra;
  return extra ? `${district} · ${extra}` : district;
}
