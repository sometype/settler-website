"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { DISTRICTS } from "@/lib/districts";
import { AMENITIES } from "@/lib/amenities";
import {
  OWNER_CONDITIONS,
  OWNER_PROJECT_TYPES,
  OWNER_STATUSES,
} from "@/lib/labels";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_CONCURRENT_UPLOADS,
  MAX_PHOTOS,
  MIN_PHOTOS,
  STORAGE_KEY,
  buildCreatePayload,
  canRemove,
  applyUploadOutcome,
  createIdemFor,
  emptyFacts,
  factsComplete,
  joinFloorParts,
  galleryReady,
  positionOutcome,
  needsReconcile,
  onTicketFailure,
  parseStatusResponse,
  reconcileSlots,
  recoveryDirective,
  rejectedTypeNotice,
  releasePosition,
  restorableSlots,
  uploadOutcomeMessage,
  nextUploadBatch,
  planAddFiles,
  readOpaqueToken,
  readSubmissionId,
  removeSlot,
  reserveUploadSlot,
  resolveCover,
  resolveUploadBase,
  restoreState,
  serializeState,
  splitFloorParts,
  turnstileSiteKeyRequirement,
  isSubmittableEmail,
  canRequestCode,
  type Facts,
  type PhotoSlot,
  type Step,
} from "@/lib/uploadFlow";
import { OWNER_UPLOAD_TURNSTILE_ACTION } from "@/lib/turnstile";

/**
 * Owner upload flow — Grok's frozen order (OWNERUPLOADDISCUSSION §C):
 * manifesto → email+code → phone → facts → text+declare → photos → status.
 *
 * COPY IS LAW, not placeholder: manifesto split (portal-OK + agent-nuke, both
 * above the fold), «დაგირეკავთ» on its three surfaces, K3 wait screen (never
 * lead with spam), K5 busy/too-fast, 7-day draft notice at start AND photos,
 * per-photo retry (never restart the gallery). Polish is allowed; reversing
 * any of those is not.
 *
 * ORDER NOTE: text+declare runs BEFORE photos because /submission/create
 * requires owner_declared === true and there is no update endpoint. Collecting
 * the declaration afterwards would mean asserting it on the owner's behalf.
 *
 * The 2026-08-16 product acceptance addendum supersedes the earlier copy: no
 * 24-hour promise, no absolute two-card claim, no blanket "nothing was lost",
 * owner-only declaration, required condition and description, and five
 * numbered steps.
 */

type ApiError = { code: string; ka: string; retry_after_s?: number };

function newIdem(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
}

function newSlotId(): string {
  return crypto.randomUUID();
}

async function call(
  action: string,
  payload: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; error?: ApiError }> {
  try {
    const res = await fetch(`/api/intake/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let body: Record<string, unknown> | null = null;
    try {
      const parsed = (await res.json()) as unknown;
      if (parsed && typeof parsed === "object") {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = null;
    }
    if (!res.ok || body === null) {
      const err = body?.error as ApiError | undefined;
      return {
        error: err ?? {
          code: "busy",
          ka: "ახლა გადატვირთულია. 5 წამში თავიდან სცადე.",
        },
      };
    }
    return { data: body };
  } catch {
    return {
      error: {
        code: "network",
        ka: "კავშირი გაწყდა. ინტერნეტი შეამოწმე და თავიდან სცადე.",
      },
    };
  }
}

/**
 * Session restoration reads an external store. Doing it in an effect trips
 * react-hooks/set-state-in-effect (defect 12) and cascades renders, so the
 * persisted draft seeds the initial state directly and a hydration gate keeps
 * the server render and the first client render identical.
 */
function readPersisted() {
  if (typeof window === "undefined") return null;
  try {
    return restoreState(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

const NO_SUBSCRIBE = () => () => {};
const CLIENT = () => true;
const SERVER = () => false;

function maskEmail(e: string): string {
  const [local, domain] = e.split("@");
  if (!domain) return e;
  return `${local.slice(0, 2)}…@${domain}`;
}

/* ---------------------------------- shared bits ------------------------- */

function Err({ error, id }: { error: ApiError | null; id: string }) {
  // Always rendered so assistive tech observes the live region from the start;
  // an alert inserted only on failure is often missed entirely.
  return (
    <p
      id={id}
      role="alert"
      aria-live="assertive"
      className={
        error
          ? "mt-2 rounded-md bg-clay/10 px-3 py-2 text-sm leading-snug text-clay-deep"
          : "sr-only"
      }
    >
      {error?.ka ?? ""}
    </p>
  );
}

function StepTag({ n }: { n: number }) {
  return (
    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">
      ნაბიჯი {n}/5
    </p>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="mt-2 w-full text-center text-xs text-mink underline"
      onClick={onClick}
    >
      უკან
    </button>
  );
}

function Manifesto({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="mb-4 text-xs text-mink">
        შემოწმებული ბინები · დუბლიკატების გარეშე
      </p>
    );
  }
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        განცხადების დამატება
      </h1>
      <p className="mt-1 text-sm text-mink">
        შემოწმებული ბინები · დუბლიკატების გარეშე
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink">
        დაამატე ბინა პირდაპირ. განცხადება გადამოწმების შემდეგ გამოქვეყნდება.
      </p>

    </header>
  );
}

/* ---------------------------------- main flow --------------------------- */

export default function UploadFlow() {
  // False on the server and on hydration's first pass, so both renders agree;
  // true afterwards, when the restored draft may be shown.
  const hydrated = useSyncExternalStore(NO_SUBSCRIBE, CLIENT, SERVER);
  const saved = useMemo(() => readPersisted(), []);

  const [step, setStep] = useState<Step>(() => saved?.step ?? "email");
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState(() =>
    saved?.photos.some((p) => p.state !== "done")
      ? "ატვირთვის დროს გაწყვეტილი ფოტოები თავიდან აირჩიე."
      : "",
  );
  const [busy, setBusy] = useState(false);
  // §8: an unfinished draft is offered explicitly, never silently resumed.
  const [resumePending, setResumePending] = useState(() => Boolean(saved));

  const [email, setEmail] = useState(() => saved?.email ?? "");
  /**
   * ⚠️ TRACKED, NOT READ AT SUBMIT TIME. The old code queried
   * `input[name="cf-turnstile-response"]` inside startVerify and sent whatever
   * it found — including "" when the widget had not solved yet, which the
   * server then rejected as a generic failure after the request was already
   * spent. Holding the token in state is what lets the button stay disabled
   * until a token exists, and lets expiry actively REVOKE readiness.
   */
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [emailBrowserValid, setEmailBrowserValid] = useState(false);
  const [codeToken, setCodeToken] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState(() => saved?.session ?? "");
  const [spamHint, setSpamHint] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const [phone, setPhone] = useState(() => saved?.phone ?? "");
  const [facts, setFacts] = useState<Facts>(() => saved?.facts ?? emptyFacts());
  const [description, setDescription] = useState(() => saved?.description ?? "");
  const [declared, setDeclared] = useState(() => saved?.declared ?? false);
  // Settled slots and unresolved (held) ones both survive a refresh. Dropping
  // a held slot is what let a new file inherit its position and be marked done
  // off the earlier photo's success.
  const [photos, setPhotos] = useState<PhotoSlot[]>(
    () => restorableSlots(saved?.photos ?? []),
  );
  const [reconciled, setReconciled] = useState(
    () => !needsReconcile(restorableSlots(saved?.photos ?? [])),
  );
  const [coverId, setCoverId] = useState<string | null>(() => saved?.coverId ?? null);
  const [createIdem, setCreateIdem] = useState(() => saved?.createIdem ?? "");
  const [submissionId, setSubmissionId] = useState<number | null>(
    () => saved?.submissionId ?? null,
  );

  // Files are not serialisable and are never rendered, so they stay in a ref.
  // Preview URLs are rendered, so they are state: reading a ref during render
  // is neither reactive nor safe under concurrent rendering.
  const filesRef = useRef<Map<string, File>>(new Map());
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsMirror = useRef<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const uploadBase = useMemo(
    () =>
      resolveUploadBase({
        NEXT_PUBLIC_INTAKE_UPLOAD_URL: process.env.NEXT_PUBLIC_INTAKE_UPLOAD_URL,
        NODE_ENV: process.env.NODE_ENV,
      }),
    [],
  );
  const siteKey = useMemo(
    () =>
      turnstileSiteKeyRequirement({
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        NODE_ENV: process.env.NODE_ENV,
      }),
    [],
  );

  /**
   * Turnstile's implicit rendering calls GLOBAL functions by name, so the
   * widget's data-callback attributes below point at these. Registered in an
   * effect (never during render) and removed on unmount so a remount cannot
   * leave a stale closure writing into a dead component.
   *
   * expired/error/timeout all clear the token: Article IV — an expired token
   * is not a weaker pass, it is no pass at all.
   */
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.mpTurnstileOk = (token: string) => setTurnstileToken(token || null);
    w.mpTurnstileGone = () => setTurnstileToken(null);
    return () => {
      delete w.mpTurnstileOk;
      delete w.mpTurnstileGone;
    };
  }, []);

  const releasePreview = useCallback((id: string) => {
    filesRef.current.delete(id);
    setPreviews((prev) => {
      const url = prev[id];
      if (!url) return prev;
      URL.revokeObjectURL(url);
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /* ------------------------------ resume -------------------------------- */

  useEffect(() => {
    previewsMirror.current = previews;
  }, [previews]);

  // Snapshot for the async reconciliation, which must not read stale props.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  const reconciledRef = useRef(reconciled);
  // Invalidates status responses that started before (or during) a gallery
  // reset. Without this, a late response can resurrect cards the reset removed.
  const galleryRequestGenerationRef = useRef(0);
  useEffect(() => {
    reconciledRef.current = reconciled;
  }, [reconciled]);

  useEffect(() => {
    if (!hydrated || !session) return;
    sessionStorage.setItem(
      STORAGE_KEY,
      serializeState({
        session,
        email,
        phone,
        step,
        facts,
        description,
        declared,
        submissionId,
        createIdem,
        coverId,
        photos: photos.map((p) => ({
          id: p.id,
          name: p.name,
          size: p.size,
          type: p.type,
          position: p.position,
          state: p.state,
          permanent: p.permanent,
          hold: p.hold,
        })),
      }),
    );
  }, [
    hydrated,
    session,
    email,
    phone,
    step,
    facts,
    description,
    declared,
    submissionId,
    createIdem,
    coverId,
    photos,
  ]);

  // Revoke every outstanding object URL when the flow unmounts.
  useEffect(() => {
    const files = filesRef.current;
    const mirror = previewsMirror;
    return () => {
      Object.values(mirror.current).forEach((url) => URL.revokeObjectURL(url));
      mirror.current = {};
      files.clear();
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // K3.2: spam hint appears only after a resend OR ~30s of nothing.
  useEffect(() => {
    if (step !== "code") return;
    const t = setTimeout(() => setSpamHint(true), 30_000);
    return () => clearTimeout(t);
  }, [step]);

  // Focus the new step's heading so a transition is announced and keyboard
  // focus does not stay on a button that no longer exists.
  useEffect(() => {
    if (!hydrated) return;
    headingRef.current?.focus();
  }, [step, hydrated]);

  const verifyIdemRef = useRef<Record<string, string>>({});
  const verifyIdemFor = (k: string) => {
    if (!verifyIdemRef.current[k]) verifyIdemRef.current[k] = newIdem();
    return verifyIdemRef.current[k];
  };

  /* ------------------------------ step actions -------------------------- */

  const startVerify = useCallback(async () => {
    setBusy(true);
    setError(null);
    // The tracked token only. If it is somehow absent the request is not sent:
    // spending a rate-limit slot on a request the server will refuse is worse
    // than doing nothing, and the button should already have been disabled.
    const turnstile = turnstileToken ?? "";
    if (!turnstile) {
      setBusy(false);
      setError({ code: "turnstile", ka: "დაადასტურე, რომ რობოტი არ ხარ." });
      return;
    }
    const r = await call("verify-start", {
      email: email.trim(),
      turnstile,
      idem: verifyIdemFor("verify" + email.trim()),
    });
    setBusy(false);
    if (r.error) {
      if (r.error.retry_after_s) setResendIn(r.error.retry_after_s);
      setError(r.error);
      return;
    }
    const token = readOpaqueToken(r.data, "token");
    if (!token) {
      setError({ code: "busy", ka: "ახლა გადატვირთულია. 5 წამში თავიდან სცადე." });
      return;
    }
    setCodeToken(token);
    setSpamHint(false);
    setResendIn(60);
    setStep("code");
  }, [email, turnstileToken]);

  const checkCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    const r = await call("verify-check", { token: codeToken, code: code.trim() });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    const s = readOpaqueToken(r.data, "session");
    if (!s) {
      setError({ code: "busy", ka: "ახლა გადატვირთულია. 5 წამში თავიდან სცადე." });
      return;
    }
    setSession(s);
    // Re-verification returns to the draft that is already in progress.
    setReconciled(!needsReconcile(photos));
    setStep(submissionId ? "photos" : "phone");
  }, [codeToken, code, submissionId, photos]);

  const createSubmission = useCallback(async () => {
    // The key is minted and persisted BEFORE the request, so a lost response
    // replays the same key and the server returns the same draft.
    const idem = createIdemFor(createIdem, newIdem);
    if (idem !== createIdem) setCreateIdem(idem);

    const built = buildCreatePayload({
      session,
      phone,
      facts,
      description,
      declared,
      idem,
    });
    if (!built.ok) {
      setError({ code: "field", ka: "ერთ-ერთი ველი არასწორია — გადახედე." });
      return;
    }
    setBusy(true);
    setError(null);
    const r = await call("create", built.payload);
    setBusy(false);
    if (r.error) {
      if (r.error.code === "session_expired") setStep("email");
      setError(r.error);
      return;
    }
    const id = readSubmissionId(r.data);
    if (id === null) {
      setError({ code: "busy", ka: "ახლა გადატვირთულია. 5 წამში თავიდან სცადე." });
      return;
    }
    setSubmissionId(id);
    setStep("photos");
  }, [session, phone, facts, description, declared, createIdem]);

  const uploadOne = useCallback(
    async (id: string) => {
      if (!submissionId || "error" in uploadBase) return;
      const file = filesRef.current.get(id);
      if (!file) {
        // A held slot has no File after a refresh; the server decides its fate.
        setPhotos((p) => onTicketFailure(p, id));
        return;
      }
      // Reserve synchronously. Two uploads may start in one effect pass, so
      // relying on a setState updater to assign `position` lets both async
      // functions continue before React has run either updater.
      const reserved = reserveUploadSlot(photosRef.current, id);
      if (!reserved) return;
      const { position } = reserved;
      photosRef.current = reserved.slots;
      setPhotos(reserved.slots);

      const tk = await call("ticket", {
        session,
        submission_id: submissionId,
        position,
      });
      if (tk.error) {
        // §2: an expired session keeps the whole draft and returns to email.
        // §6/§7: a held retry keeps its position through re-verification; a
        // ticket failure before any uncertain PUT releases it.
        setPhotos((p) => onTicketFailure(p, id));
        if (tk.error.code === "session_expired") {
          setReconciled(false);
          setStep("email");
        }
        setError(tk.error);
        return;
      }
      const ticket = readOpaqueToken(tk.data, "upload_ticket");
      if (!ticket) {
        setPhotos((p) => releasePosition(p, id));
        setError({ code: "ticket_spent", ka: "ამ ფოტოს ატვირთვა თავიდან სცადე." });
        return;
      }
      try {
        const res = await fetch(uploadBase.url + "/upload", {
          method: "PUT",
          headers: { Authorization: `Bearer ${ticket}` },
          body: file,
        });
        let detail = "";
        try {
          const parsed = JSON.parse(await res.text()) as { detail?: unknown };
          if (typeof parsed?.detail === "string") detail = parsed.detail;
        } catch {
          /* non-JSON body: the status alone decides */
        }
        const outcome = positionOutcome(res.status, detail);
        setPhotos((p) => applyUploadOutcome(p, id, outcome, res.status, detail));
        if (outcome === "done") {
          releasePreview(id);
          setCoverId((c) => c ?? id);
        } else {
          // A 5xx yields hold, not release: the message follows the outcome so
          // it can never offer წაშლა while the control is withheld.
          setError({ code: "photo", ka: uploadOutcomeMessage(outcome) ?? "" });
        }
      } catch {
        // Transport failure after the PUT began: it is unknown whether the
        // image landed, so the position is held and only retry can settle it.
        setPhotos((p) => applyUploadOutcome(p, id, "hold"));
        setError({ code: "photo", ka: uploadOutcomeMessage("hold") ?? "" });
      }
    },
    [session, submissionId, uploadBase, releasePreview],
  );

  /**
   * Ask the server which positions it actually holds before anything else
   * touches the gallery. Until this answers, an uncertain slot's fate is
   * unknown and no later upload may claim a position.
   */
  const reconcile = useCallback(async () => {
    if (!submissionId) return;
    const requestGeneration = galleryRequestGenerationRef.current;
    const r = await call("status", { session, submission_id: submissionId });
    if (requestGeneration !== galleryRequestGenerationRef.current) return;
    if (r.error) {
      if (r.error.code === "session_expired") setStep("email");
      setError(r.error);
      return;
    }
    const status = parseStatusResponse(r.data, submissionId);
    if (!status) {
      setError({
        code: "gallery",
        ka: "ვერ შევამოწმეთ ატვირთული ფოტოები. თავიდან სცადე.",
      });
      return;
    }
    // The updater stays pure: reconcile against a snapshot, then commit.
    const out = reconcileSlots(photosRef.current, status);
    if (!out.ok) {
      setError({
        code: "gallery",
        ka: "ატვირთულ ფოტოებში შეუსაბამობაა. თავიდან სცადე.",
      });
      return;
    }
    photosRef.current = out.slots;
    setPhotos(out.slots);
    const directive = recoveryDirective(
      out.slots,
      new Set(filesRef.current.keys()),
    );
    reconciledRef.current = directive.complete;
    setReconciled(directive.complete);
  }, [session, submissionId]);

  // Mobile refresh/background can leave a consumed ticket alive after the
  // local File is gone. Keep asking the server until that bounded worker
  // either commits or leaves the pending horizon; one manual check is not a
  // recovery mechanism.
  useEffect(() => {
    const directive = recoveryDirective(photos, new Set(filesRef.current.keys()));
    if (step !== "photos" || !submissionId || !directive.poll) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await reconcile();
      // A transient status error does not change `photos`, so the effect will
      // not rerun. Reschedule from here until settlement or unmount cancels us.
      if (!cancelled) timer = setTimeout(() => { void poll(); }, 5_000);
    };
    timer = setTimeout(() => { void poll(); }, 5_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [photos, step, submissionId, reconcile]);

  // At most MAX_CONCURRENT_UPLOADS run at once, whatever the owner selected.
  const startingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Nothing starts while an uncertain position is still unsettled.
    if (step !== "photos" || !reconciled) return;
    for (const id of nextUploadBatch(photos, MAX_CONCURRENT_UPLOADS)) {
      if (startingRef.current.has(id)) continue;
      startingRef.current.add(id);
      void uploadOne(id).finally(() => startingRef.current.delete(id));
    }
  }, [photos, step, reconciled, uploadOne]);

  const addFiles = useCallback(
    async (list: FileList | null) => {
      if (!list) return;
      // Requirement 2: nothing new starts until the uncertain slots are settled.
      if (!reconciled) {
        await reconcile();
        if (!reconciledRef.current) return;
      }
      const incoming = Array.from(list);
      const plan = planAddFiles(photos.length, incoming);
      const messages: string[] = [];
      if (plan.excess > 0) {
        messages.push(`${MAX_PHOTOS} ფოტოზე მეტი არ ჩაიტვირთა (${plan.excess} დარჩა).`);
      }
      if (plan.rejectedType.length > 0) {
        messages.push(rejectedTypeNotice(plan.rejectedType.length));
      }
      setNotice(messages.join(" "));
      const accepted = plan.accepted
        .map((meta) => incoming.find((f) => f.name === meta.name && f.size === meta.size))
        .filter((f): f is File => Boolean(f));
      const fresh: Record<string, string> = {};
      const added: PhotoSlot[] = accepted.map((f) => {
        const id = newSlotId();
        filesRef.current.set(id, f);
        fresh[id] = URL.createObjectURL(f);
        return {
          id,
          name: f.name,
          size: f.size,
          type: f.type,
          position: null,
          state: "pending",
          permanent: false,
          hold: false,
        };
      });
      if (added.length > 0) {
        setPreviews((prev) => ({ ...prev, ...fresh }));
        setPhotos((p) => [...p, ...added]);
      }
    },
    [photos.length, reconciled, reconcile],
  );

  const removePhoto = useCallback(
    (id: string) => {
      releasePreview(id);
      setPhotos((p) => removeSlot(p, id));
      setCoverId((c) => (c === id ? null : c));
    },
    [releasePreview],
  );

  const chooseReplacement = useCallback((id: string, file: File | undefined) => {
    if (!file || !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError({ code: "photo", ka: "მხოლოდ JPEG ან PNG ფოტო აირჩიე." });
      return;
    }
    const previous = previewsMirror.current[id];
    if (previous) URL.revokeObjectURL(previous);
    filesRef.current.set(id, file);
    const url = URL.createObjectURL(file);
    setPreviews((p) => ({ ...p, [id]: url }));
    setPhotos((slots) => slots.map((s) => s.id === id ? {
      ...s,
      name: file.name,
      size: file.size,
      type: file.type,
      state: "pending",
      permanent: false,
      hold: false,
    } : s));
    setError(null);
  }, []);

  const retryPhoto = useCallback((id: string) => {
    // A held slot keeps its position and hold flag so the retry re-attempts the
    // same position; the exact already-ingested 409 then settles it as done.
    setPhotos((p) =>
      p.map((s) => (s.id === id ? { ...s, state: "pending", permanent: false } : s)),
    );
  }, []);

  const resetGallery = useCallback(async () => {
    if (!submissionId) return;
    if (!window.confirm(
      "ამ განცხადების ატვირთული ფოტოები წაიშლება. თავიდან ატვირთავ ფოტოებს.",
    )) return;
    galleryRequestGenerationRef.current += 1;
    setBusy(true);
    setError(null);
    const r = await call("gallery-reset", {
      session,
      submission_id: submissionId,
    });
    // Invalidate every status request that began while reset was in flight,
    // even when the reset response itself is lost or converted to an error.
    galleryRequestGenerationRef.current += 1;
    setBusy(false);
    if (r.error) {
      if (r.error.code === "session_expired") setStep("email");
      setError(r.error);
      void reconcile();
      return;
    }
    for (const id of [...filesRef.current.keys()]) releasePreview(id);
    photosRef.current = [];
    setPhotos([]);
    setCoverId(null);
    const directive = recoveryDirective([], new Set(filesRef.current.keys()));
    reconciledRef.current = directive.complete;
    setReconciled(directive.complete);
    setNotice("ფოტოები წაიშალა. შეგიძლია თავიდან ატვირთო.");
  }, [session, submissionId, releasePreview, reconcile]);

  const finalize = useCallback(async () => {
    if (!submissionId) return;
    const chosen = resolveCover(photos, coverId);
    if (!chosen) {
      setError({ code: "gallery", ka: "ფოტოებში ხარვეზია — გადახედე და თავიდან სცადე." });
      return;
    }
    setBusy(true);
    setError(null);
    const r = await call("finalize", {
      session,
      submission_id: submissionId,
      preferred_cover: chosen.position,
      idem: verifyIdemFor("finalize"),
    });
    setBusy(false);
    if (r.error) {
      // §2: keep the draft and every uploaded photo; re-verify, then return
      // to this exact submission rather than starting a second one.
      if (r.error.code === "session_expired") setStep("email");
      setError(r.error);
      return;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    setStep("done");
  }, [session, submissionId, photos, coverId]);

  /* ------------------------------ render -------------------------------- */

  const emailValid = emailBrowserValid && isSubmittableEmail(email);
  const doneCount = photos.filter((p) => p.state === "done").length;
  const recoveryNeedsPoll = needsReconcile(photos);
  const cover = resolveCover(photos, coverId);
  const floorParts = splitFloorParts(facts.floor);
  const input =
    "w-full rounded-md border border-sand-strong bg-card px-3 py-2 text-sm text-ink outline-none focus:border-moss";
  const btn =
    "rounded-md bg-pine px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40";
  const stepTitle: Record<Step, string> = {
    email: "ელფოსტა",
    code: "კოდი",
    phone: "ტელეფონი",
    facts: "ბინის მონაცემები",
    describe: "აღწერა",
    photos: "ფოტოები",
    done: "მიღებულია",
  };

  const configError =
    "error" in uploadBase
      ? "ატვირთვა ამ ბილდში კონფიგურირებული არ არის."
      : !siteKey.ok
        ? "დაცვის მოდული კონფიგურირებული არ არის."
        : "";

  // Until hydration completes both renders show the manifesto only, so seeding
  // state from sessionStorage cannot produce a hydration mismatch.
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <Manifesto />
      </div>
    );
  }

  if (resumePending && saved) {
    const restorable = saved.photos.filter((p) => p.state === "done").length;
    return (
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <Manifesto compact />
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-ink">
          დაუსრულებელი განცხადება გაქვს
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          აღდგება: ელფოსტა, ტელეფონი, ბინის მონაცემები და აღწერა
          {restorable > 0 ? ` და ${restorable} ატვირთული ფოტო` : ""}.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-mink">
          ბრაუზერში არჩეული ფაილები არ ინახება — ჯერ აუტვირთავი ფოტოები თავიდან
          უნდა აირჩიო.
        </p>
        <button
          type="button"
          className={`${btn} mt-4 w-full`}
          onClick={() => setResumePending(false)}
        >
          განაგრძე
        </button>
        {!saved.submissionId && (
          <button
            type="button"
            className="mt-2 w-full text-center text-xs text-mink underline"
            onClick={() => {
              sessionStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }}
          >
            თავიდან დაწყება
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      {step === "email" ? <Manifesto /> : <Manifesto compact />}

      {/* Focus target for every step transition. */}
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        {stepTitle[step]}
      </h2>

      {configError && (
        <p role="alert" className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay-deep">
          {configError}
        </p>
      )}
      {step === "photos" && recoveryNeedsPoll && (
        <div className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay-deep" role="alert">
          <p>
            ვერ დავადგინეთ, რომელი ფოტოები აიტვირთა. სანამ არ შემოწმდება, ახალი
            ფოტო არ იტვირთება და გაგზავნა არ ხდება.
          </p>
          <button
            type="button"
            className="mt-2 underline"
            disabled={busy}
            onClick={() => {
                        setError(null);
              void reconcile();
            }}
          >
            ფოტოების შემოწმება
          </button>
        </div>
      )}
      {notice && (
        <p role="status" aria-live="polite" className="mb-3 text-xs text-faint">
          {notice}
        </p>
      )}

      {step === "email" && (
        <section>
          <StepTag n={1} />
          <label htmlFor="mp-email" className="mb-1 block text-sm font-medium text-ink">
            ელფოსტა
          </label>
          <input
            id="mp-email"
            name="email"
            className={input}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="შენი ელფოსტა"
            aria-describedby="mp-email-err"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              // Two opinions, both required. The browser knows its own parser;
              // isSubmittableEmail refuses shapes some browsers accept (a bare
              // host with no dotted TLD). Either saying "no" is a no.
              setEmailBrowserValid(e.target.checkValidity());
            }}
          />
          {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
            /* data-size="flexible" makes the widget take the container width
               instead of its fixed 300px, which overflowed a 390px screen once
               the 16px page padding was counted. data-appearance
               ="interaction-only" keeps it invisible unless Cloudflare actually
               wants a challenge, so the common case is one field and a button.
               The callbacks are what the disabled state reads — see the
               readiness effect above. */
            <div
              className="cf-turnstile mt-3 w-full max-w-full overflow-hidden"
              data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
              data-action={OWNER_UPLOAD_TURNSTILE_ACTION}
              data-size="flexible"
              data-appearance="interaction-only"
              data-callback="mpTurnstileOk"
              data-expired-callback="mpTurnstileGone"
              data-timeout-callback="mpTurnstileGone"
              data-error-callback="mpTurnstileGone"
            />
          ) : null}
          <button
            type="button"
            data-testid="mp-request-code"
            className={`${btn} mt-3 w-full`}
            disabled={
              !canRequestCode({
                emailValid: emailValid,
                turnstileToken,
                turnstileConfigured: siteKey.ok,
                configOk: !configError,
                busy,
              })
            }
            onClick={() => void startVerify()}
          >
            {busy ? "იგზავნება…" : "კოდის მიღება"}
          </button>
          <Err error={error} id="mp-email-err" />
        </section>
      )}

      {step === "code" && (
        <section>
          <StepTag n={1} />
          <p className="text-sm leading-relaxed text-ink">
            კოდი გავუგზავნეთ <b>{maskEmail(email)}</b>. გახსენი წერილი — კოდი
            სათაურშიც წერია.
          </p>
          {spamHint && (
            <p className="mt-1 text-xs text-faint">
              არ ჩანს? გახსენი სპამის საქაღალდე.
            </p>
          )}
          <label htmlFor="mp-code" className="sr-only">
            კოდი
          </label>
          <input
            id="mp-code"
            name="code"
            className={`${input} mt-3 text-center text-lg tracking-[0.4em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            aria-describedby="mp-code-err"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button
            type="button"
            className={`${btn} mt-3 w-full`}
            disabled={busy || code.length !== 6}
            onClick={() => void checkCode()}
          >
            დადასტურება
          </button>
          <button
            type="button"
            className="mt-2 w-full text-center text-xs text-mink underline disabled:no-underline disabled:opacity-50"
            disabled={resendIn > 0 || busy}
            onClick={() => {
              verifyIdemRef.current = {};
              setSpamHint(true); // K3.2: after first resend the hint may show
              void startVerify();
            }}
          >
            {resendIn > 0 ? `ხელახლა გაგზავნა (${resendIn} წმ)` : "ხელახლა გაგზავნა"}
          </button>
          <Err error={error} id="mp-code-err" />
          <BackButton onClick={() => setStep("email")} />
        </section>
      )}

      {step === "phone" && (
        <section>
          <StepTag n={2} />
          <label htmlFor="mp-phone" className="mb-1 block text-sm font-medium text-ink">
            ტელეფონი — რომელზეც მყიდველები დაგირეკავენ
          </label>
          <input
            id="mp-phone"
            name="phone"
            className={input}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="5XX XX XX XX"
            aria-describedby="mp-phone-err"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="mt-1.5 text-xs font-medium text-moss-deep">
            ამ ნომერზე დაგირეკავთ შემოწმებისას.
          </p>
          <button
            type="button"
            className={`${btn} mt-3 w-full`}
            disabled={phone.replace(/\D/g, "").length < 9}
            onClick={() => {
              setError(null);
              setStep("facts");
            }}
          >
            გაგრძელება
          </button>
          <Err error={error} id="mp-phone-err" />
        </section>
      )}

      {step === "facts" && (
        <section className="grid gap-3">
          <StepTag n={3} />
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="გარიგების ტიპი">
            {(["sale", "rent"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={facts.deal_type === d}
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  facts.deal_type === d
                    ? "border-pine bg-pine text-white"
                    : "border-sand-strong bg-card text-ink"
                }`}
                onClick={() => setFacts((f) => ({ ...f, deal_type: d }))}
              >
                {d === "sale" ? "იყიდება" : "ქირავდება"}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="mp-district" className="mb-1 block text-sm font-medium text-ink">
              უბანი
            </label>
            <select
              id="mp-district"
              name="district_code"
              className={input}
              value={facts.district_code}
              onChange={(e) =>
                setFacts((f) => ({ ...f, district_code: e.target.value }))
              }
            >
              <option value="">აირჩიე…</option>
              {DISTRICTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.ka}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mp-street" className="mb-1 block text-sm font-medium text-ink">
              ქუჩა
            </label>
            <input
              id="mp-street"
              name="street_display"
              className={input}
              placeholder="მაგ. პეკინის ქ."
              aria-describedby="mp-street-help"
              value={facts.street_display}
              onChange={(e) =>
                setFacts((f) => ({ ...f, street_display: e.target.value }))
              }
            />
            <p id="mp-street-help" className="mt-1 text-xs text-faint">
              მხოლოდ ქუჩის ან უბნის სახელი
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="mp-rooms" className="mb-1 block text-sm font-medium text-ink">
                ოთახები
              </label>
              <select
                id="mp-rooms"
                name="rooms"
                className={input}
                value={facts.rooms}
                onChange={(e) =>
                  setFacts((f) => ({ ...f, rooms: e.target.value }))
                }
              >
                {["studio", "1", "2", "3", "4", "5", "6", "7+"].map((r) => (
                  <option key={r} value={r}>
                    {r === "studio" ? "სტუდიო" : r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mp-area" className="mb-1 block text-sm font-medium text-ink">
                ფართი მ²
              </label>
              <input
                id="mp-area"
                name="area"
                className={input}
                inputMode="decimal"
                placeholder="65"
                value={facts.area}
                onChange={(e) =>
                  setFacts((f) => ({ ...f, area: e.target.value }))
                }
              />
            </div>
            <div>
              <label htmlFor="mp-unit-floor" className="mb-1 block text-sm font-medium text-ink">
                ბინის სართული
              </label>
              <input
                id="mp-unit-floor"
                name="unit_floor"
                type="number"
                inputMode="numeric"
                min="0"
                max="200"
                className={input}
                placeholder="4"
                value={floorParts.unit}
                onChange={(e) =>
                  setFacts((f) => ({
                    ...f,
                    floor: joinFloorParts(
                      e.target.value,
                      splitFloorParts(f.floor).total,
                    ),
                  }))
                }
              />
            </div>
            <div>
              <label htmlFor="mp-total-floors" className="mb-1 block text-sm font-medium text-ink">
                შენობის სართულები
              </label>
              <input
                id="mp-total-floors"
                name="total_floors"
                type="number"
                inputMode="numeric"
                min="1"
                max="200"
                className={input}
                placeholder="9"
                value={floorParts.total}
                onChange={(e) =>
                  setFacts((f) => ({
                    ...f,
                    floor: joinFloorParts(
                      splitFloorParts(f.floor).unit,
                      e.target.value,
                    ),
                  }))
                }
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="mp-price" className="mb-1 block text-sm font-medium text-ink">
                ფასი $
              </label>
              <input
                id="mp-price"
                name="price_usd"
                className={input}
                inputMode="numeric"
                placeholder={facts.deal_type === "rent" ? "500" : "85000"}
                value={facts.price_usd}
                onChange={(e) =>
                  setFacts((f) => ({ ...f, price_usd: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <label htmlFor="mp-condition" className="mb-1 block text-sm font-medium text-ink">
              მდგომარეობა
            </label>
            <select
              id="mp-condition"
              name="condition"
              className={input}
              required
              value={facts.condition}
              onChange={(e) =>
                setFacts((f) => ({ ...f, condition: e.target.value }))
              }
            >
              <option value="">აირჩიე…</option>
              {OWNER_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {/* Attribute parity (2026-08-16): every fact the listing page can
              render has an owner path. All optional; unset stays UNKNOWN.
              Progressive <details> sections keep the phone screen a form,
              not a wall — the amenity grid alone is 24 checkboxes. */}
          <details className="rounded-md border border-sand bg-card">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-ink">
              შენობის დეტალები{" "}
              <span className="font-normal text-faint">(არასავალდებულო)</span>
            </summary>
            <div className="grid gap-3 px-3 pb-3">
              <div>
                <label
                  htmlFor="mp-building-status"
                  className="mb-1 block text-sm font-medium text-ink"
                >
                  შენობის სტატუსი
                </label>
                <select
                  id="mp-building-status"
                  name="building_status"
                  className={input}
                  value={facts.building_status}
                  onChange={(e) =>
                    setFacts((f) => ({ ...f, building_status: e.target.value }))
                  }
                >
                  <option value="">აირჩიე…</option>
                  {OWNER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="mp-project-type"
                  className="mb-1 block text-sm font-medium text-ink"
                >
                  პროექტის ტიპი
                </label>
                <select
                  id="mp-project-type"
                  name="project_type"
                  className={input}
                  value={facts.project_type}
                  onChange={(e) =>
                    setFacts((f) => ({ ...f, project_type: e.target.value }))
                  }
                >
                  <option value="">აირჩიე…</option>
                  {OWNER_PROJECT_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="mp-build-year"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    აშენების წელი
                  </label>
                  <input
                    id="mp-build-year"
                    name="build_year"
                    className={input}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="2015"
                    value={facts.build_year}
                    onChange={(e) =>
                      setFacts((f) => ({
                        ...f,
                        build_year: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                  />
                </div>
                <div>
                  <label
                    htmlFor="mp-bathrooms"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    სველი წერტილი
                  </label>
                  <select
                    id="mp-bathrooms"
                    name="bathrooms"
                    className={input}
                    value={facts.bathrooms}
                    onChange={(e) =>
                      setFacts((f) => ({ ...f, bathrooms: e.target.value }))
                    }
                  >
                    <option value="">აირჩიე…</option>
                    {["1", "2", "3", "4", "5"].map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label
                  htmlFor="mp-balcony"
                  className="mb-1 block text-sm font-medium text-ink"
                >
                  აივანი
                </label>
                <select
                  id="mp-balcony"
                  name="balcony"
                  className={input}
                  value={facts.balcony}
                  onChange={(e) =>
                    setFacts((f) => ({ ...f, balcony: e.target.value }))
                  }
                >
                  <option value="">აირჩიე…</option>
                  {/* "yes"/"0" are the catalogue's committed balcony values */}
                  <option value="yes">კი</option>
                  <option value="0">არა</option>
                </select>
              </div>
            </div>
          </details>

          <details className="rounded-md border border-sand bg-card">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-ink">
              კეთილმოწყობა{" "}
              <span className="font-normal text-faint">(არასავალდებულო)</span>
            </summary>
            <p className="px-3 text-xs text-faint">
              მონიშნე რაც ბინაშია. მოუნიშნავი = არ არის მითითებული.
            </p>
            <ul className="grid list-none grid-cols-2 gap-x-3 gap-y-2 p-3">
              {/* Rendered straight from the display registry (lib/amenities):
                  the checkbox list can never drift from what the card shows.
                  pets_allowed is the rent-terms tri-state, not a checkbox —
                  a negative there is publicly meaningful. */}
              {AMENITIES.filter((a) => a.key !== "pets_allowed").map((a) => (
                <li key={a.key} className="flex items-center gap-2">
                  <input
                    id={`mp-amenity-${a.key}`}
                    name={`amenity_${a.key}`}
                    type="checkbox"
                    checked={facts.amenities.includes(a.key)}
                    onChange={(e) =>
                      setFacts((f) => ({
                        ...f,
                        amenities: e.target.checked
                          ? [...f.amenities.filter((k) => k !== a.key), a.key]
                          : f.amenities.filter((k) => k !== a.key),
                      }))
                    }
                  />
                  <label htmlFor={`mp-amenity-${a.key}`} className="text-sm text-ink">
                    {a.ka}
                  </label>
                </li>
              ))}
            </ul>
          </details>

          {facts.deal_type === "rent" && (
            <details className="rounded-md border border-sand bg-card">
              <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-ink">
                ქირაობის პირობები{" "}
                <span className="font-normal text-faint">(არასავალდებულო)</span>
              </summary>
              <div className="grid gap-3 px-3 pb-3">
                <div>
                  <label
                    htmlFor="mp-deposit"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    დეპოზიტი
                  </label>
                  <select
                    id="mp-deposit"
                    name="deposit_required"
                    className={input}
                    value={facts.deposit_required}
                    onChange={(e) =>
                      setFacts((f) => ({ ...f, deposit_required: e.target.value }))
                    }
                  >
                    <option value="">არ არის მითითებული</option>
                    <option value="yes">მოითხოვება</option>
                    <option value="no">არ მოითხოვება</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="mp-pets"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    შინაური ცხოველები
                  </label>
                  <select
                    id="mp-pets"
                    name="pets_allowed"
                    className={input}
                    value={facts.pets_allowed}
                    onChange={(e) =>
                      setFacts((f) => ({ ...f, pets_allowed: e.target.value }))
                    }
                  >
                    <option value="">არ არის მითითებული</option>
                    <option value="yes">დასაშვებია</option>
                    <option value="no">არა</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="mp-min-months"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    მინიმალური ვადა (თვე)
                  </label>
                  <input
                    id="mp-min-months"
                    name="min_months"
                    className={input}
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="6"
                    value={facts.min_months}
                    onChange={(e) =>
                      setFacts((f) => ({
                        ...f,
                        min_months: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                  />
                </div>
                <div className="flex items-start gap-2">
                  <input
                    id="mp-utilities"
                    name="utilities_included"
                    type="checkbox"
                    className="mt-0.5"
                    checked={facts.utilities_included === "yes"}
                    onChange={(e) =>
                      setFacts((f) => ({
                        ...f,
                        utilities_included: e.target.checked ? "yes" : "",
                      }))
                    }
                  />
                  <label htmlFor="mp-utilities" className="text-sm text-ink">
                    კომუნალურები ფასშია
                  </label>
                </div>
              </div>
            </details>
          )}

          <div>
            <label htmlFor="mp-portal" className="mb-1 block text-sm font-medium text-ink">
              თუ განცხადება სხვა საიტზეც გაქვს — ჩასვი ბმული{" "}
              <span className="font-normal text-faint">(არასავალდებულო)</span>
            </label>
            <input
              id="mp-portal"
              name="portal_url"
              className={input}
              inputMode="url"
              placeholder="https://…"
              value={facts.portal_url}
              onChange={(e) =>
                setFacts((f) => ({ ...f, portal_url: e.target.value }))
              }
            />
          </div>
          <button
            type="button"
            className={`${btn} w-full`}
            disabled={busy || !factsComplete(facts)}
            onClick={() => {
              setError(null);
              setStep("describe");
            }}
          >
            გაგრძელება
          </button>
          <Err error={error} id="mp-facts-err" />
          <BackButton onClick={() => setStep("phone")} />
        </section>
      )}

      {step === "describe" && (
        <section>
          <StepTag n={4} />
          <label htmlFor="mp-description" className="mb-1 block text-sm font-medium text-ink">
            აღწერა
          </label>
          <textarea
            id="mp-description"
            name="description"
            className={`${input} min-h-28`}
            maxLength={4000}
            placeholder="მდგომარეობა, ავეჯი, სხვა მნიშვნელოვანი…"
            aria-describedby="mp-describe-err"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {/* ⚠️ MOVED HERE FROM THE FIRST SCREEN (mobile-UX round, 2026-08-18).
              Wording, publication rule and security meaning are unchanged — the
              only change is WHERE it is read. It now sits directly above the
              ownership declaration, which is the moment the owner actually
              asserts the thing the rule constrains, instead of being a wall of
              red on a screen that only asks for an email address. Do not soften
              or shorten it: "ასეთი განცხადებები არ გამოქვეყნდება" is the
              publication rule, not decoration. */}
          <div
            data-testid="mp-prohibition"
            className="mt-4 rounded-lg border border-clay/40 bg-clay/5 p-3 text-sm leading-relaxed"
          >
            <span className="font-semibold text-clay-deep">აკრძალულია</span>{" "}
            იგივე განცხადების რამდენჯერმე ატვირთვა, ყალბი ან სხვისი განცხადების
            განთავსება. ასეთი განცხადებები არ გამოქვეყნდება.
          </div>
          <div className="mt-3 flex items-start gap-2">
            <input
              id="mp-declared"
              name="owner_declared"
              type="checkbox"
              className="mt-0.5"
              checked={declared}
              onChange={(e) => setDeclared(e.target.checked)}
            />
            <label htmlFor="mp-declared" className="text-sm text-ink">
              ვარ ბინის მეპატრონე ან მეპატრონე თანახმაა, რომ განცხადება აიტვირთოს.
            </label>
          </div>
          <button
            type="button"
            className={`${btn} mt-4 w-full`}
            disabled={busy || !declared || description.trim().length === 0}
            onClick={() => void createSubmission()}
          >
            {busy ? "ინახება…" : "გაგრძელება"}
          </button>
          <Err error={error} id="mp-describe-err" />
          <BackButton onClick={() => setStep("facts")} />
        </section>
      )}

      {step === "photos" && (
        <section>
          <StepTag n={5} />
          <p className="text-sm font-medium text-ink">
            ფოტოები ({MIN_PHOTOS}–{MAX_PHOTOS})
          </p>
          <p className="mt-0.5 text-xs text-faint">
            ატვირთულია {doneCount} / {photos.length || MIN_PHOTOS}
          </p>
          <ul className="mt-3 grid list-none grid-cols-3 gap-2 p-0">
            {photos.map((p, i) => {
              const preview = previews[p.id];
              const isCover = cover?.id === p.id;
              return (
                <li
                  key={p.id}
                  className={`relative aspect-square overflow-hidden rounded-md border ${
                    isCover ? "border-2 border-moss" : "border-sand"
                  }`}
                >
                  {/* A real button: keyboard operable, with selected state. */}
                  <button
                    type="button"
                    aria-pressed={isCover}
                    disabled={p.state !== "done"}
                    aria-label={`მთავარ ფოტოდ აირჩიე ფოტო ${i + 1}`}
                    className="block h-full w-full"
                    onClick={() => p.state === "done" && setCoverId(p.id)}
                  >
                    {preview ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={preview}
                        alt={`ფოტო ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-sand text-xs text-mink">
                        ფოტო {i + 1}
                      </span>
                    )}
                  </button>
                  {p.state === "uploading" && (
                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40 text-xs text-white">
                      იტვირთება…
                    </span>
                  )}
                  {p.hold && (
                    <span className="pointer-events-none absolute inset-x-0 top-0 bg-clay/80 px-1 py-1 text-center text-[10px] font-semibold text-white">
                      ფოტო ჯერ მუშავდება
                    </span>
                  )}
                  {p.state === "done" && !preview && (
                    <span className="pointer-events-none absolute inset-x-0 top-0 bg-moss/90 px-1 py-1 text-center text-[10px] font-semibold text-white">
                      ფოტო ატვირთულია
                    </span>
                  )}
                  {p.state === "failed" && !p.hold && Boolean(preview) && !p.permanent && (
                    <button
                      type="button"
                      className="absolute inset-x-0 top-0 bg-clay/70 py-1 text-xs font-semibold text-white"
                      onClick={() => retryPhoto(p.id)}
                    >
                      თავიდან სცადე
                    </button>
                  )}
                  {p.state === "failed" && !p.hold && !preview && (
                    <label className="absolute inset-x-0 top-0 cursor-pointer bg-clay/80 px-1 py-1 text-center text-[10px] font-semibold text-white">
                      ფოტოს თავიდან არჩევა
                      <input
                        type="file"
                        accept={ACCEPTED_IMAGE_TYPES.join(",")}
                        className="sr-only"
                        onChange={(e) => {
                          chooseReplacement(p.id, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  {canRemove(p) && (
                    <button
                      type="button"
                      aria-label={`წაშალე ფოტო ${i + 1}`}
                      className="absolute bottom-1 right-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      onClick={() => removePhoto(p.id)}
                    >
                      წაშლა
                    </button>
                  )}
                  {isCover && p.state === "done" && (
                    <span className="absolute bottom-1 left-1 rounded bg-moss px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      მთავარი ფოტო
                    </span>
                  )}
                </li>
              );
            })}
            {photos.length < MAX_PHOTOS && (
              <li className="list-none">
                <label
                  htmlFor="mp-files"
                  className={`grid aspect-square place-items-center rounded-md border border-dashed border-sand-strong text-3xl text-mink ${photos.some((p) => p.hold) ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                >
                  <span className="text-sm font-medium">ფოტოს დამატება</span>
                </label>
                <input
                  id="mp-files"
                  name="photos"
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  multiple
                  disabled={photos.some((p) => p.hold)}
                  className="sr-only"
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs text-faint">
            მინიმუმ {MIN_PHOTOS}, მაქსიმუმ {MAX_PHOTOS} ფოტო.
          </p>
          {photos.some((p) => p.hold) && (
            <p className="mt-2 text-xs text-clay-deep">
              ჯერ მიმდინარე ატვირთვას ვამოწმებთ. ახალი ფოტო ამის შემდეგ დაამატე.
            </p>
          )}
          {photos.length > 0 && (
            <button
              type="button"
              className="mt-3 w-full text-center text-xs text-mink underline disabled:opacity-40"
              disabled={busy}
              onClick={() => void resetGallery()}
            >
              ყველა ფოტოს წაშლა და თავიდან ატვირთვა
            </button>
          )}
          <button
            type="button"
            className={`${btn} mt-4 w-full`}
            disabled={busy || !reconciled || !galleryReady(photos)}
            onClick={() => void finalize()}
          >
            {busy ? "იგზავნება…" : "გაგზავნა"}
          </button>
          <Err error={error} id="mp-photos-err" />
          <BackButton onClick={() => setStep("describe")} />
        </section>
      )}

      {step === "done" && (
        <section className="py-8 text-center">
          <p className="text-lg font-semibold text-ink">
            მადლობა, განცხადება მიღებულია. გამოქვეყნდება გადამოწმების შემდეგ.
          </p>
        </section>
      )}
    </div>
  );
}
