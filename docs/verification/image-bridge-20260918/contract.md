# Frozen image bridge acceptance — 2026-09-18
Authority: S17 transaction-bound acceptance, isolated local route execution only.
Owner: independent Codex verifier. Human requested this control before implementation.
Subject: app/img/[id]/[pos]/route.ts, bounded young stored-image fallback repair.
Baseline repository commit: 4aaac7946c44f1297b13d545dbef0462fffd086c (gallery candidate).
Baseline route SHA-256: a39f246be18747071453affef5bd491e564ff91cedc127c3022c614de855e0ce
Gate check.cjs SHA-256: f305aed7dc4e5ce206db16c2adc87cfb6e5a759bb4b167980ac82449ccd10a4e
Fixtures: fixed 2026-09-18 06:39 UTC, 16-minute young row, 60-minute old row, synthetic image bytes and approved-storage.example. All fixtures inline in hashed gate. Reported live defect is user-supplied context, not independently measured by this harness.

Required behavior: healthy young bridge retains 200 bytes/type/security/cache headers; failed bridge with valid primary or unexpired configured emergency authority returns exact stored-path 307 and Cache-Control no-store; missing/invalid/expired authority returns existing provider 503/no-store/Retry-After 60; old stored image remains 308 without fetch; legacy no-stored upstream success/cache and failure404 remain unchanged. All fetches must stay on fixture's existing allowlisted source URL; storage fallback is a redirect, not an additional fetch. No new URL input or authority is permitted. Ten bounded cases include transport failure and invalid/expired authority exclusions.

Approved negative control: preserved exact baseline-route.ts. Run the SAME gate against it; expected exit1 with fallback and missing-authority assertions failing. Candidate must pass all cases (exit0), and its exact route SHA-256 is bound in execution output. Unexpected instrumentation failure is ERROR, never product FAIL/PASS.

Execution from any directory:
node /private/tmp/english-image-bridge-acceptance-20260918/check.cjs /private/tmp/settler-english-repair-20260918 /private/tmp/english-image-bridge-acceptance-20260918/baseline-route.ts
node /private/tmp/english-image-bridge-acceptance-20260918/check.cjs /private/tmp/settler-english-repair-20260918
For another candidate root, replace the root argument. Omit third argument to test that root's real route.

Environment: installed Node/TypeScript only. VM loads exact transpiled route with mocked Supabase, fetch, clock and env; native Response/URL. No network, credentials, dependency downloads, production writes or spend. Each command timeout60 seconds. Verifier owns scratch evidence; integration owner owns source changes, durable board/evidence integration and release.

Limits/Article X: this is a regression control, not live CDN availability, browser, deployed parity, rollback or full framework acceptance. Defect reproduction, negative-control red, exact candidate green and scoped review apply here; production parity/live evidence and release authority remain separate. No taste attestation needed. Existing source host allowlist, authority validation, old-image behavior, and unrelated paths must remain unchanged. Candidate hash drift invalidates a candidate verdict; test/fixture edits require refreeze. No relaxation of these requirements by builder.
