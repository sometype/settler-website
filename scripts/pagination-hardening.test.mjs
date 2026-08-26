/**
 * R1 HARDENING — the two gaps the pagination review measured on candidate
 * 1bda6b5, each with the approved wrong state it has to reject.
 *
 * GAP 1 — stale cursor after a navigation reset. FilterBar, SortBar and
 * EmptyState deleted `page` but preserved `after`/`before`. Once the cursor
 * decides which rows load, dropping only the counter leaves the visitor at
 * "3 ოთახი, page 1" rendering rows positioned by a boundary row from the
 * UNFILTERED collection.
 *
 * GAP 2 — cursor DSL injection / type confusion. Decode accepted arbitrary
 * strings and `keysetExpression` interpolated them into the PostgREST `or=`
 * grammar. Reproduced on 1bda6b5: the key `x"),id.gt.0` produced
 *
 *   first_seen_at.lt."x"),id.gt.0",and(first_seen_at.eq."x"),id.gt.0",id.gt.1)
 *
 * where `")` closes the quoted literal and `id.gt.0` becomes an attacker-chosen
 * OR term. A timestamp cursor was also accepted verbatim under a price sort,
 * comparing text against a numeric column.
 *
 * ⚠️ Every wrong control below was executed against 1bda6b5 before the repair
 * and observed being ACCEPTED. They are recorded here as rejections, so a
 * regression that reopens either gap turns this file red rather than quiet.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";

import { createFakeSupabase } from "./fake-postgrest.mjs";
import { __setSupabaseClientForTests } from "../lib/supabase.ts";
import { fetchFeed, fetchRailPlan } from "../lib/listings.ts";
import {
  CURSOR_AFTER_PARAM,
  CURSOR_BEFORE_PARAM,
  PAGINATION_WINDOW_PARAMS,
  clearPaginationWindow,
  parseFilters,
} from "../lib/filters.ts";
import {
  decodeCursor,
  encodeCursor,
  isSafeCursorKey,
  keysetExpression,
} from "../lib/pagination.ts";

afterEach(() => __setSupabaseClientForTests(null));

const HOUR = 60 * 60 * 1000;

/** Same shape as the main suite's inventory, with district/rooms/price spread
 *  so each filter axis actually narrows to a different collection. */
function inventory({ now = Date.now() } = {}) {
  const rows = [];
  for (let i = 0; i < 90; i++) {
    const insane = i % 17 === 0;
    const isDrop = i % 5 === 0 && !insane;
    const price = insane ? 12 : 60000 + (i % 12) * 1000;
    const seenAt = new Date(now - Math.floor(i / 2) * HOUR).toISOString();
    rows.push({
      id: 11700 + i,
      deal_type: i % 4 === 0 ? "rent" : "sale",
      district: "საბურთალო",
      district_code: i % 3 === 0 ? "saburtalo" : i % 3 === 1 ? "vake" : "gldani",
      rooms: ["1", "2", "3", "4"][i % 4],
      price_usd: price,
      price_sort: insane ? null : price,
      price_drop_from_usd: isDrop ? price + 5000 : null,
      price_dropped_at: isDrop ? new Date(now - ((i % 40) + 1) * HOUR).toISOString() : null,
      area: 40 + (i % 30),
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
  return rows;
}

function install(rows) {
  __setSupabaseClientForTests(
    createFakeSupabase({
      listings_public: rows,
      listing_images_served: [],
      listing_images: [],
      listings_hot: [],
    })
  );
}

/* ===================================================================== GAP 1 */

/**
 * The reset surfaces are client components that call `router.push`, so the
 * assertion is on the URL each one builds. Every surface goes through the same
 * shared helper, so exercising the helper over a page-2 URL is exercising all
 * of them — and the source assertions further down prove each one actually
 * calls it rather than open-coding `delete("page")` again.
 */
function pageTwoParams(extra = {}) {
  const params = new URLSearchParams({
    deal: "sale",
    page: "2",
    [CURSOR_AFTER_PARAM]: encodeCursor({
      sort: "new",
      key: "2026-08-17T10:00:00.000Z",
      id: 11750,
    }),
    ...extra,
  });
  return params;
}

/** Every navigation that logically restarts the list. */
const RESET_ACTIONS = {
  district: (p) => p.set("district", "vake"),
  price: (p) => {
    p.set("min", "60000");
    p.set("max", "70000");
  },
  rooms: (p) => p.set("rooms", "3"),
  deal: (p) => p.set("deal", "rent"),
  sort: (p) => p.set("sort", "price_asc"),
  "clear-all": (p) => {
    for (const key of ["district", "min", "max", "mina", "maxa", "rooms", "frame", "view"]) {
      p.delete(key);
    }
  },
};

for (const [name, mutate] of Object.entries(RESET_ACTIONS)) {
  test(`GAP 1 — changing ${name} from page 2 drops page, after and before`, () => {
    const params = pageTwoParams();
    assert.ok(params.has(CURSOR_AFTER_PARAM), "fixture must start mid-collection");
    mutate(params);
    clearPaginationWindow(params);
    for (const key of PAGINATION_WINDOW_PARAMS) {
      assert.equal(
        params.has(key),
        false,
        `${name} left ${key} in the URL, so the visitor stays positioned in the old collection`
      );
    }
  });

  test(`GAP 1 — after changing ${name}, the query returns the start of the new collection`, async () => {
    const rows = inventory();
    const params = pageTwoParams();
    mutate(params);
    clearPaginationWindow(params);

    const searchParams = Object.fromEntries(params.entries());
    const filters = parseFilters(searchParams);
    assert.equal(filters.cursor, undefined, "a cursor survived the reset");
    assert.equal(filters.page, 1, "the page counter survived the reset");

    install(rows);
    const result = await fetchFeed(filters, []);
    // The first row of the reset feed must be the FIRST row of the newly
    // filtered collection under its own ordering — not wherever the previous
    // collection's boundary row happened to sit.
    install(rows);
    const wholeCollection = await fetchFeed({ ...filters, page: 1 }, []);
    assert.ok(result.listings.length > 0, `${name} produced an empty feed`);
    assert.equal(result.listings[0].id, wholeCollection.listings[0].id);
    assert.equal(result.page, 1);
  });
}

test("GAP 1 — a stale cursor that survives a reset is still refused at parse", () => {
  // Belt and braces: even if some future surface forgets the helper, a cursor
  // whose ordering no longer matches the request is rejected.
  const stale = encodeCursor({ sort: "new", key: "2026-08-17T10:00:00.000Z", id: 11750 });
  const afterSortChange = parseFilters({
    deal: "sale",
    sort: "price_asc",
    [CURSOR_AFTER_PARAM]: stale,
  });
  assert.equal(afterSortChange.cursor, undefined);
});

test("GAP 1 — every reset surface calls the shared helper", () => {
  const read = (rel) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
  for (const file of [
    "../components/FilterBar.tsx",
    "../components/SortBar.tsx",
    "../components/EmptyState.tsx",
    "../app/(ka)/page.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /clearPaginationWindow\(/, `${file} does not reset the window`);
    // The open-coded form is what drifted; it must not come back.
    assert.ok(
      !/\.delete\("page"\)/.test(source),
      `${file} still open-codes delete("page") instead of using the helper`
    );
  }
});

test("GAP 1 — the helper clears exactly the window params and nothing else", () => {
  const params = new URLSearchParams({
    deal: "rent",
    district: "vake",
    rooms: "3",
    sort: "price_asc",
    page: "4",
    [CURSOR_AFTER_PARAM]: "x",
    [CURSOR_BEFORE_PARAM]: "y",
  });
  clearPaginationWindow(params);
  assert.deepEqual(
    [...params.entries()].sort(),
    [
      ["deal", "rent"],
      ["district", "vake"],
      ["rooms", "3"],
      ["sort", "price_asc"],
    ].sort()
  );
});

/* ===================================================================== GAP 2 */

/** The exact string the review reproduced, plus the rest of the DSL grammar. */
const INJECTION_KEYS = [
  'x"),id.gt.0',
  'x",id.gt.0',
  "x,id.gt.0",
  "x)",
  "x(",
  'x"',
  "2026-08-17T10:00:00.000Z,id.gt.0",
  '2026-08-17T10:00:00.000Z"),id.gt.0',
  "and(id.gt.0)",
  "*",
  "null",
];

test("GAP 2 — every injection key is refused by the decoder", () => {
  for (const key of INJECTION_KEYS) {
    const token = encodeCursor({ sort: "new", key, id: 1 });
    // encode itself must refuse to mint it...
    assert.equal(token, null, `encoded an injection key: ${key}`);
    // ...and a hand-built token carrying it must not decode.
    const forged = Buffer.from(JSON.stringify([2, "new", key, 1]), "utf8").toString(
      "base64url"
    );
    assert.equal(decodeCursor(forged, "new"), null, `decoded an injection key: ${key}`);
    assert.equal(isSafeCursorKey("new", key), false, `accepted key: ${key}`);
  }
});

test("GAP 2 — an injection key cannot reach the or= expression", () => {
  for (const key of INJECTION_KEYS) {
    assert.throws(
      () => keysetExpression({ sort: "new", key, id: 1 }, "after"),
      /unsafe cursor/,
      `injection key reached the query: ${key}`
    );
  }
});

test("GAP 2 — no expression this module can emit contains a stray delimiter", () => {
  const safe = [
    { sort: "new", key: "2026-08-17T10:00:00.000Z", id: 5 },
    { sort: "new", key: "2026-08-17T10:00:00+04:00", id: 5 },
    { sort: "new", key: "2026-08-17T10:00:00.123456Z", id: 5 },
    { sort: "price_asc", key: 60000, id: 5 },
    { sort: "price_asc", key: null, id: 5 },
    { sort: "price_desc", key: -12.5, id: 5 },
    { sort: "price_desc", key: null, id: 5 },
  ];
  for (const cursor of safe) {
    for (const direction of ["after", "before"]) {
      const expr = keysetExpression(cursor, direction);
      // Whatever sits between the quotes must contain only timestamp characters.
      for (const quoted of expr.match(/"[^"]*"/g) ?? []) {
        assert.match(
          quoted,
          /^"[0-9T:.+\-Z]+"$/,
          `a quoted literal carried grammar characters: ${quoted}`
        );
      }
      // Parentheses must be balanced and belong only to and(...) groups.
      const opens = (expr.match(/\(/g) ?? []).length;
      const closes = (expr.match(/\)/g) ?? []).length;
      assert.equal(opens, closes, `unbalanced parentheses: ${expr}`);
      assert.equal(
        (expr.match(/and\(/g) ?? []).length,
        opens,
        `a parenthesis outside an and() group: ${expr}`
      );
    }
  }
});

test("GAP 2 — a timestamp cursor is rejected under a price sort", () => {
  const timestampCursor = encodeCursor({
    sort: "new",
    key: "2026-08-17T10:00:00.000Z",
    id: 11750,
  });
  assert.ok(timestampCursor, "the honest cursor must encode");
  assert.equal(decodeCursor(timestampCursor, "price_asc"), null);
  assert.equal(decodeCursor(timestampCursor, "price_desc"), null);
  assert.equal(decodeCursor(timestampCursor, "new")?.id, 11750);
  // And the mismatch cannot be smuggled by relabelling the mode: a timestamp
  // is not a legal key for a numeric column whatever the payload claims.
  const relabelled = Buffer.from(
    JSON.stringify([2, "price_asc", "2026-08-17T10:00:00.000Z", 11750]),
    "utf8"
  ).toString("base64url");
  assert.equal(decodeCursor(relabelled, "price_asc"), null);
});

test("GAP 2 — a price cursor is rejected under the newest-first sort", () => {
  const priceCursor = encodeCursor({ sort: "price_asc", key: 60000, id: 11750 });
  assert.equal(decodeCursor(priceCursor, "new"), null);
  // price_asc and price_desc are different orderings; a boundary in one is not
  // a position in the other.
  assert.equal(decodeCursor(priceCursor, "price_desc"), null);
});

test("GAP 2 — invalid timestamps are refused", () => {
  for (const key of [
    "2026-08-17",
    "17/08/2026",
    "2026-08-17T10:00:00",
    "2026-08-17 10:00:00Z",
    "2026-13-45T99:99:99Z",
    "2026-08-17T10:00:00.0000000Z",
    "",
    " 2026-08-17T10:00:00.000Z",
    "2026-08-17T10:00:00.000Z ",
  ]) {
    assert.equal(isSafeCursorKey("new", key), false, `accepted timestamp: ${key}`);
    assert.equal(encodeCursor({ sort: "new", key, id: 1 }), null, `encoded: ${key}`);
  }
  // A real Postgres timestamptz keeps microseconds and must survive intact.
  assert.equal(isSafeCursorKey("new", "2026-08-17T10:00:00.123456+00:00"), true);
});

test("GAP 2 — NaN, Infinity and non-decimal numbers are refused", () => {
  for (const key of [NaN, Infinity, -Infinity, 1e21, -1e21]) {
    assert.equal(isSafeCursorKey("price_asc", key), false, `accepted number: ${key}`);
    assert.equal(encodeCursor({ sort: "price_asc", key, id: 1 }), null);
    assert.throws(() => keysetExpression({ sort: "price_asc", key, id: 1 }, "after"));
  }
  // ⚠️ JSON.stringify turns NaN and Infinity into `null`, which is a LEGAL key
  // for a price sort (the NULLS-LAST tail). Refusing them at encode is what
  // stops a non-finite value from silently becoming "the end of the list".
  const smuggled = Buffer.from(JSON.stringify([2, "price_asc", NaN, 1]), "utf8").toString(
    "base64url"
  );
  assert.deepEqual(decodeCursor(smuggled, "price_asc"), { sort: "price_asc", key: null, id: 1 });
  assert.equal(encodeCursor({ sort: "price_asc", key: NaN, id: 1 }), null);
  // Finite decimals still work.
  assert.equal(isSafeCursorKey("price_asc", 60000), true);
  assert.equal(isSafeCursorKey("price_asc", -12.5), true);
});

test("GAP 2 — a null key is refused for a sort whose column is NOT NULL", () => {
  assert.equal(isSafeCursorKey("new", null), false);
  assert.equal(encodeCursor({ sort: "new", key: null, id: 1 }), null);
  assert.throws(() => keysetExpression({ sort: "new", key: null, id: 1 }, "after"));
});

test("GAP 2 — bad ids are refused", () => {
  for (const id of [0, -1, 1.5, NaN, "5", null, undefined, Number.MAX_SAFE_INTEGER + 2]) {
    assert.equal(
      encodeCursor({ sort: "new", key: "2026-08-17T10:00:00.000Z", id }),
      null,
      `encoded id: ${id}`
    );
  }
});

test("GAP 2 — after and before together are refused outright", async () => {
  const a = encodeCursor({ sort: "new", key: "2026-08-17T10:00:00.000Z", id: 11750 });
  const b = encodeCursor({ sort: "new", key: "2026-08-17T09:00:00.000Z", id: 11740 });
  const filters = parseFilters({
    deal: "sale",
    page: "2",
    [CURSOR_AFTER_PARAM]: a,
    [CURSOR_BEFORE_PARAM]: b,
  });
  assert.equal(filters.cursor, undefined, "one direction was picked silently");
  assert.equal(filters.cursorDirection, undefined);

  // And the request still serves a coherent page rather than erroring.
  const rows = inventory();
  install(rows);
  const both = await fetchFeed(filters, []);
  install(rows);
  const offset = await fetchFeed({ ...parseFilters({ deal: "sale", page: "2" }), page: 2 }, []);
  assert.deepEqual(
    both.listings.map((l) => l.id),
    offset.listings.map((l) => l.id)
  );
});

test("GAP 2 — an old v1 cursor no longer decodes", () => {
  // Bumping the version is what makes a payload minted under the old rules
  // fail closed instead of being reinterpreted under the new ones.
  const v1 = Buffer.from(
    JSON.stringify([1, "2026-08-17T10:00:00.000Z", 11750]),
    "utf8"
  ).toString("base64url");
  assert.equal(decodeCursor(v1, "new"), null);
});

test("GAP 2 — the honest path still works end to end", async () => {
  const rows = inventory();
  install(rows);
  const plan = await fetchRailPlan("sale", 3, 4242);
  const page1 = await fetchFeed({ ...parseFilters({ deal: "sale" }), page: 1 }, plan.shownIds);
  const token = encodeCursor(page1.nextCursor);
  assert.ok(token, "a real boundary row must encode");

  const parsed = parseFilters({ deal: "sale", page: "2", [CURSOR_AFTER_PARAM]: token });
  assert.equal(parsed.cursorDirection, "after");
  install(rows);
  const page2 = await fetchFeed({ ...parsed, page: 2 }, plan.shownIds);
  const ids = [...page1.listings.map((l) => l.id), ...page2.listings.map((l) => l.id)];
  assert.equal(new Set(ids).size, ids.length, "the honest path repeated a listing");
});
