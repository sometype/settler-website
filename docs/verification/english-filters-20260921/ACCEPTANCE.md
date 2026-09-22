# EN-FILTER-20260921 — frozen transaction-bound acceptance

Owner/author: filter_acceptance verifier helper; integration owner: parent builder.
Provenance: spawned from builder context, distinct implementation role, NOT external independent certification.
Frozen baseline: website 50db52baf8bb50c6813adb1364cbc5e44a942ee1.
Subject: its isolated descendant repairing English rent filters only; final commit must be named before verdict.
Authority class: transaction-bound acceptance; local environment-specific. No network, production writes, deployment, paid work, or policy changes. Local checks bounded to 10 minutes each; spend limit zero. Required environment: baseline lockfile Node/npm runtime with React/Next/TypeScript; no secret values required. Preserve baseline and demonstrate restoration in disposable files.

## Required acceptance
1. Starting with district=saburtalo,rooms=2,min=400,max=700,page=2, Clear must navigate /en/rent, clear all four visible controls, reset page/results/return context, and a subsequent Search must not resurrect stale filters. Exercise client-side navigation on the mounted form; SSR alone cannot prove this.
2. Valid blank, one-sided and two-sided prices preserve the existing inclusive integer range 50..50000. Test bounds 50 and 50000, normal 400..700, and min=max=50. Valid district/room values, pagination and listing/back context remain preserved.
3. Supplied invalid price inputs (1,49,50001,-1,abc,1.5,1e3 and reversed min=700,max=400) produce visible English validation; retain offending raw input for correction. Do not display an unfiltered/misfiltered list, normal result count, normal empty-results claim or pagination as though the request succeeded. Absent/empty price is valid. If repeated price parameters are deliberately handled, behavior must be deterministic and not silently validate one value while showing another.
4. English validation is understandable and associated with the form/field. Existing valid result fetching and backend-failure error semantics remain distinct from validation. Invalid price must not trigger feed retrieval with the invalid constraint discarded.
5. Source scope excludes Georgian routes, contact authority, gallery/image delivery, publication policy, and data writes. Exact diff must demonstrate preservation, or broader regression acceptance is required before review continues.
6. Scoped lint, TypeScript and relevant regression checks pass. Baseline is observed failing invalid-price acceptance; mounted Clear negative control is observed retaining stale values. Repaired candidate passes both. Tests may use isolated deterministic data, but fixture/browser limitations must be named.
7. Frozen contract is not weakened by implementation. Changes are durably committed with actual results and remaining exceptions. Local acceptance is not deployment readiness: current production identity, explicit release scope, rollback and live parity remain required before claiming live done.

## Preimplementation oracle (manual executable protocol)
The oracle is these independently specified external observations, not a parser return value. For each price vector render the actual page with stubbed deterministic rent-feed data and capture feed calls, HTML form values, alert text, result cards/count/pagination. Baseline max=1 must FAIL clause3: feed called without maxPrice and no validation. Candidate must suppress that misleading success and retain max=1. Excluded case max=50 must remain valid; no blanket rejection.
For Clear use browser CUA or React DOM reconciliation harness against actual form React tree: mount filtered page, change to unfiltered page as client navigation does, inspect controls, then serialize submission. Baseline must FAIL clause1; candidate all blank must PASS. Include filtered->different-filtered history transition to reject a fix that only clears once.

## Control register
Failure classes: stale uncontrolled selects after navigation; silently dropped invalid price constraints.
Approved wrong states: exact baseline 50db52b with filtered-to-empty React reconciliation, max=1/abc/reversed range page render.
Current execution status: not yet executed by this verifier; live reproduction is supplied parent evidence, not this verifier's measurement.
Scope task-only; no permanent runner. Maintenance cost bounded local check/review. Trigger remeasure on filter form/parser/navigation change. Retire after task evidence retained; no restoration controls retired. New fixtures/scripts may implement this oracle but may not narrow observations or vectors.
