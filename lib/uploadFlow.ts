/**
 * Pure logic for the owner upload flow.
 *
 * UploadFlow.tsx is a React client component: `node --test` cannot render it,
 * and this repository has no jsdom or testing-library. Every rule that can be
 * stated without a DOM lives here so it is directly testable, and the component
 * becomes a thin shell over these functions.
 *
 * Server contracts this file must respect (intake_api.py):
 *   - /submission/create requires owner_declared === true (400 otherwise) and
 *     accepts description. There is no update endpoint, so description and the
 *     declaration must be collected BEFORE the draft is created.
 *   - /submission/ticket takes a numeric position; ingesting the same position
 *     twice is 409 "position already has an image".
 *   - /submission/finalize requires uploaded positions to be exactly
 *     0..n-1 (422 "photo positions must be contiguous") and preferred_cover to
 *     be one of those uploaded positions.
 */

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 20;
export const MAX_CONCURRENT_UPLOADS = 2;
export const STORAGE_KEY = "mp_upload";
export const STATE_VERSION = 2;

/** JPEG and PNG only. iPhone HEIC is explicitly not accepted in this version. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];

export type Step =
  | "email"
  | "code"
  | "phone"
  | "facts"
  | "photos"
  | "describe"
  | "done";

export type Facts = {
  deal_type: string;
  district_code: string;
  street_display: string;
  rooms: string;
  area: string;
  floor: string;
  price_usd: string;
  /** Raw Georgian spelling from labels.ts OWNER_CONDITIONS; required. */
  condition: string;
  portal_url: string;
  /* ---- attribute parity (2026-08-16). ALL optional: "" / [] mean UNKNOWN
     and are omitted from the payload — the server stores NULL and the card
     hides the row. Enum values are the closed vocabularies in labels.ts /
     lib/amenities.ts, mirrored by the API's fail-closed validation. ---- */
  /** "1".."5" — the numeric strings both portals already store. */
  bathrooms: string;
  /** Bare construction year, e.g. "2015" (listings.build_period). */
  build_year: string;
  /** labels.ts OWNER_STATUSES; maps to listings.status (the BUILDING axis —
   *  named build**ing**_status end-to-end so it can never collide with the
   *  submission's workflow status). */
  building_status: string;
  /** labels.ts OWNER_PROJECT_TYPES. */
  project_type: string;
  /** "yes" | "0" (ss's committed vocabulary) | "" unknown. */
  balcony: string;
  /** Checked amenity keys from lib/amenities.ts AMENITIES (presence map:
   *  unchecked = unknown, never false). pets_allowed is not an entry here —
   *  it is the rent-terms tri-state below. */
  amenities: string[];
  /** Rent only. "yes" | "no" | "" unknown. */
  deposit_required: string;
  /** Rent only. "yes" | "" unknown (a public "no" is never rendered). */
  utilities_included: string;
  /** Rent only. Months as typed, "" unknown. */
  min_months: string;
  /** Rent only. "yes" | "no" | "" unknown. */
  pets_allowed: string;
};

export type SlotState = "pending" | "uploading" | "done" | "failed";

/** A chosen file. `position` is the server position, claimed only while the
 *  slot holds it; a released position is reused so the gallery stays
 *  contiguous. `id` is stable so cover identity survives removals. */
export type PhotoSlot = {
  id: string;
  name: string;
  size: number;
  type: string;
  position: number | null;
  state: SlotState;
  /** Permanently failed slots may be removed; retryable ones may be retried. */
  permanent: boolean;
  /**
   * True when a failure left it unknown whether the server stored an image at
   * this position. The position is retained, retry is required, and no later
   * upload may advance past it — releasing it could orphan an ingested row and
   * break the contiguity finalize demands.
   */
  hold: boolean;
};

export function emptyFacts(): Facts {
  return {
    deal_type: "sale",
    district_code: "",
    street_display: "",
    rooms: "2",
    area: "",
    floor: "",
    price_usd: "",
    condition: "",
    portal_url: "",
    bathrooms: "",
    build_year: "",
    building_status: "",
    project_type: "",
    balcony: "",
    amenities: [],
    deposit_required: "",
    utilities_included: "",
    min_months: "",
    pets_allowed: "",
  };
}

export type FloorParts = {
  unit: string;
  total: string;
};

/**
 * The API stores floors as `unit/total`, but owners should never have to find
 * or type a slash. These helpers keep the storage contract compatible while
 * the form presents two ordinary number fields.
 */
export function splitFloorParts(value: string): FloorParts {
  const trimmed = value.trim();
  if (!trimmed) return { unit: "", total: "" };
  if (/^\d{1,3}$/.test(trimmed)) return { unit: trimmed, total: "" };
  const match = trimmed.match(/^(\d{0,3})\/(\d{0,3})$/);
  return match ? { unit: match[1], total: match[2] } : { unit: "", total: "" };
}

export function joinFloorParts(unit: string, total: string): string {
  const clean = (value: string) => {
    const trimmed = value.trim();
    return /^\d{0,3}$/.test(trimmed) ? trimmed : "";
  };
  const cleanUnit = clean(unit);
  const cleanTotal = clean(total);
  if (!cleanUnit && !cleanTotal) return "";
  return `${cleanUnit}/${cleanTotal}`;
}

export function floorPairComplete(value: string): boolean {
  if (!value.trim()) return true;
  const { unit, total } = splitFloorParts(value);
  return Boolean(unit && total);
}

/**
 * The facts step is complete only once a condition has been chosen.
 *
 * The vocabulary itself stays in labels.ts (the two-places rule) and reaches
 * the user through a closed <select>, so this layer requires presence rather
 * than restating the list a third time.
 */
export function factsComplete(f: Facts): boolean {
  return Boolean(
    f.district_code &&
      f.street_display.trim().length >= 2 &&
      f.area.trim() &&
      floorPairComplete(f.floor) &&
      f.price_usd.trim() &&
      f.condition.trim(),
  );
}

/* ------------------------------------------------------------------ config */

export type EnvLike = Record<string, string | undefined>;

/**
 * A production build with no configured upload origin must not quietly point
 * owners at a hardcoded host. Fail closed; development keeps a local default.
 */
export function resolveUploadBase(env: EnvLike): { url: string } | { error: string } {
  const configured = (env.NEXT_PUBLIC_INTAKE_UPLOAD_URL || "").trim();
  if (configured) return { url: configured.replace(/\/+$/, "") };
  if ((env.NODE_ENV || "") === "production") {
    return { error: "upload_not_configured" };
  }
  return { url: "http://localhost:8000" };
}

/** Turnstile is mandatory in production and fails closed when unset. */
export function turnstileRequirement(env: EnvLike): {
  required: boolean;
  configured: boolean;
  ok: boolean;
} {
  const required = (env.NODE_ENV || "") === "production";
  const configured = Boolean((env.TURNSTILE_SECRET || "").trim());
  return { required, configured, ok: configured || !required };
}

/** Client-side sibling: the widget key must exist in a production build. */
export function turnstileSiteKeyRequirement(env: EnvLike): {
  required: boolean;
  configured: boolean;
  ok: boolean;
} {
  const required = (env.NODE_ENV || "") === "production";
  const configured = Boolean((env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim());
  return { required, configured, ok: configured || !required };
}

/* -------------------------------------------------- response field readers */

/**
 * A successful response that omits the identifier, or carries an empty or
 * non-numeric one, must never advance the step. Every reader returns null on
 * anything it cannot positively validate.
 */
export function readOpaqueToken(data: unknown, key: string): string | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as Record<string, unknown>)[key];
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

/** Shared numeric-identifier rule: positive safe integer, or nothing. */
export function coerceIdentifier(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === "string" && /^[0-9]+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  return null;
}

export function readSubmissionId(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  return coerceIdentifier((data as Record<string, unknown>).submission_id);
}

/* --------------------------------------------------------- create contract */

export type CreateInput = {
  session: string;
  phone: string;
  facts: Facts;
  description: string;
  declared: boolean;
  idem: string;
};

/**
 * The declaration is the user's action, never a constant. The server rejects
 * owner_declared !== true, so the request is not built at all until the box is
 * ticked — that is what keeps a rejected declaration from producing a draft.
 */
export function buildCreatePayload(
  input: CreateInput,
): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
  if (input.declared !== true) return { ok: false, reason: "declaration_required" };
  const session = input.session.trim();
  if (!session) return { ok: false, reason: "session_required" };
  if (!input.idem.trim()) return { ok: false, reason: "idem_required" };
  // Description is required in this version: a textarea whose text never
  // reaches the submission is worse than no textarea.
  const description = input.description.trim();
  if (!description) return { ok: false, reason: "description_required" };
  if (!input.facts.condition.trim()) {
    return { ok: false, reason: "condition_required" };
  }
  if (!floorPairComplete(input.facts.floor)) {
    return { ok: false, reason: "floor_pair_incomplete" };
  }
  const payload: Record<string, unknown> = {
    session,
    phone: input.phone.trim(),
    deal_type: input.facts.deal_type,
    district_code: input.facts.district_code,
    street_display: input.facts.street_display.trim(),
    rooms: input.facts.rooms,
    area: Number(input.facts.area),
    floor: input.facts.floor.trim(),
    price_usd: Number(input.facts.price_usd),
    condition: input.facts.condition,
    description,
    portal_url: input.facts.portal_url.trim() || null,
    owner_declared: true,
    idem: input.idem,
  };

  // Attribute parity: an unknown ("") field is OMITTED, never sent as false
  // or empty — the server stores NULL and the public card hides the row.
  const f = input.facts;
  if (f.bathrooms) payload.bathrooms = f.bathrooms;
  if (f.build_year) {
    if (!/^(18|19|20)\d{2}$/.test(f.build_year.trim())) {
      return { ok: false, reason: "build_year_invalid" };
    }
    payload.build_period = f.build_year.trim();
  }
  if (f.building_status) payload.building_status = f.building_status;
  if (f.project_type) payload.project_type = f.project_type;
  if (f.balcony) payload.balcony = f.balcony;
  if (f.amenities.length > 0) payload.amenities = f.amenities;

  // Rent terms ride only on a rent deal. The section is hidden for sale, but
  // state can survive a deal-type flip — the gate is here, in the payload
  // rule, so a stale value can never leak into a sale submission (the API
  // rejects it outright rather than dropping it).
  if (f.deal_type === "rent") {
    if (f.deposit_required) payload.deposit_required = f.deposit_required;
    if (f.utilities_included) payload.utilities_included = f.utilities_included;
    if (f.pets_allowed) payload.pets_allowed = f.pets_allowed;
    if (f.min_months.trim()) {
      const months = Number(f.min_months.trim());
      if (!Number.isInteger(months) || months < 1 || months > 60) {
        return { ok: false, reason: "min_months_invalid" };
      }
      payload.min_months = months;
    }
  }

  return { ok: true, payload };
}

/* ------------------------------------------------------- persisted resume */

export type PersistedState = {
  v: number;
  session: string;
  email: string;
  phone: string;
  step: Step;
  facts: Facts;
  description: string;
  declared: boolean;
  submissionId: number | null;
  createIdem: string;
  coverId: string | null;
  photos: Array<Pick<PhotoSlot, "id" | "name" | "size" | "type" | "position" | "state" | "permanent" | "hold">>;
};

export function serializeState(state: Omit<PersistedState, "v">): string {
  return JSON.stringify({ ...state, v: STATE_VERSION });
}

/**
 * Restore is total: anything malformed yields null and the flow starts over
 * rather than half-restoring into an inconsistent draft.
 */
export function restoreState(raw: string | null): PersistedState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const s = parsed as Record<string, unknown>;
  if (s.v !== STATE_VERSION) return null;
  if (typeof s.session !== "string" || !s.session.trim()) return null;
  const facts = { ...emptyFacts(), ...(typeof s.facts === "object" && s.facts ? s.facts : {}) };
  // Old drafts predate the parity fields; the merge above fills them with
  // unknowns. A draft that carries them must still restore into the exact
  // shapes the payload builder assumes: amenities is a string array, every
  // other parity field a string. Anything else resets to unknown rather
  // than poisoning the later payload.
  facts.amenities = Array.isArray((facts as Facts).amenities)
    ? (facts as Facts).amenities.filter((k): k is string => typeof k === "string")
    : [];
  for (const key of [
    "bathrooms",
    "build_year",
    "building_status",
    "project_type",
    "balcony",
    "deposit_required",
    "utilities_included",
    "min_months",
    "pets_allowed",
  ] as const) {
    if (typeof (facts as Facts)[key] !== "string") (facts as Facts)[key] = "";
  }
  const photos = Array.isArray(s.photos)
    ? s.photos.filter(
        (p): p is PersistedState["photos"][number] =>
          Boolean(p) && typeof p === "object" && typeof (p as PhotoSlot).id === "string",
      )
    : [];
  return {
    v: STATE_VERSION,
    session: s.session,
    email: typeof s.email === "string" ? s.email : "",
    phone: typeof s.phone === "string" ? s.phone : "",
    step: typeof s.step === "string" ? (s.step as Step) : "phone",
    facts: facts as Facts,
    description: typeof s.description === "string" ? s.description : "",
    declared: s.declared === true,
    submissionId: coerceIdentifier(s.submissionId),
    createIdem: typeof s.createIdem === "string" ? s.createIdem : "",
    coverId: typeof s.coverId === "string" ? s.coverId : null,
    photos,
  };
}

/**
 * Replay safety: the idempotency key is generated and persisted BEFORE the
 * create request, so a lost response replays the same key and the server
 * returns the same draft instead of minting a second one.
 */
export function createIdemFor(existing: string, mint: () => string): string {
  return existing.trim() ? existing : mint();
}

/* ------------------------------------------------------------ photo rules */

export type FileLike = { name: string; size: number; type: string };

export type AddFilesResult = {
  accepted: FileLike[];
  rejectedType: FileLike[];
  excess: number;
};

/**
 * Excess files are reported, never silently truncated, and unsupported types
 * (notably HEIC straight from an iPhone) are named rather than failing later
 * against an opaque server error.
 */
export function planAddFiles(current: number, files: FileLike[]): AddFilesResult {
  const room = Math.max(0, MAX_PHOTOS - current);
  const typed: FileLike[] = [];
  const rejectedType: FileLike[] = [];
  for (const f of files) {
    if (ACCEPTED_IMAGE_TYPES.includes(f.type)) typed.push(f);
    else rejectedType.push(f);
  }
  return {
    accepted: typed.slice(0, room),
    rejectedType,
    excess: Math.max(0, typed.length - room),
  };
}

/** Smallest free server position, so removals never leave a hole. */
export function claimPosition(slots: PhotoSlot[]): number {
  const taken = new Set(
    slots.filter((s) => s.position !== null).map((s) => s.position as number),
  );
  let p = 0;
  while (taken.has(p)) p += 1;
  return p;
}

/**
 * Reserve a server position before an upload performs its first await.
 *
 * React state updaters are not synchronous return-value channels. The caller
 * therefore needs both the reserved position and the next slot snapshot as a
 * plain value, so it can publish that snapshot to its ref before another
 * upload starts in the same effect pass.
 */
export function reserveUploadSlot(
  slots: PhotoSlot[],
  id: string,
): { slots: PhotoSlot[]; position: number } | null {
  const slot = slots.find((s) => s.id === id);
  if (!slot) return null;
  const position = slot.position ?? claimPosition(slots);
  return {
    position,
    slots: slots.map((s) =>
      s.id === id ? { ...s, state: "uploading", position } : s,
    ),
  };
}

/**
 * Removal is permitted while the slot demonstrably holds no server image. An
 * unresolved (held) slot must be retried instead: removing it could leave an
 * ingested image at a position nothing references.
 */
export function canRemove(slot: PhotoSlot): boolean {
  if (slot.hold) return false;
  return slot.state === "pending" || slot.state === "failed";
}

export function removeSlot(slots: PhotoSlot[], id: string): PhotoSlot[] {
  const target = slots.find((s) => s.id === id);
  if (!target || !canRemove(target)) return slots;
  const kept = slots.filter((s) => s.id !== id);
  return compactPositions(kept);
}

/**
 * Uploaded positions must be exactly 0..n-1 at finalize. Done slots keep their
 * server position (re-numbering them would orphan the ingested row); slots that
 * never uploaded release theirs.
 */
export function compactPositions(slots: PhotoSlot[]): PhotoSlot[] {
  return slots.map((s) =>
    s.state === "done" ? s : s.state === "uploading" ? s : { ...s, position: null },
  );
}

export function uploadedPositions(slots: PhotoSlot[]): number[] {
  return slots
    .filter((s) => s.state === "done" && s.position !== null)
    .map((s) => s.position as number)
    .sort((a, b) => a - b);
}

export function positionsContiguous(slots: PhotoSlot[]): boolean {
  const p = uploadedPositions(slots);
  return p.every((value, i) => value === i);
}

/** Indices that may start now, honouring the concurrency bound. */
export function nextUploadBatch(slots: PhotoSlot[], limit = MAX_CONCURRENT_UPLOADS): string[] {
  const active = slots.filter((s) => s.state === "uploading").length;
  const room = Math.max(0, limit - active);
  if (room === 0) return [];
  // An unresolved position blocks everything behind it; only its own retry may
  // run, so later photos cannot skip past a position that may hold an image.
  const unresolved = slots.filter((s) => s.hold && s.state !== "done");
  const pool = unresolved.length > 0 ? unresolved : slots;
  return pool
    .filter((s) => s.state === "pending")
    .slice(0, room)
    .map((s) => s.id);
}

/** Cover follows slot identity, so retry and removal cannot move it. */
export function resolveCover(
  slots: PhotoSlot[],
  coverId: string | null,
): { id: string; position: number } | null {
  const done = slots.filter((s) => s.state === "done" && s.position !== null);
  if (done.length === 0) return null;
  const chosen = done.find((s) => s.id === coverId) ?? done[0];
  return { id: chosen.id, position: chosen.position as number };
}

export function galleryReady(slots: PhotoSlot[]): boolean {
  if (slots.some((s) => s.hold)) return false;
  const done = uploadedPositions(slots);
  if (done.length < MIN_PHOTOS) return false;
  if (!positionsContiguous(slots)) return false;
  return slots.every((s) => s.state === "done");
}

/**
 * The only 409 that means "our bytes are already there". The same endpoint also
 * returns 409 "submission is not accepting images", which is an error, so a
 * bare status is never enough to settle a slot as done.
 */
export const ALREADY_INGESTED_DETAIL = "position already has an image";

export type PositionOutcome = "done" | "release" | "hold";

/**
 * What a PUT result means for the server position this slot holds.
 *   done    - an image exists at this position (2xx, or the exact 409)
 *   release - the server definitely stored nothing (4xx): reuse the position
 *   hold    - unknown (5xx, transport, abort): keep it and require a retry
 */
export function positionOutcome(status: number, detail = ""): PositionOutcome {
  if (status >= 200 && status < 300) return "done";
  if (status === 409) {
    return detail.includes(ALREADY_INGESTED_DETAIL) ? "done" : "release";
  }
  if (status >= 400 && status < 500) return "release";
  return "hold";
}

export function classifyUploadResponse(status: number, detail = ""): SlotState {
  return positionOutcome(status, detail) === "done" ? "done" : "failed";
}

/** 4xx other than 429 will not succeed on retry. */
export function isPermanentUploadFailure(status: number, detail = ""): boolean {
  if (status === 429) return false;
  if (status === 409) return !detail.includes(ALREADY_INGESTED_DETAIL);
  return status >= 400 && status < 500;
}

/** Apply an outcome to one slot, releasing or holding its position. */
export function applyUploadOutcome(
  slots: PhotoSlot[],
  id: string,
  outcome: PositionOutcome,
  status = 0,
  detail = "",
): PhotoSlot[] {
  return slots.map((s) => {
    if (s.id !== id) return s;
    if (outcome === "done") return { ...s, state: "done", permanent: false, hold: false };
    if (outcome === "release") {
      // A definite rejection stored nothing, so the position goes back to the
      // pool before any later upload claims one.
      return {
        ...s,
        state: "failed",
        position: null,
        hold: false,
        permanent: isPermanentUploadFailure(status, detail),
      };
    }
    return { ...s, state: "failed", hold: true, permanent: false };
  });
}

/** A known pre-ingest failure (no ticket, no file) never stored anything. */
export function releasePosition(slots: PhotoSlot[], id: string): PhotoSlot[] {
  return slots.map((s) =>
    s.id === id ? { ...s, state: "failed", position: null, hold: false } : s,
  );
}

/* ------------------------------------------------ uncertain-upload recovery */

export type SubmissionStatus = {
  submissionId: number;
  status: string;
  /** Committed images. */
  positions: number[];
  /**
   * Positions whose ticket was consumed inside the server's pending horizon
   * with nothing committed yet: empty right now, but the original upload may
   * still land there. Treating these as free is what let a second file claim a
   * position the first worker could still take.
   */
  pendingPositions: number[];
};

function boundedPositionList(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
    if (value < 0 || value >= MAX_PHOTOS) return null;
    if (out.includes(value)) return null; // duplicates are not a gallery
    out.push(value);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Validate a /submission/status response before trusting it to settle a slot.
 *
 * This is the authority that decides whether an uncertain photo landed, so a
 * malformed, duplicated or foreign answer must be refused rather than guessed
 * at: acting on the wrong submission's positions is exactly the failure the
 * endpoint exists to prevent.
 */
export function parseStatusResponse(
  data: unknown,
  expectedId: number,
): SubmissionStatus | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const id = coerceIdentifier(d.submission_id);
  if (id === null || id !== expectedId) return null;
  if (typeof d.status !== "string" || !d.status) return null;
  const positions = boundedPositionList(d.positions);
  if (positions === null) return null;
  // An older server that cannot report pending positions is refused rather
  // than trusted: its silence is indistinguishable from "nothing pending",
  // which is exactly the wrong answer during the race.
  const pendingPositions = boundedPositionList(d.pending_positions);
  if (pendingPositions === null) return null;
  // The server makes these disjoint by construction; an overlap means the
  // answer is not one this client can reason about.
  if (pendingPositions.some((p) => positions.includes(p))) return null;
  return { submissionId: id, status: d.status, positions, pendingPositions };
}

export type Reconciliation =
  | { ok: true; slots: PhotoSlot[] }
  | { ok: false; reason: "server_position_without_slot" };

/**
 * Settle local state against the server's filled positions.
 *
 * A held slot is settled only against the position it already claimed, so a
 * newly selected file can never inherit an earlier photo's success.
 */
export function reconcileSlots(
  slots: PhotoSlot[],
  status: SubmissionStatus,
): Reconciliation {
  const filled = new Set(status.positions);
  const pending = new Set(status.pendingPositions);
  const next = slots.map((s) => {
    if (s.position !== null && filled.has(s.position)) {
      // The server holds an image at this slot's own position.
      return { ...s, state: "done" as SlotState, hold: false, permanent: false };
    }
    if (s.position !== null && pending.has(s.position)) {
      // Empty now, but the original upload may still commit here. The slot
      // keeps its hold, so it can neither be inherited nor finalized.
      return { ...s, state: "failed" as SlotState, hold: true, permanent: false };
    }
    if (s.state === "done" || s.hold) {
      // Local believed it landed, or could not tell, and the server says the
      // position is neither filled nor still in flight: safe to release.
      return { ...s, state: "failed" as SlotState, position: null, hold: false, permanent: false };
    }
    return s;
  });
  const claimed = new Set(
    next.filter((s) => s.position !== null).map((s) => s.position as number),
  );
  for (const p of [...status.positions, ...status.pendingPositions]) {
    // A committed or in-flight position nothing local references would break
    // contiguity at finalize and cannot be re-bound safely, so recovery stops
    // rather than guessing.
    if (!claimed.has(p)) return { ok: false, reason: "server_position_without_slot" };
  }
  return { ok: true, slots: next };
}

/** Reconciliation is owed while any slot's fate is unknown. */
export function needsReconcile(slots: PhotoSlot[]): boolean {
  return slots.some((s) => s.hold);
}

/**
 * A ticket request that fails before any uncertain PUT may release its
 * position. A retry of an already-held slot may not: its position may still be
 * occupied server-side, and that authority must survive re-verification.
 */
export function onTicketFailure(slots: PhotoSlot[], id: string): PhotoSlot[] {
  const slot = slots.find((s) => s.id === id);
  if (slot?.hold) {
    return slots.map((s) => (s.id === id ? { ...s, state: "failed" as SlotState } : s));
  }
  return releasePosition(slots, id);
}

/** Slots worth restoring after a refresh: settled ones and unresolved ones. */
export function restorableSlots(slots: PhotoSlot[]): PhotoSlot[] {
  return slots.filter((s) => s.state === "done" || s.hold);
}

/* ------------------------------------------------- state-dependent copy */

/**
 * The failure message must agree with the controls actually offered.
 *
 * Telling an owner to remove a photo whose წაშლა control is deliberately
 * absent — because the server may already hold that position — is the copy
 * equivalent of the false-success defect: it describes a state the UI is not in.
 */
export const UPLOAD_FAILURE_MESSAGES = {
  release: "ეს ფოტო ვერ აიტვირთა. თავიდან სცადე ან წაშალე.",
  hold: "ვერ დავადგინეთ, აიტვირთა თუ არა. თავიდან სცადე ამავე ფოტოზე.",
} as const;

export function uploadOutcomeMessage(outcome: PositionOutcome): string | null {
  return outcome === "done" ? null : UPLOAD_FAILURE_MESSAGES[outcome];
}

/** "N ფაილი არ აიტვირთა…" — states the rule, never phone settings advice. */
export function rejectedTypeNotice(count: number): string {
  return `${count} ფაილი არ აიტვირთა. მხოლოდ JPEG ან PNG — iPhone-ის HEIC არ მიიღება.`;
}
