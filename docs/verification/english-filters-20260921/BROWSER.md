# Builder browser checks — 2026-09-21

CUA on Next16 webpack localhost:3187; actual candidate catalog page and EnglishRentFilterForm. Fixture copy /private/tmp/english-filter-browser-20260921 used three synthetic listings, stubbed lib/listings.ts, and a minimal English layout with existing CSS (no external analytics/fonts, no production DB). Fixture pagination deliberately fixed at two pages, so this checks navigation/context rather than real result counts. Fixture files are not shipped.

Baseline negative control: preceding live audit of deployed50db52b observed Clear navigate to /en/rent/unfiltered results while dropdowns remained saburtalo/2; reload cleared them. Max1 was silently discarded, returning higher-priced results without validation. See retained AUDIT.md.

Candidate mounted browser observations:
- Start saburtalo/2/min400/max700/page2. Clear -> /en/rent, all four fields empty, page1, all three fixtures, return-context empty.
- Search after Clear retained unfiltered results. Unsaved vake/3/max900 edits then Clear discarded all values. Final wrapper repeated unsaved vake/max900 case at390px successfully.
- Max1 -> English range alert, raw1 retained, no listing cards/results/pagination.
- Correct to saburtalo/2/400..700 -> two matching fixtures; Next preserves filters/page2/context.
- Change to vake/3/400..900 -> matching fixture. Browser Back after settled navigation -> saburtalo/2/400..700/page2 and matching results. Earlier native-form candidate retained edited values after Back; wrapper explicitly resets cached form defaults. Intermediate snapshots during navigation are not settled evidence.
- At390x844, min700/max400 -> English ordering alert, values retained, zero cards, no horizontal overflow.
- Keyboard clearing minimum then Search -> valid max400/no-match state. CUA fill('') failed to clear the field in one attempt; Ctrl/Meta+A/Backspace worked. This was an instrument issue, not treated as app failure.
- Final Clear including unsaved changes -> empty four controls, unfiltered URL, no mobile overflow.

No live deployment, contact submission, data mutation, or production fixture. Forward-specific navigation and actual live-data behavior of the new candidate not separately tested. Browser tab closed and viewport reset. Dev server stopped after checks. Final source differs from browser page copy only in JSX indentation; form wrapper bytes match.
