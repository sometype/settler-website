# ENGLISH-GALLERY-20260911 — frozen before implementation

Owner: independent Codex verifier. S17 authority: transaction-bound acceptance,
local environment only. Baseline: 3b0d4ae91791d01bf2d6f269418ce8d656426997.
Candidate hash is bound at execution; drift invalidates the verdict.

Required gates:
1. With 13 distinct images, every thumbnail selects its matching main image,
including index 0 after another selection and indices 11–12. Exactly one
selection is indicated.
2. Native keyboard-operable selector buttons have English accessible names
and accurate aria-pressed. Enter and Space select focused thumbnails.
3. All gallery alternatives, labels and empty/error messages are English;
no Georgian text appears.
4. Zero images shows a clear English placeholder without broken controls.
One image displays correctly without unusable navigation.
5. A failed selected image shows an English error; selecting a healthy image
subsequently displays it and clears the error.
6. Main-frame bounds remain stable through selection, loading and failure at
desktop and 390px widths; no horizontal page overflow.
7. English detail wiring uses the real gallery with listing-specific reset.
Georgian gallery/page, contact authority/components, image/data routes and
listing filters remain unchanged.

Approved negative control: baseline gallery preserved in Git. The same
thumbnail-selection probe must fail on baseline and pass on candidate.
Fixtures: synthetic listing 999999; 13 positions 0–12, zero and one images;
one intentionally failing image followed by a healthy image. No real data.
Actual UI checks use CUA only. SSR/source checks supplement behavior and
cannot certify keyboard handling, recovery or layout.

Article X applicability: reproduction, baseline-red/candidate-green, local
checks, durable candidate/evidence, documentation and named limitations apply.
Production tests, deployment parity and live remeasurement are excluded:
deployment is unauthorized. Integration owner owns commits and board updates.
Missing evidence remains SKIPPED/ERROR, never PASS.

Execution: installed Node/React/TypeScript only; no dependency downloads,
external network, production writes or spend. Loopback synthetic browser
fixture is permitted by the explicit task clarification. Limit each command
to 60 seconds and each browser verification pass to 10 minutes. Verifier owns
scratch artifacts; builder owns fixture lifecycle. Preserve evidence for
integration. No taste attestation is substituted for behavior.
