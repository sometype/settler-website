# FABLE_BRIEF — mepatrone.com redesign

> One-line brief: Redesign mepatrone.com as a Georgian-first, call-first owner
> marketplace whose homepage is signal rails (new / hot / value), not a
> scraper's newest-dump grid — never lie about agents, never show raw HTML or
> competitor brands, and make velocity + clean descriptions the product, not
> decoration.

Source: live-site + source torture test, 2026-07-25. Grade at time of test: D+.

## Hard rules (non-negotiable)

1. Never show `flagged_agent` listings.
2. Never show raw HTML descriptions.
3. **Never expose collection provenance.** No source name, no source domain, no
   outbound "original listing" link, no upstream image host, no `source` /
   `source_id` / `url` column over the wire, no working `?source=` param. Images
   are served only through `/img/{listingId}/{position}` on our own origin.
   Assume the anon Supabase key is public — anything the view exposes is exposed.
4. Never hardcode trust stats — wire to live counts or remove.
5. Price sanity: hide or flag $0, absurd sale-as-rent, etc.

## Phase plan

| Phase | What | Why |
|---|---|---|
| A. Stop the bleeding | Strip HTML; sanity prices; real 404; empty page state; remove fake "0"; hide competitor badge; use description_ka; prefer own images | Trust |
| B. Call-first detail | Sticky call, clean hierarchy, Georgian 404/empty | Conversion |
| C. Rails + sort | Hot / value / new using velocity + medians | Moat visible |
| D. District IA | EN→KA map, chip filter | Usability |
| E. SEO + speed | sitemap, JSON-LD, ISR, image CDN | Growth |
| F. Facts & policy | AI constraints/facts chips; nationality policy | Differentiation |

### Phase A status (done in source, 2026-07-25)

- [x] Fake "0 agents · spam · duplicates" stat removed from Hero (live counts only)
- [x] Raw description fallback stripped of HTML/entities (`lib/text.ts`)
- [x] `description_ka` preferred on detail page
- [x] Price sanity bounds (`sanePriceUsd`: rent $50–$50k, sale $5k–$5M) — out of range renders "ფასი მოთხოვნით"
- [x] Georgian branded `app/not-found.tsx` (listing soft-404 + unmatched URLs). Streamed routes still answer HTTP 200 (Next injects `noindex`); a true 404 status arrives with the Phase E ISR rework
- [x] Out-of-range `?page=` gets an explicit state + link back (filters preserved)
- [x] Competitor source badges removed from cards and detail; "original listing" demoted to a footnote line
- [x] min > max price range auto-corrected instead of silently empty
- [x] ka-GE number locale for counts; Georgian gallery alts + photo counter; Georgian pagination aria-label
- [x] Starter SVG junk deleted from `public/`
- [x] **All collection provenance removed from the client.** Source filter dropped from FilterBar and `parseFilters` (a stray `?source=ss` is now inert); `source` / `source_id` / `url` no longer selected (explicit column list in `lib/listings.ts`); outbound "original listing" link removed entirely; images served through `/img/{listingId}/{position}`, so no upstream host appears in markup, network requests, or referrers. Verified: served HTML contains no `myhome` / `ss.ge` / `tnet.ge`, and the browser contacts only our own origin.
- [ ] **Apply `sql/005_listings_public_drop_source.sql`** — drops `source` / `source_id` / `url` from the public view. Until applied, the anon key (public by construction — it ships in the JS bundle) can still read provenance straight from `listings_public`. Site code is already migration-order-independent.
- [ ] **Last machine-readable trace:** `listing_images.source_url` stays anon-readable because `/img` resolves it at request time. Closed by finishing the bucket move (preferred) or a server-only service-role key — see the notes at the bottom of migration 005.
- [ ] First-party images: **blocked on infra** — photos are on VPS disk (`/opt/settler/images`), not a public bucket. Move to R2/Supabase storage, then set `NEXT_PUBLIC_IMAGE_BASE_URL`; `/img` then 308-redirects to the stored copy and stops touching upstream entirely. That also removes the proxy's cold-fetch cost (~0.5–1.2s uncached in dev; CDN-cached for a year in production).

## Information architecture (target)

```
/                     Home: search hero + rails (not only a grid)
/rent  /sale          Clear deal IA (or sticky deal switch always visible)
/hot                  "იღებს ყურადღებას" — velocity-ranked, age < 48h
/value                Under-median price + warm velocity (same rooms×district)
/listing/[id]         Call-first detail; clean KA description; trust panel
/saved                (later) shortlist
```

Optional later: `/district/[slug]` for SEO once districts are normalized KA.

## Data contract the UI should consume

Expose a stable public read model (view or BFF), not raw scrapings:

| Field | UI use |
|---|---|
| title_ka | Generated: `{rooms} ოთახი · {district_ka}` |
| description_public | `coalesce(description_ka, strip_html(description))` |
| price_usd, price_gel | Dual display |
| deal_type | IA + badge |
| district_ka, district_key | Chips + filter (merge Saburtalo/საბურთალო) |
| rooms, area, floor | Card facts |
| view_velocity, peak_velocity, velocity_tier | hot / warm / null badges + /hot sort |
| is_new (<24h), age_hours | Freshness |
| trust: owner_listings_count, text_agent_status, dup_cluster_id | Trust chips / hide |
| facts from AI JSON | furnished, pets, min_months, first_last |
| constraints | Policy: hide/redact/show |
| phone | Detail only; consider reveal later |
| images[] | First-party URLs only |
| cross_post | "Also on other site" collapsed, not outbound hero |
| score_value | Precomputed under-median flag |

## Feed architecture

Home = rails, not one dump:

1. Search hero (deal · district chips · rooms · price) — results jump to filtered feed
2. Rail: ახალი — last 6–12h
3. Rail: იღებს ყურადღებას — view_velocity ≥ threshold or top decile within deal
4. Rail: კარგი ფასი — warm + price ≤ 0.9 × district-room median
5. Main grid — filtered, sort: newest | hot | price | area

Sort: server query params → Supabase/RPC. Precompute `listings.feed_score`
hourly if needed so the UI stays dumb.

## Listing detail (call-first)

```
[ Gallery swipe · 3/14 ]
[ Price GEL + USD · deal · NEW · HOT ]
[ Title · district · rooms · m² · floor ]
[ Primary: დარეკე პატრონს ]  [ WhatsApp secondary ]
[ Trust strip: მეპატრონე · 1 განცხადება · ტექსტი შემოწმებული ]
[ Clean description_ka ]
[ Facts chips from AI: ავეჯი · მეტრო · მინ. 6 თვე ]
[ Details dl ]
[ Map later ]
[ "წყარო" collapsed footer — not a marketing button ]
```

Mobile: sticky call bar after scroll past fold.

## Trust architecture

- `published` = structural quality (owner_count, photos, monitor)
- `description_status` = text quality (clean / held / flagged_agent / fail_open)
- site visibility = `published AND status ≠ flagged_agent`

UI states: clean → `description_ka`; pending/held/fail_open → stripped raw;
flagged_agent → never reaches the client (view filters it).

Hero stats (if any): live count, added 24h — never fake numbers.

## Performance targets

| Now | Target |
|---|---|
| force-dynamic everything | Static/ISR feed shells + 30–120s revalidate for rails |
| Singapore DB round-trip per request | Edge cache list payloads; detail 60s ISR |
| Hotlinked competitor images | Serve `/img/{listing}/{n}.jpg` from R2/Supabase public bucket |
| No sitemap | Generate from listings_public daily; add JSON-LD + per-listing OG |

## Component kit to deliver

TrustChip, VelocityChip, DealSwitch, DistrictPicker (normalized KA),
ListingCard (rail / grid / compact densities), Price (GEL primary, USD
secondary), OwnerContact (sticky mobile), FactChips, EmptyState, ErrorState,
NotFound (Georgian), mobile full-screen filter sheet.

## Do NOT build yet

Full account system · in-app chat · paying agents · map-first (until geo
fields are solid) · classifier training UI.

## Remaining torture-list items not covered above

- District filter is free-text over mixed EN/KA DB values → needs EN→KA
  normalization map + chips (Phase D).
- No velocity/value/hot surfaces (Phase C).
- No GEL toggle; no floor/area/condition filters; prev/next-only pagination.
- English field values (condition/status/project) from myhome IDs.
- No robots.txt / sitemap / JSON-LD / canonical / per-listing OG; default favicon.
- No rate-limit story on public phone enumeration.
- FilterBar client state can desync from URL on back/forward.
