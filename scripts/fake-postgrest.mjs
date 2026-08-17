/**
 * A minimal, INDEPENDENT re-implementation of the PostgREST query semantics
 * lib/listings.ts relies on, over an in-memory table.
 *
 * ⚠️ WHY THIS EXISTS AND WHY IT IS NOT A MOCK. Article III-B: a check must be
 * able to fail for a reason the implementation cannot cause. A mock that
 * records "the code called .range(24, 47)" proves only that the code did what
 * the code does. This instead EXECUTES the query the code builds — filters,
 * ordering, null placement, `not.in`, `or=` keyset expressions, range windows —
 * against a fixed inventory, and returns the rows PostgREST would return. If
 * `fetchFeed` builds a window that repeats or skips a listing, the repeat shows
 * up in the rows, exactly as it did in production.
 *
 * It is deliberately written from the PostgREST reference semantics rather than
 * from lib/listings.ts, and it is WIDER than the caller: it implements
 * operators and null-ordering rules the current code does not use, so it can
 * still answer correctly when the implementation changes shape.
 *
 * NOT a production dependency. Test-only helper; never imported by lib/ or app/.
 */

/** `or=` / `and(...)` term grammar: `column.op.value`, values optionally quoted. */
function parseTerms(expr) {
  const terms = [];
  let depth = 0;
  let current = "";
  for (const ch of expr) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      terms.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) terms.push(current);
  return terms;
}

function unquote(raw) {
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  return raw;
}

function coerce(raw) {
  if (raw.startsWith('"')) return unquote(raw);
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) ? n : raw;
}

/** Postgres comparison: NULL compares as unknown, i.e. never matches. */
function compare(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function evalTerm(row, term) {
  const t = term.trim();
  if (t.startsWith("and(") && t.endsWith(")")) {
    return parseTerms(t.slice(4, -1)).every((sub) => evalTerm(row, sub));
  }
  if (t.startsWith("or(") && t.endsWith(")")) {
    return parseTerms(t.slice(3, -1)).some((sub) => evalTerm(row, sub));
  }
  // column.op.value  |  column.not.is.null
  const first = t.indexOf(".");
  const column = t.slice(0, first);
  let rest = t.slice(first + 1);
  let negate = false;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }
  const second = rest.indexOf(".");
  const op = rest.slice(0, second);
  const rawValue = rest.slice(second + 1);
  const value = coerce(rawValue);
  const actual = row[column] ?? null;

  let result;
  switch (op) {
    case "is":
      result = value === null ? actual === null : actual === value;
      break;
    case "eq":
      result = compare(actual, value) === 0;
      break;
    case "gt":
      result = compare(actual, value) === 1;
      break;
    case "gte":
      result = compare(actual, value) !== null && compare(actual, value) >= 0;
      break;
    case "lt":
      result = compare(actual, value) === -1;
      break;
    case "lte":
      result = compare(actual, value) !== null && compare(actual, value) <= 0;
      break;
    case "in": {
      const items = unquote(rawValue)
        .replace(/^\(/, "")
        .replace(/\)$/, "")
        .split(",")
        .filter((s) => s !== "")
        .map((s) => coerce(s.trim()));
      result = items.some((item) => compare(actual, item) === 0);
      break;
    }
    default:
      throw new Error(`fake-postgrest: unsupported operator ${op}`);
  }
  return negate ? !result : result;
}

class Query {
  constructor(rows, { count = null, head = false } = {}) {
    this.rows = rows;
    this.predicates = [];
    this.orders = [];
    this.rangeFrom = null;
    this.rangeTo = null;
    this.limitN = null;
    this.countMode = count;
    this.head = head;
    /** Every emitted request, for tests that assert on the request itself. */
    this.trace = { filters: [], orders: [], range: null, limit: null };
  }

  eq(column, value) {
    this.trace.filters.push(`${column}.eq.${value}`);
    this.predicates.push((r) => compare(r[column] ?? null, value) === 0);
    return this;
  }
  gte(column, value) {
    this.trace.filters.push(`${column}.gte.${value}`);
    this.predicates.push((r) => {
      const c = compare(r[column] ?? null, value);
      return c !== null && c >= 0;
    });
    return this;
  }
  lte(column, value) {
    this.trace.filters.push(`${column}.lte.${value}`);
    this.predicates.push((r) => {
      const c = compare(r[column] ?? null, value);
      return c !== null && c <= 0;
    });
    return this;
  }
  in(column, values) {
    this.trace.filters.push(`${column}.in.(${values.join(",")})`);
    this.predicates.push((r) => values.some((v) => compare(r[column] ?? null, v) === 0));
    return this;
  }
  not(column, op, value) {
    this.trace.filters.push(`${column}.not.${op}.${value}`);
    if (op === "in") {
      const ids = String(value)
        .replace(/^\(/, "")
        .replace(/\)$/, "")
        .split(",")
        .filter((s) => s !== "")
        .map((s) => coerce(s.trim()));
      this.predicates.push((r) => !ids.some((v) => compare(r[column] ?? null, v) === 0));
      return this;
    }
    if (op === "is") {
      this.predicates.push((r) => (r[column] ?? null) !== value);
      return this;
    }
    throw new Error(`fake-postgrest: unsupported not(${op})`);
  }
  or(expression) {
    this.trace.filters.push(`or=(${expression})`);
    const terms = parseTerms(expression);
    this.predicates.push((r) => terms.some((term) => evalTerm(r, term)));
    return this;
  }
  order(column, { ascending = true, nullsFirst = false } = {}) {
    this.trace.orders.push(`${column}.${ascending ? "asc" : "desc"}.${nullsFirst ? "nullsfirst" : "nullslast"}`);
    this.orders.push({ column, ascending, nullsFirst });
    return this;
  }
  limit(n) {
    this.trace.limit = n;
    this.limitN = n;
    return this;
  }
  range(from, to) {
    this.trace.range = [from, to];
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  _resolve() {
    let out = this.rows.filter((row) => this.predicates.every((p) => p(row)));
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const { column, ascending, nullsFirst } = this.orders[i];
      out = out.slice().sort((a, b) => {
        const av = a[column] ?? null;
        const bv = b[column] ?? null;
        // Null placement is explicit, because getting it wrong is precisely the
        // 2026-07-30 price_desc defect this suite has to be able to catch.
        if (av === null && bv === null) return 0;
        if (av === null) return nullsFirst ? -1 : 1;
        if (bv === null) return nullsFirst ? 1 : -1;
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
      });
    }
    const total = out.length;
    if (this.rangeFrom !== null) {
      if (this.rangeFrom > 0 && this.rangeFrom >= total) {
        // PostgREST refuses an offset past the end rather than returning [].
        return {
          data: null,
          count: null,
          error: { code: "PGRST103", message: "Requested range not satisfiable" },
        };
      }
      out = out.slice(this.rangeFrom, this.rangeTo + 1);
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return {
      data: this.head ? null : this.single ? (out[0] ?? null) : out,
      count: this.countMode === "exact" ? total : null,
      error: null,
    };
  }

  then(resolve, reject) {
    try {
      resolve(this._resolve());
    } catch (err) {
      reject(err);
    }
  }
}

/**
 * @param {Record<string, object[]>} tables  table name -> rows
 * @returns a client exposing the subset of supabase-js used by lib/listings.ts
 */
export function createFakeSupabase(tables) {
  const requests = [];
  return {
    requests,
    from(table) {
      const rows = tables[table] ?? [];
      return {
        select(_columns, options = {}) {
          const q = new Query(rows, options);
          requests.push({ table, trace: q.trace });
          return q;
        },
      };
    },
  };
}
