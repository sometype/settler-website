import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { OWNER_CONDITIONS } from "../lib/labels.ts";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_CONCURRENT_UPLOADS,
  MAX_PHOTOS,
  buildCreatePayload,
  canRemove,
  claimPosition,
  applyUploadOutcome,
  classifyUploadResponse,
  positionOutcome,
  releasePosition,
  createIdemFor,
  emptyFacts,
  factsComplete,
  validateFacts,
  normalizeAreaInput,
  normalizePriceInput,
  isValidOwnerPhone,
  floorPairComplete,
  galleryReady,
  isPermanentUploadFailure,
  nextUploadBatch,
  planAddFiles,
  positionsContiguous,
  readOpaqueToken,
  readRecoveredDraft,
  readSubmissionId,
  readFinalizeStatus,
  removeSlot,
  reserveUploadSlot,
  joinFloorParts,
  resolveCover,
  resolveUploadBase,
  restoreState,
  serializeState,
  splitFloorParts,
  needsReconcile,
  onTicketFailure,
  parseStatusResponse,
  reconcileSlots,
  restorableSlots,
  rejectedTypeNotice,
  UPLOAD_FAILURE_MESSAGES,
  uploadOutcomeMessage,
  turnstileRequirement,
  uploadedPositions,
  turnstileSiteKeyRequirement,
} from "../lib/uploadFlow.ts";
import { mapIntakeError } from "../lib/uploadErrors.ts";

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
    hold: false,
    ...over,
  };
}

function goodFacts() {
  return {
    ...emptyFacts(),
    district_code: "gldani",
    street_display: "პეკინის ქ.",
    area: "65",
    price_usd: "85000",
    condition: "ახალი რემონტით",
  };
}

const ROUTE = readFileSync(
  fileURLToPath(new URL("../app/api/intake/[action]/route.ts", import.meta.url)),
  "utf8",
);
const ERROR_MAPPER = readFileSync(
  fileURLToPath(new URL("../lib/uploadErrors.ts", import.meta.url)),
  "utf8",
);
const ROUTE_COPY = `${ROUTE}\n${ERROR_MAPPER}`;

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

test("validation identity survives and routes to the correcting control", () => {
  assert.deepEqual(mapIntakeError(400, { code: "validation", field: "area", reason: "range_5_2000" }, "create"), {
    code: "invalid_area", ka: "ფართი უნდა იყოს 5-დან 2000 მ²-მდე.", field: "area", step: "facts", controlId: "mp-area",
  });
  assert.equal(mapIntakeError(500, "internal", "create").code, "service");
  assert.equal(mapIntakeError(502, "intake malformed response", "create").code, "service");
  assert.equal(mapIntakeError(401, "bad signature", "create").code, "service");
  assert.equal(mapIntakeError(409, "original request still in flight", "create").code, "service");
  assert.equal(mapIntakeError(403, "bad, expired or already-used ticket", "ticket").code, "ticket_spent");
  assert.equal(mapIntakeError(422, "photo positions must be contiguous", "finalize").code, "gallery");
  assert.equal(mapIntakeError(422, "preferred_cover must be uploaded", "finalize").code, "gallery");
  for (const field of ["phone", "deal_type", "district_code", "street_display", "rooms", "area", "floor", "price_usd", "condition", "portal_url", "build_period", "bathrooms", "building_status", "project_type", "balcony", "amenities", "deposit_required", "utilities_included", "min_months", "pets_allowed", "description", "owner_declared"]) {
    const mapped = mapIntakeError(400, { code: "validation", field, reason: "wrong" }, "create");
    assert.equal(mapped.field, field, field);
    assert.notEqual(mapped.code, "field", field);
  }
});

test("owner-friendly numeric input normalizes without silently changing value", () => {
  assert.equal(normalizeAreaInput("65,5"), 65.5);
  assert.equal(normalizeAreaInput("65 m²"), 65);
  assert.equal(normalizePriceInput("85,000"), 85000);
  assert.equal(normalizePriceInput("85.000"), 85000);
  assert.equal(normalizePriceInput("85.5"), null);
});

test("facts parity rejects values the API will reject", () => {
  assert.equal(validateFacts({ ...goodFacts(), floor: "100/120" })?.field, "floor");
  assert.equal(validateFacts({ ...goodFacts(), area: "2" })?.field, "area");
  assert.equal(validateFacts({ ...goodFacts(), portal_url: "myhome.ge/1" })?.field, "portal_url");
  assert.equal(validateFacts({ ...goodFacts(), build_year: "1799" })?.field, "build_period");
  assert.equal(validateFacts({ ...goodFacts(), deal_type: "rent", min_months: "61" })?.field, "min_months");
  assert.equal(isValidOwnerPhone("555 11 22 33"), true);
  assert.equal(isValidOwnerPhone("123456789"), false);
});

test("persisted state cannot restore an unknown or completed screen", () => {
  const base = { v: 2, session: "s", email: "e@x.ge", phone: "", facts: goodFacts(), description: "d", declared: true, submissionId: 1, createIdem: "i", coverId: null, photos: [] };
  assert.equal(restoreState(JSON.stringify({ ...base, step: "made-up" })), null);
  assert.equal(restoreState(JSON.stringify({ ...base, step: "done" })), null);
  const restored = restoreState(JSON.stringify({ ...base, step: "facts", facts: { ...goodFacts(), area: 65, price_usd: 85000 } }));
  assert.equal(restored.facts.area, "65");
  assert.equal(restored.facts.price_usd, "85000");
});

test("finalization only accepts explicit review states", () => {
  assert.equal(readFinalizeStatus({}), null);
  assert.equal(readFinalizeStatus({ status: "expired" }), null);
  assert.equal(readFinalizeStatus({ status: "rejected_content" }), null);
  assert.equal(readFinalizeStatus({ status: "pending_review" }), "pending_review");
  assert.equal(readFinalizeStatus({ status: "duplicate_found" }), "duplicate_found");
});

test("component routes field errors, exposes Turnstile readiness, and offers recovery actions", () => {
  assert.match(COMPONENT, /setStep\(next\.step as Step\)/);
  assert.match(COMPONENT, /if \(error\?\.controlId\) return;[\s\S]{0,100}headingRef\.current\?\.focus\(\)/);
  assert.match(COMPONENT, /if \(error\.detailsId\)[\s\S]{0,180}details\.open = true/);
  assert.match(COMPONENT, /control\?\.focus\(\)/);
  assert.match(COMPONENT, /aria-invalid=\{error\?\.controlId === "mp-area"/);
  assert.match(COMPONENT, /უსაფრთხოების შემოწმება იტვირთება/);
  assert.match(COMPONENT, /თავიდან შემოწმება/);
  assert.match(COMPONENT, /ძველი განცხადების წაშლა და თავიდან დაწყება/);
  assert.match(COMPONENT, /readFinalizeStatus\(r\.data\)/);
  assert.match(COMPONENT, /finalizeReceipt\(accepted\)/);
  assert.doesNotMatch(COMPONENT, /setError\((?:r|tk)\.error\)/, "server errors must use the step/focus router");
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

  // Only the exact already-ingested 409 settles a slot; see "position 3".
  assert.equal(classifyUploadResponse(409, "position already has an image"), "done");
  assert.equal(classifyUploadResponse(409), "failed");
  assert.equal(classifyUploadResponse(201), "done");
  assert.equal(classifyUploadResponse(500), "failed");
  assert.equal(isPermanentUploadFailure(415), true);
  assert.equal(isPermanentUploadFailure(429), false);
  assert.equal(isPermanentUploadFailure(503), false);
});

test("photo workers reserve distinct positions synchronously before their first await", () => {
  const initial = [slot({ id: "a" }), slot({ id: "b" }), slot({ id: "c" })];
  const first = reserveUploadSlot(initial, "a");
  assert.ok(first);
  assert.equal(first.position, 0);
  assert.equal(first.slots.find((s) => s.id === "a")?.state, "uploading");

  // This is the second worker starting in the same effect pass. It must read
  // the synchronously published snapshot and receive a different position.
  const second = reserveUploadSlot(first.slots, "b");
  assert.ok(second);
  assert.equal(second.position, 1);
  assert.deepEqual(
    second.slots.map((s) => [s.id, s.position, s.state]),
    [
      ["a", 0, "uploading"],
      ["b", 1, "uploading"],
      ["c", null, "pending"],
    ],
  );
  assert.equal(initial.every((s) => s.position === null), true, "the input snapshot stays immutable");
});

test("a held retry reserves its original position", () => {
  const held = [slot({ id: "x", position: 3, state: "pending", hold: true })];
  const reserved = reserveUploadSlot(held, "x");
  assert.ok(reserved);
  assert.equal(reserved.position, 3);
  assert.equal(reserved.slots[0].hold, true);
  assert.equal(reserveUploadSlot(held, "missing"), null);
});

test("UploadFlow publishes the reserved snapshot before requesting a ticket", () => {
  assert.match(COMPONENT, /reserveUploadSlot\(photosRef\.current, id\)/);
  assert.match(COMPONENT, /photosRef\.current = reserved\.slots;\s*setPhotos\(reserved\.slots\);/);
  assert.doesNotMatch(COMPONENT, /let position: number \| null = null;\s*setPhotos/);
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


/* ---------------------- product acceptance addendum ---------------------- */

test("product 1+6: an unchecked declaration cannot create or finalize", () => {
  const base = { session: "s", phone: "555111222", facts: goodFacts(), description: "ტ", idem: "i-1" };
  assert.equal(buildCreatePayload({ ...base, declared: false }).reason, "declaration_required");
  // Nothing in the component asserts the declaration on the owner's behalf.
  assert.ok(!/owner_declared:\s*true/.test(COMPONENT));
  assert.ok(/checked=\{declared\}/.test(COMPONENT), "the box drives the value");
  assert.ok(
    /disabled=\{busy \|\| !declared/.test(COMPONENT),
    "create stays disabled until the owner checks the box",
  );
});

test("product 2+5: description is required and reaches the stored submission", () => {
  const base = { session: "s", phone: "555111222", facts: goodFacts(), declared: true, idem: "i-1" };
  assert.equal(buildCreatePayload({ ...base, description: "" }).reason, "description_required");
  assert.equal(buildCreatePayload({ ...base, description: "   " }).reason, "description_required");
  const ok = buildCreatePayload({ ...base, description: "  ორსართულიანი  " });
  assert.equal(ok.payload.description, "ორსართულიანი");
});

test("product 7: a missing property condition blocks the step and the request", () => {
  const without = { ...goodFacts(), condition: "" };
  assert.equal(factsComplete(without), false);
  assert.equal(factsComplete(goodFacts()), true);

  const built = buildCreatePayload({
    session: "s", phone: "555111222", facts: without,
    description: "ტ", declared: true, idem: "i-1",
  });
  assert.equal(built.reason, "condition_required");

  // The offered vocabulary comes from labels.ts, not a third copy in the form.
  assert.ok(
    /OWNER_CONDITIONS.map\(/.test(COMPONENT),
    "the select must be driven by labels.ts OWNER_CONDITIONS",
  );
  assert.ok(
    !/ახალი რემონტით/.test(readFileSync(fileURLToPath(new URL("../lib/uploadFlow.ts", import.meta.url)), "utf8")),
    "uploadFlow must not restate the condition vocabulary",
  );
  assert.equal(OWNER_CONDITIONS.length, 6);
  // Every offered option is a canonical value the backend already normalises.
  for (const c of OWNER_CONDITIONS) {
    assert.equal(factsComplete({ ...goodFacts(), condition: c }), true, c);
    const b = buildCreatePayload({
      session: "s", phone: "555111222", facts: { ...goodFacts(), condition: c },
      description: "ტ", declared: true, idem: "i-1",
    });
    assert.equal(b.payload.condition, c);
  }
});

test("product 7b: floor uses two number fields while preserving the API value", () => {
  assert.deepEqual(splitFloorParts("4/9"), { unit: "4", total: "9" });
  assert.deepEqual(splitFloorParts("4/"), { unit: "4", total: "" });
  assert.equal(joinFloorParts("4", "9"), "4/9");
  assert.equal(joinFloorParts("", ""), "");
  assert.equal(joinFloorParts("4x", "9th"), "");
  assert.equal(floorPairComplete(""), true, "floor remains optional");
  assert.equal(floorPairComplete("4/9"), true);
  assert.equal(floorPairComplete("4/"), false);
  assert.equal(floorPairComplete("/9"), false);

  assert.equal(factsComplete({ ...goodFacts(), floor: "4/" }), false);
  assert.equal(factsComplete({ ...goodFacts(), floor: "4/9" }), true);
  assert.equal(
    buildCreatePayload({
      session: "s",
      phone: "555111222",
      facts: { ...goodFacts(), floor: "4/" },
      description: "ტ",
      declared: true,
      idem: "i-1",
    }).reason,
    "floor_pair_incomplete",
  );

  assert.ok(COMPONENT.includes("ბინის სართული"));
  assert.ok(COMPONENT.includes("შენობის სართულები"));
  assert.ok(!COMPONENT.includes('placeholder="4/9"'));
});

test("product 3: no blanket claim that nothing was lost", () => {
  for (const banned of ["არაფერი დაიკარგა", "ადგილზეა"]) {
    assert.ok(!COMPONENT.includes(banned), `component still promises: ${banned}`);
    assert.ok(!ROUTE.includes(banned), `route still promises: ${banned}`);
  }
  // Resume is offered explicitly and names what cannot survive a refresh.
  assert.ok(/განაგრძე/.test(COMPONENT), "an explicit resume action is required");
  assert.ok(
    /ბრაუზერში არჩეული ფაილები არ ინახება/.test(COMPONENT),
    "resume must say photos need re-selecting",
  );
});

test("product 4: a failed HEIC or corrupt photo is rejected and removable", () => {
  const heic = planAddFiles(0, [{ name: "IMG_1.HEIC", size: 1, type: "image/heic" }]);
  assert.equal(heic.accepted.length, 0);
  assert.equal(heic.rejectedType.length, 1);
  // JPEG and PNG only in this version.
  assert.deepEqual([...ACCEPTED_IMAGE_TYPES], ["image/jpeg", "image/png"]);
  assert.equal(planAddFiles(0, [{ name: "a.webp", size: 1, type: "image/webp" }]).accepted.length, 0);

  const stuck = [
    slot({ id: "a", state: "done", position: 0 }),
    slot({ id: "b", state: "done", position: 1 }),
    slot({ id: "c", state: "done", position: 2 }),
    slot({ id: "bad", state: "failed", permanent: true }),
  ];
  assert.equal(galleryReady(stuck), false);
  assert.equal(canRemove(stuck[3]), true);
  assert.equal(galleryReady(removeSlot(stuck, "bad")), true, "a bad image must not trap the submission");
});

test("product 5b: no raw internal status is ever rendered", () => {
  for (const raw of ["promoted", "rejected_spam", "pending_review", "finalStatus"]) {
    assert.ok(!COMPONENT.includes(raw), `internal status leaked to the owner: ${raw}`);
  }
  assert.ok(!/სტატუსი:/.test(COMPONENT), "no status line on the done screen");
});

test("product 8+9: concise truthful manifesto without portal brands", () => {
  assert.ok(!/ორ ბარათს არ ვაჩვენებთ/.test(COMPONENT), "absolute two-card promise removed");
  assert.ok(!/24 სთ/.test(COMPONENT), "24-hour promise removed");
  assert.ok(
    /შემოწმებული ბინები · დუბლიკატების გარეშე/.test(COMPONENT),
    "the concise verification promise is required",
  );
  assert.ok(
    /განცხადება გადამოწმების შემდეგ გამოქვეყნდება/.test(COMPONENT),
    "publication must remain conditional on review",
  );
  assert.ok(!/myhome|ss-ზე|myhome\/ss/i.test(COMPONENT), "portal brands are removed from owner copy");
  assert.ok(/იგივე განცხადების რამდენჯერმე ატვირთვა/.test(COMPONENT));
  assert.ok(/ასეთი განცხადებები არ გამოქვეყნდება/.test(COMPONENT));
  assert.ok(
    /მადლობა, განცხადება მიღებულია\. გამოქვეყნდება გადამოწმების შემდეგ\./.test(COMPONENT),
  );
  assert.ok(!/უპასუხე უცნობ ნომერს/.test(COMPONENT));
});

test("product 8b: facts and declaration copy are short and natural", () => {
  assert.ok(COMPONENT.includes("მხოლოდ ქუჩის ან უბნის სახელი"));
  assert.ok(!COMPONENT.includes("სახლის ნომერი და ბინის ნომერი არ ჩაწერო"));
  assert.ok(
    COMPONENT.includes("ვარ ბინის მეპატრონე ან მეპატრონე თანახმაა, რომ განცხადება აიტვირთოს."),
  );
  assert.ok(!COMPONENT.includes("ამ ბინის პატრონი ვარ. აგენტი არ ვარ"));
  assert.ok(!COMPONENT.includes("ვადასტურებ, რომ ბინის მესაკუთრე ვარ"));
});

test("product 10: main-photo selection is keyboard operable and labelled", () => {
  assert.ok(/aria-pressed=\{isCover\}/.test(COMPONENT));
  assert.ok(/მთავარი ფოტო/.test(COMPONENT), "cover is renamed to მთავარი ფოტო");
  assert.ok(!/გარეკანი/.test(COMPONENT), "old გარეკანი wording removed");
  assert.ok(/ფოტოს დამატება/.test(COMPONENT), "the + control is replaced by words");
  assert.ok(!/<img[^>]*onClick/.test(COMPONENT));
});

test("product 10b: five numbered steps, never n/6", () => {
  assert.ok(!/\/6/.test(COMPONENT), "step count must not claim six steps");
  assert.ok(/ნაბიჯი \{n\}\/5/.test(COMPONENT));
});

test("product 9b: informal email copy without English Promotions", () => {
  assert.ok(!/Promotions/.test(COMPONENT));
  assert.ok(/გახსენი სპამის საქაღალდე/.test(COMPONENT));
  assert.ok(/გახსენი წერილი/.test(COMPONENT), "informal second person");
});


/* -------------------- final correction: photo positions ------------------ */

test("position 1: a known failure at 0 releases it, three successes take 0,1,2", () => {
  // The measured wrong state: the failed slot kept 0, successes took 1,2,3.
  let slots = [slot({ id: "bad", position: 0, state: "uploading" })];
  slots = applyUploadOutcome(slots, "bad", "release", 415, "unsupported media type");
  assert.equal(slots[0].position, null, "a definite rejection releases the position");
  assert.equal(slots[0].hold, false);

  for (const id of ["a", "b", "c"]) {
    const pos = claimPosition(slots);
    slots = [...slots, slot({ id, position: pos, state: "uploading" })];
    slots = applyUploadOutcome(slots, id, "done");
  }
  assert.deepEqual(uploadedPositions(slots), [0, 1, 2]);
  assert.equal(galleryReady(slots), false, "the failed slot still blocks until removed");

  const after = removeSlot(slots, "bad");
  assert.deepEqual(uploadedPositions(after), [0, 1, 2]);
  assert.equal(positionsContiguous(after), true);
  assert.equal(galleryReady(after), true, "three good photos must be able to finalize");
});

test("position 2: an ambiguous transport failure holds its position", () => {
  let slots = [slot({ id: "x", position: 0, state: "uploading" })];
  slots = applyUploadOutcome(slots, "x", "hold");
  assert.equal(slots[0].position, 0, "an unknown outcome keeps the position");
  assert.equal(slots[0].hold, true);
  assert.equal(canRemove(slots[0]), false, "an unresolved slot is retried, not removed");
  assert.equal(galleryReady(slots), false);

  // Nothing may advance past it.
  slots = [...slots, slot({ id: "later" })];
  assert.deepEqual(nextUploadBatch(slots), [], "later photos cannot skip the held position");

  // Its own retry may run.
  slots = slots.map((s) => (s.id === "x" ? { ...s, state: "pending" } : s));
  assert.deepEqual(nextUploadBatch(slots), ["x"]);
});

test("position 3: only the exact already-ingested 409 settles a slot as done", () => {
  assert.equal(positionOutcome(409, "position already has an image — pos 0"), "done");
  assert.equal(classifyUploadResponse(409, "position already has an image — pos 0"), "done");

  // A different 409 from the same endpoint is an error, not success.
  assert.equal(positionOutcome(409, "submission is not accepting images"), "release");
  assert.equal(classifyUploadResponse(409, "submission is not accepting images"), "failed");
  assert.equal(classifyUploadResponse(409, ""), "failed", "a bare 409 is not success");
  assert.equal(classifyUploadResponse(409), "failed");

  assert.equal(positionOutcome(201), "done");
  assert.equal(positionOutcome(415, "unsupported"), "release");
  assert.equal(positionOutcome(429, "slow down"), "release");
  assert.equal(positionOutcome(503, "upstream"), "hold", "5xx is ambiguous");
  assert.equal(isPermanentUploadFailure(415), true);
  assert.equal(isPermanentUploadFailure(429), false);
  assert.equal(isPermanentUploadFailure(409, "position already has an image"), false);
});

test("position 4: retry after a lost successful response settles the same slot", () => {
  let slots = [slot({ id: "x", position: 0, state: "uploading" })];
  slots = applyUploadOutcome(slots, "x", "hold");           // response lost
  slots = slots.map((s) => (s.id === "x" ? { ...s, state: "uploading" } : s)); // retry
  slots = applyUploadOutcome(
    slots, "x",
    positionOutcome(409, "position already has an image — pos 0"),
    409, "position already has an image — pos 0",
  );
  assert.equal(slots[0].state, "done");
  assert.equal(slots[0].position, 0, "it settles at the position it originally claimed");
  assert.equal(slots[0].hold, false);
});

test("position 5: a pre-ingest failure releases without holding", () => {
  const slots = releasePosition([slot({ id: "x", position: 0, state: "uploading" })], "x");
  assert.equal(slots[0].position, null);
  assert.equal(slots[0].hold, false);
  assert.equal(canRemove(slots[0]), true);
  assert.equal(claimPosition(slots), 0, "the released position is the next one handed out");
});

/* ---------------------- final correction: session expiry ----------------- */

test("session expiry at ticket or finalize keeps the draft and the gallery", () => {
  const state = {
    session: "old", email: "o@e.ge", phone: "555111222", step: "photos",
    facts: goodFacts(), description: "ტექსტი", declared: true,
    submissionId: 42, createIdem: "idem-1", coverId: "s1",
    photos: [
      { id: "s1", name: "a.jpg", size: 1, type: "image/jpeg", position: 0, state: "done", permanent: false, hold: false },
      { id: "s2", name: "b.jpg", size: 1, type: "image/jpeg", position: 1, state: "done", permanent: false, hold: false },
    ],
  };
  const back = restoreState(serializeState(state));
  assert.equal(back.submissionId, 42, "the same draft is resumed, never a second one");
  assert.equal(back.createIdem, "idem-1");
  assert.equal(back.photos.filter((p) => p.state === "done").length, 2, "uploads survive");
  assert.equal(back.step, "photos");

  // Both failure paths route to email and neither discards state.
  for (const site of ["ticket", "finalize"]) {
    assert.ok(
      new RegExp(`code === "session_expired"[\\s\\S]{0,200}setStep\\("email"\\)`).test(COMPONENT),
      `${site} must return to verification on session_expired`,
    );
  }
  assert.ok(
    /if \(submissionId\)[\s\S]{0,120}setStep\("photos"\)/.test(COMPONENT),
    "after re-verification the owner returns to the same submission and step",
  );
  const resetStart = COMPONENT.indexOf("const resetGallery");
  const resetEnd = COMPONENT.indexOf("/* ------------------------------ render", resetStart);
  const withoutExplicitReset = COMPONENT.slice(0, resetStart) + COMPONENT.slice(resetEnd);
  assert.ok(
    !/session_expired[\s\S]{0,200}setPhotos\(\[\]\)/.test(withoutExplicitReset),
    "successful uploads must never be discarded on expiry",
  );
});

/* -------------------- final correction: copy consistency ----------------- */

test("accountless recovery: verified email can resume or abandon its server draft", () => {
  const recovered = readRecoveredDraft({ draft: {
    submission_id: 42, status: "draft", phone: "+995555111222",
    deal_type: "rent", district_code: "gldani", street_display: "პეკინის ქ.",
    rooms: "2", area: "65", floor: "3/9", price_usd: 600,
    condition: "ახალი რემონტით", description: "ტექსტი", portal_url: null,
    owner_declared: true, preferred_cover: 0, bathrooms: "1",
    build_period: "2018", building_status: "ახალი აშენებული",
    project_type: "არასტანდარტული", balcony: "yes", amenities: ["elevator"],
    deposit_required: "yes", utilities_included: null, min_months: 12,
    pets_allowed: "no", positions: [0, 1], pending_positions: [2],
  }});
  assert.ok(recovered);
  assert.equal(recovered.submissionId, 42);
  assert.equal(recovered.facts.area, "65");
  assert.equal(recovered.facts.build_year, "2018");
  assert.equal(recovered.slots.filter((p) => p.state === "done").length, 2);
  assert.equal(recovered.slots.find((p) => p.position === 2).hold, true);
  assert.equal(recovered.coverId, "server-position-0");
  assert.equal(readRecoveredDraft({ draft: null }), null);
  assert.equal(readRecoveredDraft({ draft: { submission_id: 42, status: "promoted" } }), undefined);
  assert.ok(/existing-draft|დაუსრულებელი/.test(COMPONENT));
  assert.ok(/არსებული განცხადების გაგრძელება/.test(COMPONENT));
  assert.ok(/ძველი განცხადების წაშლა და თავიდან დაწყება/.test(COMPONENT));
  assert.ok(/call\("recover"/.test(COMPONENT));
  assert.ok(/call\("abandon"/.test(COMPONENT));
  assert.ok(/recover: "\/submission\/recover"/.test(ROUTE));
  assert.ok(/abandon: "\/submission\/abandon"/.test(ROUTE));
});

test("copy: phone collision remains generic and does not promise foreign recovery", () => {
  assert.ok(/ამ ტელეფონზე უკვე არის/.test(ROUTE_COPY), "phone variant uses ტელეფონზე");
  assert.ok(!/სხვა ელფოსტის განცხადება/.test(ROUTE_COPY), "foreign identity is not disclosed");
});

test("copy: concise photo limits, ქუჩა label, spaced countdown units", () => {
  assert.ok(!/JPEG\/PNG\/WebP/.test(COMPONENT), "WebP removed from the message");
  assert.ok(/მინიმუმ \{MIN_PHOTOS\}, მაქსიმუმ \{MAX_PHOTOS\} ფოტო\./.test(COMPONENT));
  assert.ok(!/iPhone-ის HEIC ჯერ არ მიიღება/.test(COMPONENT));
  assert.ok(!/დაუსრულებელი განცხადება 7 დღე ინახება/.test(COMPONENT));
  assert.match(COMPONENT, /ტელეფონი — რომელზეც დაგირეკავენ/);
  assert.ok(!/მყიდველები დაგირეკავენ/.test(COMPONENT));
  assert.ok(!/მთავარი ფოტო ატვირთულზე დაჭერით აირჩიე/.test(COMPONENT));
  assert.match(rejectedTypeNotice(1), /მხოლოდ JPEG ან PNG/, "the notice states it too");
  assert.ok(!/ქუჩა \/ უბანი/.test(COMPONENT), "label is just ქუჩა");
  assert.ok(/\$\{resendIn\} წმ/.test(COMPONENT), "countdown needs a space before წმ");
  assert.ok(!/\$\{resendIn\}წმ/.test(COMPONENT));
});

/* ------------- recovery contract: authoritative reconciliation ----------- */

const STATUS_OK = { submission_id: 42, status: "draft", positions: [0], pending_positions: [] };

test("recovery: a lost response where the server DID store settles the same slot", () => {
  const held = [slot({ id: "x", position: 0, state: "failed", hold: true })];
  // The held slot survives a refresh; that is what stops a new file inheriting it.
  assert.deepEqual(restorableSlots(held).map((s) => s.id), ["x"]);
  const status = parseStatusResponse(STATUS_OK, 42);
  const out = reconcileSlots(restorableSlots(held), status);
  assert.equal(out.ok, true);
  assert.equal(out.slots[0].id, "x", "the original slot is settled, not a new one");
  assert.equal(out.slots[0].state, "done");
  assert.equal(out.slots[0].position, 0);
  assert.equal(out.slots[0].hold, false);
});

test("recovery: a lost response where the server did NOT store releases it", () => {
  const held = [slot({ id: "x", position: 0, state: "failed", hold: true })];
  const status = parseStatusResponse({ ...STATUS_OK, positions: [] }, 42);
  const out = reconcileSlots(held, status);
  assert.equal(out.ok, true);
  assert.equal(out.slots[0].state, "failed");
  assert.equal(out.slots[0].position, null, "the position is released for reuse");
  assert.equal(out.slots[0].hold, false);
  assert.equal(canRemove(out.slots[0]), true, "and it can now be retried or removed");
});

test("recovery: a new file can never inherit an old held position", () => {
  const held = slot({ id: "old", position: 0, state: "failed", hold: true });
  const fresh = slot({ id: "new" });
  // While the hold stands, the fresh file cannot start at all.
  assert.deepEqual(nextUploadBatch([held, fresh]), []);
  // Reconciliation settles the ORIGINAL slot; the new one stays pending.
  const out = reconcileSlots([held, fresh], parseStatusResponse(STATUS_OK, 42));
  assert.equal(out.slots.find((s) => s.id === "old").state, "done");
  assert.equal(out.slots.find((s) => s.id === "new").state, "pending");
  assert.equal(out.slots.find((s) => s.id === "new").position, null);
});

test("recovery: held slots survive restoration; unstartable ones do not", () => {
  const stored = [
    slot({ id: "done", position: 0, state: "done" }),
    slot({ id: "held", position: 1, state: "failed", hold: true }),
    slot({ id: "never", state: "failed" }),
    slot({ id: "pending" }),
  ];
  assert.deepEqual(restorableSlots(stored).map((s) => s.id), ["done", "held"]);
  assert.equal(needsReconcile(restorableSlots(stored)), true);
  assert.equal(needsReconcile([slot({ id: "d", state: "done", position: 0 })]), false);
});

test("recovery: session expiry during a held retry keeps position and hold", () => {
  const held = [slot({ id: "x", position: 0, state: "uploading", hold: true })];
  const after = onTicketFailure(held, "x");
  assert.equal(after[0].position, 0, "the uncertain authority survives");
  assert.equal(after[0].hold, true);
  assert.equal(canRemove(after[0]), false);

  // A ticket failure before any uncertain PUT may release.
  const plain = onTicketFailure([slot({ id: "y", position: 0, state: "uploading" })], "y");
  assert.equal(plain[0].position, null);
  assert.equal(plain[0].hold, false);
});

test("recovery: malformed, foreign or duplicated status responses are refused", () => {
  assert.equal(parseStatusResponse(null, 42), null, "endpoint unavailable");
  assert.equal(parseStatusResponse({}, 42), null);
  assert.equal(parseStatusResponse({ ...STATUS_OK, submission_id: 43 }, 42), null,
    "another submission's status must never be applied");
  assert.equal(parseStatusResponse({ ...STATUS_OK, positions: [0, 0] }, 42), null, "duplicates");
  assert.equal(parseStatusResponse({ ...STATUS_OK, positions: ["0"] }, 42), null, "nonnumeric");
  assert.equal(parseStatusResponse({ ...STATUS_OK, positions: [-1] }, 42), null);
  assert.equal(parseStatusResponse({ ...STATUS_OK, positions: [MAX_PHOTOS] }, 42), null);
  assert.equal(parseStatusResponse({ ...STATUS_OK, status: "" }, 42), null);
  assert.equal(parseStatusResponse({ ...STATUS_OK, positions: "0,1" }, 42), null);
  // Sorted, deterministic output.
  assert.deepEqual(parseStatusResponse({ ...STATUS_OK, positions: [2, 0, 1] }, 42).positions, [0, 1, 2]);
});

test("recovery: a committed server position lost during refresh is adopted", () => {
  const local = [slot({ id: "a", position: 0, state: "done" })];
  const status = parseStatusResponse({ ...STATUS_OK, positions: [0, 1] }, 42);
  const out = reconcileSlots(local, status);
  assert.equal(out.ok, true);
  const adopted = out.slots.find((s) => s.position === 1);
  assert.equal(adopted?.id, "server-position-1");
  assert.equal(adopted?.state, "done");
  assert.equal(adopted?.hold, false);
});

test("recovery: local claims done but the server lacks the position", () => {
  const local = [slot({ id: "a", position: 0, state: "done" })];
  const out = reconcileSlots(local, parseStatusResponse({ ...STATUS_OK, positions: [] }, 42));
  assert.equal(out.ok, true);
  assert.equal(out.slots[0].state, "failed", "a false local success is corrected");
  assert.equal(out.slots[0].position, null);
});

test("recovery: three completed uploads refresh and finalize unchanged", () => {
  const done = [0, 1, 2].map((p) => slot({ id: `s${p}`, position: p, state: "done" }));
  assert.deepEqual(restorableSlots(done).map((s) => s.id), ["s0", "s1", "s2"]);
  assert.equal(needsReconcile(done), false, "settled galleries need no reconciliation");
  assert.equal(galleryReady(done), true);
  const out = reconcileSlots(done, parseStatusResponse({ ...STATUS_OK, positions: [0, 1, 2] }, 42));
  assert.equal(out.ok, true);
  assert.equal(galleryReady(out.slots), true);
});

test("recovery: a gallery with an unresolved hold can never finalize", () => {
  const slots = [
    slot({ id: "a", position: 0, state: "done" }),
    slot({ id: "b", position: 1, state: "done" }),
    slot({ id: "c", position: 2, state: "done" }),
    slot({ id: "u", position: 3, state: "failed", hold: true }),
  ];
  assert.equal(galleryReady(slots), false);
  // Only reconciliation can clear it, one way or the other.
  const kept = reconcileSlots(slots, parseStatusResponse({ ...STATUS_OK, positions: [0, 1, 2] }, 42));
  assert.equal(kept.ok, true);
  const released = kept.slots.find((s) => s.id === "u");
  assert.equal(released.state, "failed");
  assert.equal(released.position, null);
  assert.equal(released.hold, false);
  // It is now an ordinary removable failure, and removing it finalizes.
  assert.equal(galleryReady(kept.slots), false, "a failed slot still blocks until removed");
  assert.equal(canRemove(released), true);
  assert.equal(galleryReady(removeSlot(kept.slots, "u")), true);
});

test("recovery wiring: status errors keep polling and reset fences stale responses", () => {
  const source = readFileSync(new URL("../components/UploadFlow.tsx", import.meta.url), "utf8");
  assert.match(source, /await reconcile\(\);[\s\S]{0,240}setTimeout\(\(\) => \{ void poll\(\); \}, 5_000\)/);
  assert.match(source, /requestGeneration !== galleryRequestGenerationRef\.current/);
  assert.ok((source.match(/galleryRequestGenerationRef\.current \+= 1/g) ?? []).length >= 2);
  assert.match(source, /await call\("gallery-reset"[\s\S]{0,240}galleryRequestGenerationRef\.current \+= 1[\s\S]{0,160}if \(r\.error\)/);
});

/* ------------------- copy addendum: message / control agreement ---------- */

test("copy: every outcome's message agrees with the controls it offers", () => {
  const cases = [
    { outcome: "done", status: 201, detail: "" },
    { outcome: "release", status: 415, detail: "unsupported media type" },
    { outcome: "release", status: 409, detail: "submission is not accepting images" },
    { outcome: "hold", status: 503, detail: "upstream unavailable" },
    { outcome: "hold", status: 500, detail: "" },
  ];
  for (const c of cases) {
    assert.equal(positionOutcome(c.status, c.detail), c.outcome, `${c.status} ${c.detail}`);
    const after = applyUploadOutcome(
      [slot({ id: "x", position: 0, state: "uploading" })],
      "x", c.outcome, c.status, c.detail,
    )[0];
    const message = uploadOutcomeMessage(c.outcome);

    if (c.outcome === "done") {
      assert.equal(message, null, "a success shows no failure message");
      assert.equal(after.state, "done");
      continue;
    }
    if (c.outcome === "release") {
      // Proven empty: the remove control is available, so the copy may offer it.
      assert.equal(canRemove(after), true, `${c.status} must be removable`);
      assert.equal(message, UPLOAD_FAILURE_MESSAGES.release);
      assert.match(message, /წაშალე/, "removable failures may say წაშალე");
      continue;
    }
    // Unknown: no remove control, so the copy must not mention წაშლა at all.
    assert.equal(canRemove(after), false, `${c.status} must not be removable`);
    assert.equal(message, UPLOAD_FAILURE_MESSAGES.hold);
    assert.ok(!/წაშალე|წაშლა/.test(message), "a held photo must not be told to delete it");
    assert.match(message, /ამავე ფოტოზე/, "it must point at the same photo");
  }
});

test("copy: the removable-failure sentence never reaches a held slot", () => {
  assert.ok(
    !/ეს ფოტო ვერ აიტვირთა\. თავიდან სცადე ან წაშალე\./.test(COMPONENT),
    "the component must not hardcode the removable sentence; it comes from the outcome",
  );
  assert.ok(/uploadOutcomeMessage\(outcome\)/.test(COMPONENT), "the message follows the outcome");
  assert.ok(/uploadOutcomeMessage\("hold"\)/.test(COMPONENT), "transport failure uses the held copy");
});

test("copy: rejected file types state the rule, not phone settings advice", () => {
  const notice = rejectedTypeNotice(2);
  assert.equal(notice, "2 ფაილი არ აიტვირთა. მხოლოდ JPEG ან PNG — iPhone-ის HEIC არ მიიღება.");
  assert.ok(!/გამორთე|გადაიყვანე/.test(notice), "never tell the owner to change phone settings");
  assert.ok(!/მხარდაჭერილი/.test(COMPONENT), "the old unsupported-file wording is gone");
  assert.ok(!/WebP/i.test(COMPONENT), "no WebP promise anywhere");
});

test("copy: Grok-approved strings survive verbatim", () => {
  for (const approved of [
    "დაუსრულებელი განცხადება გაქვს",
    "ბრაუზერში არჩეული ფაილები არ ინახება",
    "განაგრძე",
    "თავიდან დაწყება",
    "ატვირთვის დროს გაწყვეტილი ფოტოები თავიდან აირჩიე.",
    "წაშლა",
    "უკან",
    "მდგომარეობა",
    "მადლობა, განცხადება მიღებულია. გამოქვეყნდება გადამოწმების შემდეგ.",
  ]) {
    assert.ok(COMPONENT.includes(approved), `approved string lost: ${approved}`);
  }
  assert.ok(/\$\{resendIn\} წმ/.test(COMPONENT), "ხელახლა გაგზავნა (54 წმ)");
  assert.ok(/შეგიძლია გააგრძელო ან წაშალო/.test(ROUTE_COPY), "recoverable existing-draft message");
});

test("copy: forbidden promises stay absent", () => {
  for (const [banned, why] of [
    [/WebP/i, "WebP support"],
    [/სხვა მოწყობილობიდან/, "cross-device resume"],
    [/არაფერი დაიკარგა|ადგილზეა/, "no-data-loss promise"],
    [/24 სთ/, "24-hour publication"],
  ]) {
    assert.ok(!banned.test(COMPONENT), `component promises ${why}`);
    assert.ok(!banned.test(ROUTE), `route promises ${why}`);
  }
  // Nothing may imply the listing is already public.
  assert.ok(/გამოქვეყნდება გადამოწმების შემდეგ/.test(COMPONENT));
  assert.ok(!/მალე დაგირეკავთ|უპასუხე უცნობ ნომერს/.test(COMPONENT));
});

/* ------------------ pending-position race: bounded correction ------------ */

const PENDING = (over = {}) => ({
  submission_id: 42, status: "draft", positions: [], pending_positions: [], ...over,
});

test("race 1: a 503 then status before the worker finishes keeps the hold", () => {
  // 503 -> hold, position retained.
  let slots = applyUploadOutcome(
    [slot({ id: "x", position: 0, state: "uploading" })], "x", "hold", 503, "");
  assert.equal(slots[0].hold, true);
  assert.equal(slots[0].position, 0);

  // Status: nothing committed, but position 0 is still in flight.
  const status = parseStatusResponse(PENDING({ pending_positions: [0] }), 42);
  assert.ok(status);
  const out = reconcileSlots(slots, status);
  assert.equal(out.ok, true);
  assert.equal(out.slots[0].hold, true, "a pending position must NOT be released");
  assert.equal(out.slots[0].position, 0);
  assert.equal(canRemove(out.slots[0]), false);
  assert.equal(galleryReady(out.slots), false, "finalization stays blocked");
});

test("race 2: a new file cannot claim a pending position", () => {
  const held = slot({ id: "old", position: 0, state: "failed", hold: true });
  const fresh = slot({ id: "new" });
  const out = reconcileSlots([held, fresh], parseStatusResponse(PENDING({ pending_positions: [0] }), 42));
  assert.equal(out.ok, true);
  // The old slot still owns 0, so the next claim is 1 — never 0.
  assert.equal(claimPosition(out.slots), 1);
  // And nothing may start while the hold stands.
  assert.deepEqual(nextUploadBatch(out.slots), []);
  assert.equal(out.slots.find((s) => s.id === "new").position, null);
});

test("race 3: if the old worker commits, status settles the original slot", () => {
  const held = [slot({ id: "x", position: 0, state: "failed", hold: true })];
  const out = reconcileSlots(held, parseStatusResponse(PENDING({ positions: [0] }), 42));
  assert.equal(out.ok, true);
  assert.equal(out.slots[0].id, "x", "the original slot, not a later one");
  assert.equal(out.slots[0].state, "done");
  assert.equal(out.slots[0].hold, false);
  assert.equal(out.slots[0].position, 0);
});

test("race 4: once the horizon expires with no commit, the position releases", () => {
  const held = [slot({ id: "x", position: 0, state: "failed", hold: true })];
  // Neither committed nor pending: the server has stopped expecting it.
  const out = reconcileSlots(held, parseStatusResponse(PENDING(), 42));
  assert.equal(out.ok, true);
  assert.equal(out.slots[0].state, "failed");
  assert.equal(out.slots[0].position, null);
  assert.equal(out.slots[0].hold, false);
  assert.equal(canRemove(out.slots[0]), true);
  assert.equal(claimPosition(out.slots), 0, "the position is genuinely free again");
});

test("race 6: overlapping, duplicate, foreign or missing sets fail closed", () => {
  // Overlap between committed and pending is not an answer we can reason about.
  assert.equal(parseStatusResponse(PENDING({ positions: [0], pending_positions: [0] }), 42), null);
  // A server that cannot report pending positions at all is refused.
  assert.equal(parseStatusResponse({ submission_id: 42, status: "draft", positions: [] }, 42), null);
  assert.equal(parseStatusResponse(PENDING({ pending_positions: [0, 0] }), 42), null);
  assert.equal(parseStatusResponse(PENDING({ pending_positions: ["0"] }), 42), null);
  assert.equal(parseStatusResponse(PENDING({ pending_positions: [-1] }), 42), null);
  assert.equal(parseStatusResponse(PENDING({ pending_positions: [MAX_PHOTOS] }), 42), null);
  assert.equal(parseStatusResponse(PENDING({ submission_id: 43 }), 42), null);
  assert.equal(parseStatusResponse(null, 42), null);

  // Failing closed means the hold is preserved: no reconciliation is applied.
  const held = [slot({ id: "x", position: 0, state: "failed", hold: true })];
  assert.equal(needsReconcile(held), true);
  assert.equal(galleryReady(held), false);
});

test("race 6b: a pending server position lost during refresh is held and polled", () => {
  const local = [slot({ id: "a", position: 0, state: "done" })];
  const out = reconcileSlots(local, parseStatusResponse(PENDING({ positions: [0], pending_positions: [1] }), 42));
  assert.equal(out.ok, true);
  const adopted = out.slots.find((s) => s.position === 1);
  assert.equal(adopted?.id, "server-position-1");
  assert.equal(adopted?.state, "failed");
  assert.equal(adopted?.hold, true);
  assert.equal(needsReconcile(out.slots), true);
});

test("race 7: finalization is blocked while any pending hold exists", () => {
  const slots = [
    slot({ id: "a", position: 0, state: "done" }),
    slot({ id: "b", position: 1, state: "done" }),
    slot({ id: "c", position: 2, state: "done" }),
    slot({ id: "p", position: 3, state: "failed", hold: true }),
  ];
  const out = reconcileSlots(slots, parseStatusResponse(
    PENDING({ positions: [0, 1, 2], pending_positions: [3] }), 42));
  assert.equal(out.ok, true);
  assert.equal(out.slots.find((s) => s.id === "p").hold, true);
  assert.equal(galleryReady(out.slots), false, "three good photos are not enough while one is in flight");
  assert.equal(needsReconcile(out.slots), true, "reconciliation stays owed");
});

/* ------------------------------------------------------------------------- *
 *  Attribute parity (2026-08-16) — derived from the DISPLAY AUTHORITY.
 *
 *  The required field set below is NOT a hand-written list: it is extracted
 *  from app/listing/[id]/page.tsx (every `listing.X` the detail page reads,
 *  every `facts.X` its terms renderer reads) and from the canonical
 *  AMENITIES registry import. If the page starts displaying a new field, or
 *  the registry gains a key, these tests fail until the owner path covers it.
 * ------------------------------------------------------------------------- */
import { AMENITIES } from "../lib/amenities.ts";
import { OWNER_PROJECT_TYPES, OWNER_STATUSES } from "../lib/labels.ts";

const PAGE = readFileSync(
  fileURLToPath(new URL("../app/listing/[id]/page.tsx", import.meta.url)),
  "utf8",
);

/** Display field -> owner payload key. Translation only — the REQUIRED set
 *  comes from the page source, so this map cannot silently shrink it. */
const FIELD_TO_PAYLOAD = {
  deal_type: "deal_type",
  district_code: "district_code",
  street_display: "street_display",
  rooms: "rooms",
  area: "area",
  floor: "floor",
  price_usd: "price_usd",
  condition: "condition",
  description: "description",
  phone: "phone",
  bathrooms: "bathrooms",
  // listings.build_period <- the owner's typed construction year
  build_period: "build_period",
  // listings.status is the BUILDING axis; the owner key is building_status
  // so it can never collide with the submission workflow status
  status: "building_status",
  project_type: "project_type",
  balcony: "balcony",
};

/** Fields the page reads that are DELIBERATELY not owner inputs. Each entry
 *  must carry its reason; an unexplained exclusion fails the parity test. */
const NON_OWNER_DISPLAY_FIELDS = {
  id: "database identity",
  district: "display fallback; canonical input is district_code",
  district_code: null, // in FIELD_TO_PAYLOAD; listed here never
  description_ka: "description worker output, never user input",
  description_status: "pipeline state (internal)",
  amenities: "covered by the amenity-registry parity test below",
  desc_facts: "covered by the rental-terms parity test below",
  has_phone: "derived from phone",
  alt_phones: "dedupe output (merged duals), system-owned",
  first_seen_at: "system timestamp",
  last_seen_at: "system timestamp",
  last_checked_at: "monitor state (internal)",
  price_drop_from_usd: "price-drop tracker output",
  price_dropped_at: "price-drop tracker output",
  condition_code: "derived from condition by normalize_lib",
  image_status: "pipeline state (internal)",
  views: "source metric, never owner input",
};

function fullFacts() {
  return {
    ...goodFacts(),
    deal_type: "rent",
    price_usd: "600",
    floor: "4/9",
    bathrooms: "2",
    build_year: "2015",
    building_status: OWNER_STATUSES[0],
    project_type: OWNER_PROJECT_TYPES[0],
    balcony: "yes",
    amenities: AMENITIES.filter((a) => a.key !== "pets_allowed").map((a) => a.key),
    deposit_required: "no",
    utilities_included: "yes",
    min_months: "6",
    pets_allowed: "yes",
  };
}

function fullPayload() {
  const built = buildCreatePayload({
    session: "s",
    phone: "555 12 34 56",
    facts: fullFacts(),
    description: "აღწერა",
    declared: true,
    idem: "i".repeat(16),
  });
  assert.equal(built.ok, true);
  return built.payload;
}

test("parity: every structured field the listing page displays has an owner payload path", () => {
  const displayed = new Set(
    [...PAGE.matchAll(/listing\.([a-z_]+)/g)].map((m) => m[1]),
  );
  assert.ok(displayed.size >= 15, "page source no longer parseable");
  const payload = fullPayload();
  for (const field of displayed) {
    const key = FIELD_TO_PAYLOAD[field];
    if (key) {
      assert.ok(
        payload[key] !== undefined && payload[key] !== "",
        `displayed field listing.${field} has no owner payload path (${key})`,
      );
      continue;
    }
    assert.ok(
      field in NON_OWNER_DISPLAY_FIELDS,
      `listing.${field} is displayed but neither owner-mapped nor an explained exclusion`,
    );
  }
});

test("parity: every canonical displayed amenity key has an owner path", () => {
  const payload = fullPayload();
  for (const a of AMENITIES) {
    if (a.key === "pets_allowed") {
      // pets is the rent-terms tri-state; facts.pets_allowed='yes' merges
      // into the amenity map inside listings_public — same rendered result
      assert.equal(payload.pets_allowed, "yes");
      continue;
    }
    assert.ok(
      Array.isArray(payload.amenities) && payload.amenities.includes(a.key),
      `amenity ${a.key} is displayed but has no owner payload path`,
    );
  }
});

test("parity: every rental term the page renders from desc_facts has an owner path", () => {
  const termKeys = new Set(
    [...PAGE.matchAll(/facts\.([a-z_]+)/g)].map((m) => m[1]),
  );
  assert.ok(termKeys.size >= 4, "terms renderer no longer parseable");
  const payload = fullPayload();
  for (const key of termKeys) {
    assert.ok(
      payload[key] !== undefined,
      `rental term ${key} is rendered but has no owner payload path`,
    );
  }
});

test("parity: the amenity checkboxes render from the registry import, not a copied list", () => {
  assert.match(COMPONENT, /import \{ AMENITIES \} from "@\/lib\/amenities"/);
  assert.match(COMPONENT, /AMENITIES\.filter\(\(a\) => a\.key !== "pets_allowed"\)/);
  assert.match(COMPONENT, /amenity_\$\{a\.key\}/);
  for (const name of [
    "building_status",
    "project_type",
    "build_year",
    "bathrooms",
    "balcony",
    "deposit_required",
    "utilities_included",
    "min_months",
    "pets_allowed",
  ]) {
    assert.match(
      COMPONENT,
      new RegExp(`name="${name}"`),
      `form control ${name} missing`,
    );
  }
});

test("unchecked amenities stay unknown: no amenities key at all", () => {
  const facts = { ...fullFacts(), amenities: [] };
  const built = buildCreatePayload({
    session: "s", phone: "5", facts, description: "d", declared: true, idem: "x".repeat(16),
  });
  assert.equal(built.ok, true);
  assert.equal("amenities" in built.payload, false);
});

test("a checked subset sends exactly that subset — never false for the rest", () => {
  const facts = { ...fullFacts(), amenities: ["elevator"] };
  const built = buildCreatePayload({
    session: "s", phone: "5", facts, description: "d", declared: true, idem: "x".repeat(16),
  });
  assert.deepEqual(built.payload.amenities, ["elevator"]);
});

test("rental terms never leak into a sale payload, even from stale state", () => {
  const facts = { ...fullFacts(), deal_type: "sale", price_usd: "85000" };
  const built = buildCreatePayload({
    session: "s", phone: "5", facts, description: "d", declared: true, idem: "x".repeat(16),
  });
  assert.equal(built.ok, true);
  for (const key of ["deposit_required", "utilities_included", "min_months", "pets_allowed"]) {
    assert.equal(key in built.payload, false, key);
  }
  // structured building facts are deal-independent and stay
  assert.equal(built.payload.building_status, OWNER_STATUSES[0]);
});

test("unknown numeric values fail closed instead of being coerced", () => {
  for (const over of [
    { min_months: "0" },
    { min_months: "61" },
    { build_year: "20" },
    { build_year: "1799" },
  ]) {
    const built = buildCreatePayload({
      session: "s", phone: "5", facts: { ...fullFacts(), ...over },
      description: "d", declared: true, idem: "x".repeat(16),
    });
    assert.equal(built.ok, false, JSON.stringify(over));
  }
});

test("unset parity fields are omitted — absent means unknown, not empty", () => {
  const built = buildCreatePayload({
    session: "s", phone: "5", facts: goodFacts(), description: "d",
    declared: true, idem: "x".repeat(16),
  });
  assert.equal(built.ok, true);
  for (const key of [
    "bathrooms", "build_period", "building_status", "project_type",
    "balcony", "amenities", "deposit_required", "utilities_included",
    "min_months", "pets_allowed",
  ]) {
    assert.equal(key in built.payload, false, key);
  }
});

test("an old saved draft (no parity fields) restores safely and still submits", () => {
  // exactly what the pre-parity serializer wrote: v2, facts without the
  // new keys — the version is NOT bumped so these drafts keep restoring
  const oldFacts = {
    deal_type: "rent", district_code: "gldani", street_display: "პეკინის ქ.",
    rooms: "2", area: "65", floor: "", price_usd: "600",
    condition: "ახალი რემონტით", portal_url: "",
  };
  const raw = JSON.stringify({
    v: 2, session: "sess", email: "a@b.ge", phone: "5", step: "photos",
    facts: oldFacts, description: "d", declared: true, submissionId: 12,
    createIdem: "k".repeat(16), coverId: null, photos: [],
  });
  const restored = restoreState(raw);
  assert.ok(restored, "old draft must restore");
  assert.deepEqual(restored.facts.amenities, []);
  assert.equal(restored.facts.building_status, "");
  assert.equal(restored.facts.pets_allowed, "");
  const built = buildCreatePayload({
    session: restored.session, phone: restored.phone, facts: restored.facts,
    description: restored.description, declared: restored.declared,
    idem: restored.createIdem,
  });
  assert.equal(built.ok, true);
});

test("corrupted stored parity fields reset to unknown rather than poisoning the payload", () => {
  const raw = JSON.stringify({
    v: 2, session: "sess", email: "", phone: "", step: "facts",
    facts: { amenities: "elevator", min_months: 6, balcony: ["yes"] },
    description: "", declared: false, submissionId: null,
    createIdem: "", coverId: null, photos: [],
  });
  const restored = restoreState(raw);
  assert.ok(restored);
  assert.deepEqual(restored.facts.amenities, []);
  assert.equal(restored.facts.min_months, "");
  assert.equal(restored.facts.balcony, "");
});
