export function restorableSlots(slots) {
  return slots
    .filter((s) => s.state === "done" || s.hold || s.state === "uploading")
    .map((s) => s.state === "uploading" ? { ...s, state: "failed", hold: true } : s);
}
export function parseStatusResponse(data, expectedId) {
  if (!data || data.submission_id !== expectedId || !Array.isArray(data.positions) ||
      !Array.isArray(data.pending_positions)) return null;
  return {
    submissionId: data.submission_id,
    status: data.status,
    positions: [...data.positions],
    pendingPositions: [...data.pending_positions],
  };
}
export function reconcileSlots(slots, status) {
  const filled = new Set(status.positions);
  const pending = new Set(status.pendingPositions);
  const next = slots.map((s) => filled.has(s.position)
    ? { ...s, state: "done", hold: false }
    : pending.has(s.position)
      ? { ...s, state: "failed", hold: true }
      : s.hold ? { ...s, state: "failed", position: null, hold: false } : s);
  return { ok: true, slots: next };
}
export function needsReconcile(slots) { return slots.some((s) => s.hold); }
export function recoveryDirective(slots, availableFileIds) {
  const unresolved = slots.filter((s) => s.hold);
  return {
    complete: unresolved.length === 0,
    poll: unresolved.length > 0,
    canReset: true,
    retryIds: unresolved.filter((s) => availableFileIds.has(s.id)).map((s) => s.id),
  };
}

export const HONEST_COMPONENT = String.raw`
const directive = recoveryDirective(out.slots, new Set(filesRef.current.keys()));
reconciledRef.current = directive.complete;
setReconciled(directive.complete);
if (directive.poll) setTimeout(() => { void reconcile(); }, 1500);
const resetGallery = () => call("gallery-reset", { session, submission_id: submissionId });
`;
export const HONEST_ROUTE = String.raw`
const ACTIONS = { "gallery-reset": "/submission/gallery-reset" };
const ERRORS = {
  field: { code: "field", ka: "ერთ-ერთი ველი არასწორია — გადახედე." },
  gallery: { code: "gallery", ka: "ფოტოების მდგომარეობა ვერ განახლდა. თავიდან სცადე." },
};
function mapError(status, detail, action) {
  if (action === "status") return ERRORS.gallery;
  if (/gallery|photo|image|position/i.test(detail)) return ERRORS.gallery;
  return ERRORS.field;
}
const error = mapError(res.status, res.detail, action);
`;
export const HONEST_SCHEMA = String.raw`
ALTER TABLE listing_submissions ADD COLUMN gallery_epoch bigint NOT NULL DEFAULT 0;
ALTER TABLE submission_upload_tickets ADD COLUMN gallery_epoch bigint NOT NULL DEFAULT 0;
`;
export const HONEST_BACKEND = String.raw`
def _submission_gallery_reset_blocking(data, nonce):
    claims = session_claims(data.get("session", ""))
    with conn.transaction():
        cur.execute("SELECT status,email,gallery_epoch FROM listing_submissions WHERE id=%s FOR UPDATE")
        sub = cur.fetchone()
        if not sub or sub["email"] != claims["e"]: raise HTTPException(404, "no such submission")
        if sub["status"] != "draft": raise HTTPException(409, "submission is not accepting images")
        cur.execute("UPDATE listing_submissions SET gallery_epoch=gallery_epoch+1 WHERE id=%s")
        cur.execute("DELETE FROM submission_images WHERE submission_id=%s")
        cur.execute("DELETE FROM submission_upload_tickets WHERE submission_id=%s")

@app.post("/submission/gallery-reset")
async def submission_gallery_reset(): pass

def _upload_claim_blocking(digest):
    cur.execute("SELECT t.gallery_epoch FROM submission_upload_tickets t")

def _upload_ingest_blocking(tk, tmp_path):
    cur.execute("SELECT status,gallery_epoch FROM listing_submissions WHERE id=%s FOR UPDATE")
    if tk["gallery_epoch"] != sub["gallery_epoch"]: raise HTTPException(409, "stale upload after reset")
`;
