import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MAX_CONCURRENT_UPLOADS,
  MAX_PHOTOS,
  buildCreatePayload,
  canRemove,
  claimPosition,
  classifyUploadResponse,
  createIdemFor,
  emptyFacts,
  galleryReady,
  isPermanentUploadFailure,
  nextUploadBatch,
  planAddFiles,
  positionsContiguous,
  readOpaqueToken,
  readSubmissionId,
  removeSlot,
  resolveCover,
  resolveUploadBase,
  restoreState,
  serializeState,
  turnstileRequirement,
  turnstileSiteKeyRequirement,
} from "../lib/uploadFlow.ts";

const COMPONENT = readFileSync(
  fileURLToPath(new URL("../components/UploadFlow.tsx", import.meta.url)),
  "utf8",
);

function slot(over = {}) {
  return {
    id: over.id ?? "s1",
    name: "a.jpg",
    size: 10,
    type: "image/jpeg",
    position: null,
    state: "pending",
    permanent: false,
    ...over,
  };
}

function goodFacts() {
  return { ...emptyFacts(), district_code: "gldani", street_display: "პეკინის ქ.", area: "65", price_usd: "85000" };
}

/* 1. description=null and owner_declared=true before consent */

test("wrong state 1: a draft cannot be created before the owner declares", () => {
  const base = { session: "sess", phone: "555111222", facts: goodFacts(), description: "ტექსტი", idem: "idem-1" };
  const undeclared = buildCreatePayload({ ...base, declared: false });
  assert.equal(undeclared.ok, false);
  assert.equal(undeclared.reason, "declaration_required");

  const declared = buildCreatePayload({ ...base, declared: true });
  assert.equal(declared.ok, true);
  // The exact entered description travels with the create call, not null.
  assert.equal(declared.payload.description, "ტექსტი");
  assert.equal(declared.payload.owner_declared, true);
});

test("wrong state 1b: owner_declared is never a constant in the component", () => {
  assert.ok(
    !/owner_declared:\s*true/.test(COMPONENT),
    "owner_declared must come from buildCreatePayload after consent, never inline",
  );
  assert.ok(!/description:\s*null/.test(COMPONENT), "description must not be hardcoded null");
});

/* 2. missing submission_id advances to photos */

test("wrong state 2: missing, empty or non-numeric identifiers are rejected", () => {
  assert.equal(readSubmissionId({}), null);
  assert.equal(readSubmissionId({ submission_id: null }), null);
  assert.equal(readSubmissionId({ submission_id: "" }), null);
  assert.equal(readSubmissionId({ submission_id: "abc" }), null);
  assert.equal(readSubmissionId({ submission_id: NaN }), null);
  assert.equal(readSubmissionId({ submission_id: 0 }), null);
  assert.equal(readSubmissionId({ submission_id: -3 }), null);
  assert.equal(readSubmissionId({ submission_id: 1.5 }), null);
  assert.equal(readSubmissionId({ submission_id: 42 }), 42);
  assert.equal(readSubmissionId({ submission_id: "42" }), 42);

  assert.equal(readOpaqueToken({}, "session"), null);
  assert.equal(readOpaqueToken({ session: "" }, "session"), null);
  assert.equal(readOpaqueToken({ session: "   " }, "session"), null);
  assert.equal(readOpaqueToken({ session: 7 }, "session"), null);
  assert.equal(readOpaqueToken({ session: "abc" }, "session"), "abc");
  // A successful non-JSON body parses to nothing, never to a valid empty object.
  assert.equal(readOpaqueToken(null, "session"), null);
  assert.equal(readOpaqueToken("<html>", "session"), null);
});

/* 3. refresh after creation loses the draft/gallery */

test("wrong state 3: refresh restores facts, text, declaration and gallery", () => {
  const state = {
    session: "sess",
    email: "o@e.ge",
    phone: "555111222",
    step: "photos",
    facts: goodFacts(),
    description: "ტექსტი",
    declared: true,
    submissionId: 42,
    createIdem: "idem-1",
    coverId: "s2",
    photos: [
      { id: "s1", name: "a.jpg", size: 1, type: "image/jpeg", position: 0, state: "done", permanent: false },
      { id: "s2", name: "b.jpg", size: 1, type: "image/jpeg", position: 1, state: "done", permanent: false },
    ],
  };
  const back = restoreState(serializeState(state));
  assert.ok(back);
  assert.equal(back.facts.district_code, "gldani");
  assert.equal(back.description, "ტექსტი");
  assert.equal(back.declared, true);
  assert.equal(back.submissionId, 42);
  assert.equal(back.createIdem, "idem-1");
  assert.equal(back.coverId, "s2");
  assert.equal(back.photos.length, 2);
  assert.equal(back.step, "photos");

  // Corrupt or foreign state starts over rather than half-restoring.
  assert.equal(restoreState("{not json"), null);
  assert.equal(restoreState(JSON.stringify({ v: 1, session: "s" })), null);
  assert.equal(restoreState(JSON.stringify({ v: 2, session: "" })), null);
  assert.equal(restoreState(null), null);
});

/* 4. more than two uploads are simultaneously active */

test("wrong state 4: never more than two uploads run at once", () => {
  const many = Array.from({ length: MAX_PHOTOS }, (_, i) => slot({ id: `s${i}` }));
  assert.equal(nextUploadBatch(many).length, MAX_CONCURRENT_UPLOADS);

  const oneRunning = [slot({ id: "a", state: "uploading" }), ...many];
  assert.equal(nextUploadBatch(oneRunning).length, MAX_CONCURRENT_UPLOADS - 1);

  const twoRunning = [
    slot({ id: "a", state: "uploading" }),
    slot({ id: "b", state: "uploading" }),
    ...many,
  ];
  assert.deepEqual(nextUploadBatch(twoRunning), []);
});

/* 5. a permanently failed photo cannot be removed */

test("wrong state 5: a failed photo can be removed and does not block finishing", () => {
  const slots = [
    slot({ id: "a", state: "done", position: 0 }),
    slot({ id: "b", state: "done", position: 1 }),
    slot({ id: "c", state: "done", position: 2 }),
    slot({ id: "bad", state: "failed", permanent: true }),
  ];
  assert.equal(canRemove(slots[3]), true);
  assert.equal(galleryReady(slots), false, "a failed slot blocks submission until removed");

  const after = removeSlot(slots, "bad");
  assert.equal(after.length, 3);
  assert.equal(galleryReady(after), true);
  // Uploaded positions stay contiguous, which finalize requires (422 otherwise).
  assert.equal(positionsContiguous(after), true);

  // An already-ingested photo keeps its server position and is not removable.
  assert.equal(canRemove(slots[0]), false);
  assert.equal(removeSlot(slots, "a").length, 4);
});

test("wrong state 5b: positions are reused so removal never leaves a hole", () => {
  const slots = [slot({ id: "a", state: "done", position: 0 }), slot({ id: "b", state: "done", position: 1 })];
  assert.equal(claimPosition(slots), 2);
  const pending = removeSlot([...slots, slot({ id: "c", position: 2, state: "failed" })], "c");
  assert.equal(claimPosition(pending), 2, "a released position is handed to the next upload");

  // 409 means our bytes already landed at that position: not a failure.
  assert.equal(classifyUploadResponse(409), "done");
  assert.equal(classifyUploadResponse(201), "done");
  assert.equal(classifyUploadResponse(500), "failed");
  assert.equal(isPermanentUploadFailure(415), true);
  assert.equal(isPermanentUploadFailure(429), false);
  assert.equal(isPermanentUploadFailure(503), false);
});

test("cover identity survives retry and removal", () => {
  const slots = [
    slot({ id: "a", state: "done", position: 0 }),
    slot({ id: "b", state: "done", position: 1 }),
    slot({ id: "c", state: "failed" }),
  ];
  assert.deepEqual(resolveCover(slots, "b"), { id: "b", position: 1 });
  assert.deepEqual(resolveCover(removeSlot(slots, "c"), "b"), { id: "b", position: 1 });
  // A cover pointing at a removed slot falls back to a real uploaded position.
  assert.deepEqual(resolveCover(slots, "gone"), { id: "a", position: 0 });
  assert.equal(resolveCover([slot({ id: "x" })], "x"), null);
});

/* 6. production mode runs without required API/Turnstile configuration */

test("wrong state 6: an unconfigured production build fails closed", () => {
  const prod = { NODE_ENV: "production" };
  assert.ok("error" in resolveUploadBase(prod), "no silent production upload fallback");
  assert.equal(turnstileRequirement(prod).ok, false, "missing Turnstile secret must fail closed");
  assert.equal(turnstileSiteKeyRequirement(prod).ok, false);

  const configured = {
    NODE_ENV: "production",
    NEXT_PUBLIC_INTAKE_UPLOAD_URL: "https://api.example.com/",
    TURNSTILE_SECRET: "s",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k",
  };
  assert.deepEqual(resolveUploadBase(configured), { url: "https://api.example.com" });
  assert.equal(turnstileRequirement(configured).ok, true);

  // Development still runs unconfigured.
  assert.ok("url" in resolveUploadBase({ NODE_ENV: "development" }));
  assert.equal(turnstileRequirement({ NODE_ENV: "development" }).ok, true);
});

/* 7. unlabeled input or keyboard-inaccessible cover selection */

test("wrong state 7: every control is labelled and the cover is a real button", () => {
  const ids = [...COMPONENT.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(
    (m) => m[1],
  );
  assert.ok(ids.length >= 8, `expected the form controls to carry ids, saw ${ids.length}`);
  const labelled = new Set(
    [...COMPONENT.matchAll(/htmlFor="([^"]+)"/g)].map((m) => m[1]),
  );
  for (const id of ids) {
    assert.ok(labelled.has(id), `control #${id} has no associated <label htmlFor>`);
  }
  // Cover selection must be operable without a pointer and expose its state.
  assert.ok(
    /aria-pressed=\{isCover\}/.test(COMPONENT),
    "cover selection must expose selected state",
  );
  assert.ok(
    !/<img[^>]*onClick/.test(COMPONENT),
    "cover selection must not hang off a click handler on an image",
  );
  assert.ok(/role="alert"/.test(COMPONENT), "errors must be announced");
  assert.ok(/tabIndex={-1}/.test(COMPONENT), "each step needs a focus target");
});

/* 8. replay after a lost create response produces a conflicting draft */

test("wrong state 8: a lost create response replays the same idempotency key", () => {
  let minted = 0;
  const mint = () => `idem-${++minted}`;

  const first = createIdemFor("", mint);
  assert.equal(first, "idem-1");
  // The key is persisted before the request, so the retry after a lost
  // response reuses it instead of minting a second draft.
  const persisted = serializeState({
    session: "sess",
    email: "o@e.ge",
    phone: "555111222",
    step: "describe",
    facts: goodFacts(),
    description: "ტექსტი",
    declared: true,
    submissionId: null,
    createIdem: first,
    coverId: null,
    photos: [],
  });
  const replayed = createIdemFor(restoreState(persisted).createIdem, mint);
  assert.equal(replayed, first);
  assert.equal(minted, 1, "a replay must not mint a second key");

  const payloadA = buildCreatePayload({
    session: "sess", phone: "555111222", facts: goodFacts(),
    description: "ტექსტი", declared: true, idem: first,
  });
  const payloadB = buildCreatePayload({
    session: "sess", phone: "555111222", facts: goodFacts(),
    description: "ტექსტი", declared: true, idem: replayed,
  });
  assert.deepEqual(payloadA.payload, payloadB.payload);
});

/* excess and unsupported types are reported, never silently dropped */

test("excess files and unsupported types are reported", () => {
  const files = Array.from({ length: 25 }, (_, i) => ({
    name: `p${i}.jpg`, size: 1, type: "image/jpeg",
  }));
  const plan = planAddFiles(0, files);
  assert.equal(plan.accepted.length, MAX_PHOTOS);
  assert.equal(plan.excess, 5);

  const heic = planAddFiles(0, [{ name: "IMG.HEIC", size: 1, type: "image/heic" }]);
  assert.equal(heic.accepted.length, 0);
  assert.equal(heic.rejectedType.length, 1, "HEIC is named, not silently dropped");

  assert.equal(planAddFiles(MAX_PHOTOS, [{ name: "x.jpg", size: 1, type: "image/jpeg" }]).excess, 1);
});
