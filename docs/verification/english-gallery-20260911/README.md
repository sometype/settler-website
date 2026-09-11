# English gallery repair — 2026-09-11

Status: verified locally; publication/deployment unauthorized and not performed.
Baseline: 3b0d4ae91791d01bf2d6f269418ce8d656426997.

Reproduction: on /en/listing/25334 clicking photo 3 left the main source at
/img/25334/0. The English server page rendered static thumbnail divs.
EnglishGallery now owns client selection with native buttons, selected state,
all photos, English accessibility text, and a listing-specific reset key.
Existing EnglishListingImage handles failures. Georgian/contact/data code is unchanged.

Independent source/SSR review and builder CUA browser checks are distinguished
in final-local-review.json; it records exact SHA-256 hashes of both code files.
The frozen contract is transaction-specific, not general suite-count authority.

Validation:
- Same photo-3 image click failed on the exact baseline gallery fixture and
  changed the candidate main source to /img/999999/2.
- All 13 synthetic photo selections, return to first, Enter/Space, zero/one
  images, intentional 404 then healthy selection: PASS in CUA.
- Main frame remained 736x460 desktop and 358x268.5 at 390px viewport;
  no horizontal overflow. Mobile screenshot visually inspected.
- Scoped ESLint: exit 0. npm run test:unit: exit 0.
- npm run build -- --webpack: exit 0, including TypeScript. First sandboxed
  attempt could not fetch Google Fonts; approved network retry succeeded.
- Temporary test route and synthetic rewrite removed; next.config.ts restored.
  Loopback servers stopped; viewport reset. No production data/environment used.

Fixture limitations: initial proxy-served page did not hydrate, so it was an
instrument error, not a product verdict. Successful checks used Next directly,
with only synthetic image 999999 rewritten to the loopback image server.
No production browser result is claimed. Deployment needs separate authorization
and live verification. Rollback code is preserved by the baseline Git commit;
production restoration was not exercised.

Re-run structural supplement from this website root:
node docs/verification/english-gallery-20260911/source-ssr.cjs "$PWD" candidate
Expected exit 0. With baseline instead of candidate, expected exit 1.
