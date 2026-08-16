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

  // Only the exact already-ingested 409 settles a slot; see "position 3".
  assert.equal(classifyUploadResponse(409, "position already has an image"), "done");
  assert.equal(classifyUploadResponse(409), "failed");
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

test("product 8+9: no two-card absolute and no 24-hour promise", () => {
  assert.ok(!/ორ ბარათს არ ვაჩვენებთ/.test(COMPONENT), "absolute two-card promise removed");
  assert.ok(!/24 სთ/.test(COMPONENT), "24-hour promise removed");
  assert.ok(
    /ერთ ბინას ერთ განცხადებად ვაჩვენებთ/.test(COMPONENT),
    "the honest one-listing wording is required",
  );
  assert.ok(
    /შენი myhome\/ss განცხადება ამით\s+არ იშლება/.test(COMPONENT),
    "must say we do not delete the owner's portal listing",
  );
  assert.ok(/გამოქვეყნებული ჯერ არ არის/.test(COMPONENT));
  assert.ok(/უპასუხე უცნობ ნომერს/.test(COMPONENT), "unknown-number reminder kept");
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
    /setStep\(submissionId \? "photos" : "phone"\)/.test(COMPONENT),
    "after re-verification the owner returns to the same submission and step",
  );
  assert.ok(
    !/session_expired[\s\S]{0,200}setPhotos\(\[\]\)/.test(COMPONENT),
    "successful uploads must never be discarded on expiry",
  );
});

/* -------------------- final correction: copy consistency ----------------- */

test("copy: existing-draft message is actionable and honest", () => {
  assert.ok(/იმავე ბრაუზერიდან განაგრძე/.test(ROUTE), "must say same browser");
  assert.ok(/7 დღე დაიცადე და დაიწყე თავიდან/.test(ROUTE));
  assert.ok(/ამ ტელეფონზე უკვე გაქვს/.test(ROUTE), "phone variant uses ტელეფონზე");
  assert.ok(!/სხვა მოწყობილობიდან/.test(ROUTE), "no cross-device resume claim");
});

test("copy: JPEG/PNG only, ქუჩა label, spaced countdown units", () => {
  assert.ok(!/JPEG\/PNG\/WebP/.test(COMPONENT), "WebP removed from the message");
  // The rule now reads as prose in both places, not a parenthesised list.
  assert.ok(/მხოლოდ JPEG და PNG/.test(COMPONENT), "static photos copy states the rule");
  assert.match(rejectedTypeNotice(1), /მხოლოდ JPEG ან PNG/, "the notice states it too");
  assert.ok(!/ქუჩა \/ უბანი/.test(COMPONENT), "label is just ქუჩა");
  assert.ok(/\$\{resendIn\} წმ/.test(COMPONENT), "countdown needs a space before წმ");
  assert.ok(!/\$\{resendIn\}წმ/.test(COMPONENT));
});

/* ------------- recovery contract: authoritative reconciliation ----------- */

const STATUS_OK = { submission_id: 42, status: "draft", positions: [0] };

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

test("recovery: a server position with no local slot stops rather than guessing", () => {
  const local = [slot({ id: "a", position: 0, state: "done" })];
  const status = parseStatusResponse({ ...STATUS_OK, positions: [0, 1] }, 42);
  const out = reconcileSlots(local, status);
  assert.equal(out.ok, false);
  assert.equal(out.reason, "server_position_without_slot");
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
    "მხოლოდ JPEG და PNG. iPhone-ის HEIC ჯერ არ მიიღება.",
    "უკან",
    "მდგომარეობა",
    "მიღებულია. გამოქვეყნებული ჯერ არ არის. მალე დაგირეკავთ.",
  ]) {
    assert.ok(COMPONENT.includes(approved), `approved string lost: ${approved}`);
  }
  assert.ok(/\$\{resendIn\} წმ/.test(COMPONENT), "ხელახლა გაგზავნა (54 წმ)");
  assert.ok(/იმავე ბრაუზერიდან განაგრძე/.test(ROUTE), "same-browser existing-draft message");
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
  assert.ok(/გამოქვეყნებული ჯერ არ არის/.test(COMPONENT));
});
