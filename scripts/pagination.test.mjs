/**
 * CATALOGUE PAGINATION — behavioural contract.
 *
 * The defect being repaired (measured 2026-08-17): live listings 11757 and
 * 11759 rendered on BOTH page 1 and page 2, because `fetchRailPlan()` chose its
 * rail cards with `Math.random()` on a force-dynamic page, and those changing
 * ids were excluded from the feed BEFORE `(page-1)*24` was applied. Page 1 and
 * page 2 were therefore offsets into two different ordered sets.
 *
 * ⚠️ NEGATIVE CONTROL FIRST. `walkWithUnstableRails()` below reproduces the OLD
 * behaviour — a fresh random rail arrangement per request — over the SAME fixed
 * inventory these tests use, and asserts that it repeats an id. If that test
 * ever goes green, this suite has stopped being able to detect the defect it
 * exists for, and every other assertion here is worthless (Article III-B: a
 * probe never observed failing is not yet evidence).
 *
 * Every walk asserts the whole rendered surface — rails AND feed — because the
 * contract is about catalogue identities, not about one query's rows.
 *
 * ⚠️ Identity here is the `id` column only. Nothing in this file may treat two
 * different ids as the same listing on the basis of phone, address, rooms,
 * area, floor, price or images: apartment identity is the backend's law and
 * arrives already applied through `canonical_id`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";

import { createFakeSupabase } from "./fake-postgrest.mjs";
import { __setSupabaseClientForTests } from "../lib/supabase.ts";
import { fetchFeed, fetchRailPlan, PAGE_SIZE } from "../lib/listings.ts";
import { parseFilters } from "../lib/filters.ts";
import {
  decodeCursor,
  encodeCursor,
  keysetExpression,
  mulberry32,
  parseRailSeed,
  seededShuffle,
} from "../lib/pagination.ts";

afterEach(() => __setSupabaseClientForTests(null));

/* ------------------------------------------------------------- fixed inventory */

const HOUR = 60 * 60 * 1000;

/**
 * A fixed catalogue. Deliberately includes:
 *  - more rows than three pages, so a shifted window has room to show;
 *  - price-drop rows recent enough to feed the rail (so exclusions are real);
 *  - repeated `first_seen_at` values, so the id tie-break is exercised;
 *  - rows whose price_sort is null, so NULLS LAST is exercised.
 * Ids 11757 and 11759 are the two the production defect actually repeated.
 */
function inventory({ extra = [], removeIds = [], now = Date.now() } = {}) {
  const rows = [];
  for (let i = 0; i < 90; i++) {
    const id = 11700 + i;
    // Two rows share each timestamp, which is what makes a tie-break load-bearing.
    const seenAt = new Date(now - Math.floor(i / 2) * HOUR).toISOString();
    // A handful of out-of-bound prices: displayed as «ფასი მოთხოვნით», ranked null.
    const insane = i % 17 === 0;
    // Drops must satisfy the real product predicate (isHonestRecentSaleDrop):
    // $1k–$50k and 1–25% off, within 7 days.
    //
    // ⚠️ TWO PROPERTIES HERE ARE LOAD-BEARING FOR THE NEGATIVE CONTROL, and
    // getting either wrong produces a control that passes while detecting
    // nothing — the "probe never observed failing" trap:
    //
    //   1. the pool must be BIGGER than PRICE_DROP_RAIL_SIZE (8), or every seed
    //      picks the same eight cards in a different order and the excluded SET
    //      never changes;
    //   2. the drops must be SCATTERED THROUGH THE ORDERING rather than packed
    //      into the newest rows. Exclusions confined to the top of the feed
    //      remove the same prefix whichever ones they are, so the remaining
    //      set — and therefore every page — is identical no matter what the
    //      shuffle chose. Production looks like this fixture: a listing added
    //      three weeks ago can drop its price yesterday, which puts an excluded
    //      id deep inside page 2's range.
    //
    // ⚠️ The drop TIME is deliberately independent of the arrival time. The
    // rail prefers its 48h window and only widens to 7d when that is thin, so
    // dropping the price of old listings recently is what produces a pool the
    // shuffle can actually choose from — and it is also what production looks
    // like, which is why the excluded ids land deep in the feed rather than in
    // a prefix that cancels out.
    const isDrop = i % 5 === 0 && !insane;
    const price = insane ? 12 : 60000 + (i % 12) * 1000;
    rows.push({
      id,
      deal_type: "sale",
      district: "საბურთალო",
      district_code: i % 3 === 0 ? "saburtalo" : i % 3 === 1 ? "vake" : "gldani",
      rooms: "2",
      price_usd: price,
      price_sort: insane ? null : price,
      price_drop_from_usd: isDrop ? price + 5000 : null,
      price_dropped_at: isDrop ? new Date(now - ((i % 40) + 1) * HOUR).toISOString() : null,
      area: 55,
      floor: "4/9",
      first_seen_at: seenAt,
      last_seen_at: seenAt,
      last_checked_at: seenAt,
      image_status: "ready",
      has_phone: true,
      phone: "+995555000000",
      condition_code: null,
    });
  }
  const kept = rows.filter((r) => !removeIds.includes(r.id));
  return [...kept, ...extra];
}

function install(rows) {
  const fake = createFakeSupabase({
    listings_public: rows,
    listing_images_served: [],
    listing_images: [],
    listings_hot: [],
  });
  __setSupabaseClientForTests(fake);
  return fake;
}

function filtersFor(params = {}) {
  return parseFilters({ deal: "sale", ...params });
}

/* ------------------------------------------------------------------ the walks */

/**
 * Walk the catalogue exactly as the site does: plan the rails, then load each
 * page, following the cursor the previous page handed out — the same handoff
 * the Pagination component performs through the URL.
 */
async function walk({ rows, seed = 4242, pages = 4, sort = "new", mutate = null }) {
  install(rows);
  const plan = await fetchRailPlan("sale", 3, seed);
  const railIds = [
    ...plan.justAdded.listings.map((l) => l.id),
    ...plan.priceDrops.listings.map((l) => l.id),
    ...plan.districts.flatMap((d) => d.listings.map((l) => l.id)),
  ];

  const seen = [];
  let cursorParam = {};
  let current = rows;
  for (let page = 1; page <= pages; page++) {
    if (mutate && page > 1) {
      current = mutate(current, page);
      install(current);
      // The rails are re-planned per request in production too; with a stable
      // seed they must land on the same ids, which walkStability asserts.
      await fetchRailPlan("sale", 3, seed);
    }
    const filters = { ...filtersFor({ sort, ...cursorParam }), page };
    const result = await fetchFeed(filters, plan.shownIds);
    if (result.listings.length === 0) break;
    seen.push(...result.listings.map((l) => l.id));
    if (!result.nextCursor) break;
    cursorParam = { after: encodeCursor(result.nextCursor) };
  }
  return { railIds, feedIds: seen, plan };
}

/**
 * ⚠️ THE NEGATIVE CONTROL — the pre-repair behaviour, reconstructed.
 *
 * Rails are re-planned with a DIFFERENT seed per request (what `Math.random()`
 * did on a force-dynamic page), and pages are taken by OFFSET, which is what
 * `fetchFeed` did before the keyset window. Nothing here calls the repaired
 * path, so this control cannot be silently fixed by the repair — it fails
 * against the repaired tree exactly as it failed against the broken one, which
 * is what makes the green tests below mean something.
 */
async function walkWithUnstableRails({ rows, pages = 3 }) {
  const seen = [];
  for (let page = 1; page <= pages; page++) {
    install(rows);
    // A fresh arrangement for every request — the defect's root cause.
    const plan = await fetchRailPlan("sale", 3, 1000 + page * 7919);
    const filters = { ...filtersFor(), page };
    // Offset window over a set the rails just changed.
    const result = await fetchFeed(filters, plan.shownIds);
    seen.push(...result.listings.map((l) => l.id));
  }
  return seen;
}

function duplicates(ids) {
  const count = new Map();
  for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

/* ------------------------------------------------------- 1. negative control */

test("NEGATIVE CONTROL: unstable rail exclusions + offset paging repeat an id", async () => {
  const repeated = duplicates(await walkWithUnstableRails({ rows: inventory() }));
  assert.ok(
    repeated.length > 0,
    "the control must reproduce the measured defect; if it cannot, this suite " +
      "cannot detect a regression and its green results prove nothing"
  );
});

test("NEGATIVE CONTROL: a changing seed really does change the excluded set", async () => {
  install(inventory());
  const a = await fetchRailPlan("sale", 3, 11);
  const b = await fetchRailPlan("sale", 3, 22);
  assert.notDeepEqual(
    a.shownIds,
    b.shownIds,
    "different seeds must produce different rails, or the control above is vacuous"
  );
});

/* ------------------------------------------------- 2. the repaired contract */

test("repaired: no id repeats or goes missing across a full paginated walk", async () => {
  const rows = inventory();
  const { railIds, feedIds } = await walk({ rows, pages: 10 });

  assert.deepEqual(duplicates(feedIds), [], "a listing appeared on two pages");
  const overlap = feedIds.filter((id) => railIds.includes(id));
  assert.deepEqual(overlap, [], "a rail listing also appeared in the feed");

  // Every catalogue identity is rendered exactly once across the whole surface.
  const rendered = [...railIds, ...feedIds];
  assert.deepEqual(duplicates(rendered), []);
  assert.deepEqual(
    [...new Set(rendered)].sort((a, b) => a - b),
    rows.map((r) => r.id).sort((a, b) => a - b),
    "the walk must cover the catalogue exactly — no skipped identities"
  );
});

test("repaired: the walk is identical under every shuffle seed", async () => {
  const rows = inventory();
  const results = [];
  for (const seed of [1, 7, 99, 123456, 4294967295]) {
    const { railIds, feedIds } = await walk({ rows, seed, pages: 10 });
    assert.deepEqual(duplicates(feedIds), [], `seed ${seed} repeated a listing`);
    assert.deepEqual(
      duplicates([...railIds, ...feedIds]),
      [],
      `seed ${seed} rendered a listing twice across rails and feed`
    );
    results.push([...railIds, ...feedIds].sort((a, b) => a - b));
  }
  // Different seeds arrange the rails differently, but the SET of rendered
  // identities is invariant — rotation may not cost a visitor any inventory.
  for (const r of results) assert.deepEqual(r, results[0]);
});

test("repaired: one seed reproduces byte-identical exclusions on every page", async () => {
  const rows = inventory();
  install(rows);
  const first = await fetchRailPlan("sale", 3, 31337);
  install(rows);
  const second = await fetchRailPlan("sale", 3, 31337);
  assert.deepEqual(first.shownIds, second.shownIds);
  assert.deepEqual(
    first.priceDrops.listings.map((l) => l.id),
    second.priceDrops.listings.map((l) => l.id)
  );
});

/* --------------------------------------------- 3. inventory changes mid-walk */

test("a listing arriving between requests does not shift the next page", async () => {
  const rows = inventory();
  const arrival = {
    ...rows[0],
    id: 99999,
    // Newest possible: under offset paging this pushes every row down one and
    // makes page 2 re-serve the last row of page 1.
    first_seen_at: new Date(Date.UTC(2026, 7, 18, 12)).toISOString(),
  };
  const { railIds, feedIds } = await walk({
    rows,
    pages: 6,
    mutate: (current, page) => (page === 2 ? [arrival, ...current] : current),
  });
  assert.deepEqual(duplicates(feedIds), [], "an arrival re-served a listing");
  assert.deepEqual(duplicates([...railIds, ...feedIds]), []);
});

test("a listing removed between requests does not skip its neighbour", async () => {
  const rows = inventory();
  install(rows);
  const plan = await fetchRailPlan("sale", 3, 5150);
  // Take page 1, then delete a row that page 1 already rendered.
  const page1 = await fetchFeed({ ...filtersFor(), page: 1 }, plan.shownIds);
  const victim = page1.listings[3].id;
  const shrunk = inventory({ removeIds: [victim] });
  install(shrunk);
  const page2 = await fetchFeed(
    { ...filtersFor({ after: encodeCursor(page1.nextCursor) }), page: 2 },
    plan.shownIds
  );

  const ids = [...page1.listings.map((l) => l.id), ...page2.listings.map((l) => l.id)];
  assert.deepEqual(duplicates(ids), [], "a removal repeated a listing");
  // The row directly after page 1's boundary must still be page 2's first row:
  // an offset window would have skipped it once the catalogue shrank.
  const stillVisible = shrunk
    .filter((r) => !plan.shownIds.includes(r.id))
    .sort(
      (a, b) =>
        b.first_seen_at.localeCompare(a.first_seen_at) || a.id - b.id
    );
  const boundary = stillVisible.findIndex((r) => r.id === page1.nextCursor.id);
  assert.equal(page2.listings[0].id, stillVisible[boundary + 1].id);
});

/* --------------------------------------------------------- 4. price sorting */

for (const sort of ["price_asc", "price_desc"]) {
  test(`${sort}: monotonic, deterministic, and free of repeats across pages`, async () => {
    const rows = inventory();
    // Price sorts hide the rails (isPriceSort), so the feed is the whole set.
    install(rows);
    const collected = [];
    const keys = [];
    let cursorParam = {};
    for (let page = 1; page <= 10; page++) {
      const result = await fetchFeed({ ...filtersFor({ sort, ...cursorParam }), page }, []);
      if (result.listings.length === 0) break;
      collected.push(...result.listings.map((l) => l.id));
      keys.push(...result.listings.map((l) => l.price_sort ?? null));
      if (!result.nextCursor) break;
      cursorParam = { after: encodeCursor(result.nextCursor) };
    }

    assert.deepEqual(duplicates(collected), [], `${sort} repeated a listing`);
    assert.equal(collected.length, rows.length, `${sort} skipped listings`);

    // Ordering: monotonic within the non-null region, and every null last.
    const firstNull = keys.indexOf(null);
    const nonNull = firstNull === -1 ? keys : keys.slice(0, firstNull);
    assert.ok(
      !nonNull.includes(null),
      "a priced listing sorted after «ფასი მოთხოვნით» — NULLS LAST was lost"
    );
    for (let i = 1; i < nonNull.length; i++) {
      assert.ok(
        sort === "price_asc" ? nonNull[i] >= nonNull[i - 1] : nonNull[i] <= nonNull[i - 1],
        `${sort} broke monotonicity at index ${i}`
      );
    }
  });
}

test("price sorts break ties by id, so equal prices cannot swap between pages", async () => {
  const rows = inventory();
  install(rows);
  const first = await fetchFeed({ ...filtersFor({ sort: "price_asc" }), page: 1 }, []);
  install(rows);
  const again = await fetchFeed({ ...filtersFor({ sort: "price_asc" }), page: 1 }, []);
  assert.deepEqual(
    first.listings.map((l) => l.id),
    again.listings.map((l) => l.id)
  );
  for (let i = 1; i < first.listings.length; i++) {
    const prev = first.listings[i - 1];
    const cur = first.listings[i];
    if (prev.price_sort === cur.price_sort) {
      assert.ok(cur.id > prev.id, "tied prices are not ordered by id");
    }
  }
});

/* ---------------------------------------------------- 5. navigation with rails */

test("page navigation with rails: forward then back lands on the same rows", async () => {
  const rows = inventory();
  install(rows);
  const plan = await fetchRailPlan("sale", 3, 8080);
  const page1 = await fetchFeed({ ...filtersFor(), page: 1 }, plan.shownIds);
  const page2 = await fetchFeed(
    { ...filtersFor({ after: encodeCursor(page1.nextCursor) }), page: 2 },
    plan.shownIds
  );
  // The «წინა» link carries the current page's leading boundary.
  const back = await fetchFeed(
    { ...filtersFor({ before: encodeCursor(page2.prevCursor) }), page: 1 },
    plan.shownIds
  );
  assert.deepEqual(
    back.listings.map((l) => l.id),
    page1.listings.map((l) => l.id),
    "going back produced a different page 1"
  );
  assert.equal(page1.listings.length, PAGE_SIZE);
});

test("rails render the same ids on page 2 as on page 1 for one seed", async () => {
  const rows = inventory();
  install(rows);
  const onPage1 = await fetchRailPlan("sale", 3, 606);
  install(rows);
  const onPage2 = await fetchRailPlan("sale", 3, 606);
  assert.deepEqual(
    onPage1.districts.flatMap((d) => d.listings.map((l) => l.id)),
    onPage2.districts.flatMap((d) => d.listings.map((l) => l.id))
  );
});

test("the feed excludes exactly what the rails rendered — no more, no less", async () => {
  const rows = inventory();
  install(rows);
  const plan = await fetchRailPlan("sale", 3, 2026);
  const rendered = new Set([
    ...plan.justAdded.listings.map((l) => l.id),
    ...plan.priceDrops.listings.map((l) => l.id),
    ...plan.districts.flatMap((d) => d.listings.map((l) => l.id)),
  ]);
  // Excluding MORE than was rendered would silently delete inventory from the
  // catalogue; excluding less would repeat a card on the same screen.
  assert.deepEqual([...rendered].sort((a, b) => a - b), plan.shownIds);
});

/* --------------------------------------------------------- 6. cursor mechanics */

test("cursors round-trip and refuse anything they cannot reproduce", () => {
  for (const cursor of [
    { key: "2026-08-17T10:00:00.000Z", id: 11757 },
    { key: 60000, id: 1 },
    { key: null, id: 42 },
  ]) {
    assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
  }
  for (const bad of [
    undefined,
    "",
    "not-base64!!",
    Buffer.from("[9,1,2]").toString("base64url"), // wrong version
    Buffer.from('[1,"k",0]').toString("base64url"), // id must be positive
    Buffer.from('[1,"k","x"]').toString("base64url"), // id must be numeric
    Buffer.from("{}").toString("base64url"),
  ]) {
    assert.equal(decodeCursor(bad), null, `accepted a cursor it cannot reproduce: ${bad}`);
  }
});

test("keyset expressions quote timestamps and place nulls last", () => {
  const ts = "2026-08-17T10:00:00+00:00";
  const forward = keysetExpression("new", { key: ts, id: 500 }, "after");
  assert.ok(forward.includes(`"${ts}"`), "timestamp must be quoted for PostgREST");
  assert.ok(forward.includes("first_seen_at.lt."), "newest-first advances downward");
  assert.ok(forward.includes("and(first_seen_at.eq."), "ties resolve on id");
  assert.ok(!forward.includes("is.null"), "first_seen_at is NOT NULL — no null term");

  const asc = keysetExpression("price_asc", { key: 1000, id: 5 }, "after");
  assert.ok(asc.includes("price_sort.gt.1000"));
  assert.ok(asc.includes("price_sort.is.null"), "the null tail is still ahead");

  const tail = keysetExpression("price_asc", { key: null, id: 5 }, "after");
  assert.equal(tail, "and(price_sort.is.null,id.gt.5)");

  const back = keysetExpression("price_asc", { key: 1000, id: 5 }, "before");
  assert.ok(back.includes("price_sort.lt.1000"));
  assert.ok(!back.includes("price_sort.is.null"), "nothing null precedes a priced row");
});

test("an undecodable cursor degrades to the legacy offset page, not a random window", async () => {
  const rows = inventory();
  install(rows);
  const plan = await fetchRailPlan("sale", 3, 77);
  // An old `?page=2` bookmark carries no cursor at all and must still work, so
  // "no usable cursor" means the offset path — the behaviour that shipped
  // before this repair. A tampered cursor lands in exactly that path rather
  // than in a window derived from half-parsed input.
  const bookmarked = await fetchFeed({ ...filtersFor(), page: 2 }, plan.shownIds);
  const tampered = await fetchFeed(
    { ...filtersFor({ after: "wat" }), page: 2 },
    plan.shownIds
  );
  assert.deepEqual(
    tampered.listings.map((l) => l.id),
    bookmarked.listings.map((l) => l.id)
  );
  assert.equal(parseFilters({ after: "wat" }).cursor, undefined);
  // And it must not silently become page 1 either — the visitor asked for 2.
  const page1 = await fetchFeed({ ...filtersFor(), page: 1 }, plan.shownIds);
  assert.notDeepEqual(
    tampered.listings.map((l) => l.id),
    page1.listings.map((l) => l.id)
  );
});

test("the seeded shuffle is a permutation, and the seed parser fails closed", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(seededShuffle(items, 5), seededShuffle(items, 5));
  assert.deepEqual(
    seededShuffle(items, 5).slice().sort((a, b) => a - b),
    items,
    "shuffling must not add, drop or duplicate an item"
  );
  assert.notDeepEqual(seededShuffle(items, 5), seededShuffle(items, 6));
  // The generator must not be degenerate.
  const rand = mulberry32(1);
  const draws = new Set(Array.from({ length: 50 }, () => rand()));
  assert.ok(draws.size > 40);

  for (const bad of ["", "-1", "abc", "99999999999", undefined, "1.5"]) {
    assert.equal(parseRailSeed(bad), null, `accepted seed ${bad}`);
  }
  assert.equal(parseRailSeed("4294967295"), 4294967295);
  assert.equal(parseRailSeed(["17"]), 17);
});

/* ------------------------------------------------- 7. the URL carries the plan */

const PAGINATION_COMPONENT = readFileSync(
  fileURLToPath(new URL("../components/Pagination.tsx", import.meta.url)),
  "utf8"
);
const PAGE_COMPONENT = readFileSync(
  fileURLToPath(new URL("../app/page.tsx", import.meta.url)),
  "utf8"
);

test("page links carry the cursor, and the seed reaches them", () => {
  assert.match(PAGINATION_COMPONENT, /encodeCursor\(cursor\)/);
  assert.match(PAGINATION_COMPONENT, /CURSOR_AFTER_PARAM/);
  assert.match(PAGINATION_COMPONENT, /CURSOR_BEFORE_PARAM/);
  // Both boundary params are dropped before a new one is set, or a forward
  // link would inherit the previous page's backward boundary.
  assert.match(
    PAGINATION_COMPONENT,
    /if \(key === CURSOR_AFTER_PARAM \|\| key === CURSOR_BEFORE_PARAM\) continue;/
  );
  // The feed's own links must be built from the SEEDED params, not the raw ones.
  assert.match(PAGE_COMPONENT, /searchParams=\{seededParams\}/);
  assert.match(PAGE_COMPONENT, /parseRailSeed\(searchParams\[RAIL_SEED_PARAM\]\) \?\? mintRailSeed\(\)/);
});

test("the window is never a filter: cursors stay out of the funnel predicates", () => {
  const withCursor = parseFilters({
    deal: "sale",
    after: encodeCursor({ key: 1, id: 2 }),
    page: "3",
  });
  // hasActiveFilters drives filter_apply; a page turn is not a filter.
  const filtersModule = readFileSync(
    fileURLToPath(new URL("../lib/filters.ts", import.meta.url)),
    "utf8"
  );
  const predicates = filtersModule.slice(filtersModule.indexOf("export function hasNarrowingFilters"));
  assert.ok(!predicates.includes("cursor"), "a cursor leaked into the funnel predicates");
  assert.equal(withCursor.cursorDirection, "after");
  assert.equal(withCursor.page, 3);
});

/* ------------------------------- 8. aliases stay out of the effective view */

/**
 * The pagination contract assumes `listings_public` never serves a dedupe
 * alias — that is what makes "one apartment, one identity" true before the
 * feed ever runs, and it is why this file may compare ids and nothing else.
 *
 * ⚠️ Asserted against the LATEST view migration, discovered rather than named,
 * so adding sql/024 without the predicate fails here instead of silently
 * republishing aliases.
 */
test("the latest effective listings_public still excludes canonical aliases", async () => {
  const { readdirSync } = await import("node:fs");
  const sqlDir = fileURLToPath(new URL("../sql", import.meta.url));
  const viewFiles = readdirSync(sqlDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .filter((f) => {
      const body = readFileSync(`${sqlDir}/${f}`, "utf8");
      return /CREATE\s+OR\s+REPLACE\s+VIEW\s+listings_public/i.test(body);
    })
    .sort();
  assert.ok(viewFiles.length > 0, "no listings_public migration found");

  const latest = viewFiles[viewFiles.length - 1];
  const body = readFileSync(`${sqlDir}/${latest}`, "utf8");
  assert.match(body, /canonical_id IS NULL/i, `${latest} stopped excluding aliases`);
  assert.match(body, /published = true/i, `${latest} stopped requiring published`);
  assert.match(body, /listing_status = 'active'/i, `${latest} stopped requiring active`);
  assert.match(body, /removed_at IS NULL/i, `${latest} stopped excluding removed rows`);
  assert.match(
    body,
    /description_status IS DISTINCT FROM 'flagged_agent'/i,
    `${latest} stopped excluding agent-flagged rows`
  );
});
