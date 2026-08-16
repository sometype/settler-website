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
import { OWNER_CONDITIONS } from "@/lib/labels";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_CONCURRENT_UPLOADS,
  MAX_PHOTOS,
  MIN_PHOTOS,
  STORAGE_KEY,
  buildCreatePayload,
  canRemove,
  claimPosition,
  classifyUploadResponse,
  createIdemFor,
  emptyFacts,
  factsComplete,
  galleryReady,
  isPermanentUploadFailure,
  nextUploadBatch,
  planAddFiles,
  readOpaqueToken,
  readSubmissionId,
  removeSlot,
  resolveCover,
  resolveUploadBase,
  restoreState,
  serializeState,
  turnstileSiteKeyRequirement,
  type Facts,
  type PhotoSlot,
  type Step,
} from "@/lib/uploadFlow";

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
        მხოლოდ პატრონები · გამოქვეყნებამდე დაგირეკავთ
      </p>
    );
  }
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        განცხადების დამატება
      </h1>
      <p className="mt-1 text-sm text-mink">
        მხოლოდ პატრონებისთვის · აგენტების გარეშე
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink">
        დაამატე ბინა პირდაპირ. ჩვენ ვამოწმებთ ფოტოებს და ტექსტს — თუ ყველაფერი
        სწორია, გამოვაქვეყნებთ.
      </p>

      {/* Twin box — the load-bearing UI. Neither may ship without the other. */}
      <div className="mt-4 grid gap-2">
        <div className="rounded-lg border border-moss/40 bg-moss/5 p-3 text-sm leading-relaxed">
          <span className="font-semibold text-moss-deep">
            თუ ბინა უკვე გაქვს myhome-ზე ან ss-ზე — აქაც შეგიძლია დაამატო.
          </span>{" "}
          Mepatrone-ზე ერთ ბინას ერთ განცხადებად ვაჩვენებთ. თუ ეს ბინა უკვე
          გვაქვს, დავტოვებთ შენს პირდაპირ ვერსიას.
        </div>
        <div className="rounded-lg border border-clay/40 bg-clay/5 p-3 text-sm leading-relaxed">
          <span className="font-semibold text-clay-deep">აკრძალულია</span>{" "}
          სხვისი ბინის, აგენტის ან მოპარული ფოტოების ატვირთვა. ასეთს ვშლით —
          იმავე ხელის სხვა ყალბ განცხადებებსაც. შენი myhome/ss განცხადება ამით
          არ იშლება.
        </div>
      </div>
      <p className="mt-3 text-xs text-faint">
        ფოტოებს ვადარებთ სხვა საიტებზე არსებულ განცხადებებს — გადაკოპირებული
        სწრაფად ჩანს. გამოქვეყნებამდე <b>დაგირეკავთ</b> მითითებულ ნომერზე.
      </p>
      <p className="mt-2 text-xs text-faint">
        დაუსრულებელი განცხადება 7 დღე ინახება. მერვე დღეს იშლება, ფოტოების
        ჩათვლით.
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
  const [codeToken, setCodeToken] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState(() => saved?.session ?? "");
  const [spamHint, setSpamHint] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const [phone, setPhone] = useState(() => saved?.phone ?? "");
  const [facts, setFacts] = useState<Facts>(() => saved?.facts ?? emptyFacts());
  const [description, setDescription] = useState(() => saved?.description ?? "");
  const [declared, setDeclared] = useState(() => saved?.declared ?? false);
  // Slots whose bytes never uploaded cannot resume without the File, so they
  // are dropped rather than shown as resumable ghosts.
  const [photos, setPhotos] = useState<PhotoSlot[]>(
    () => saved?.photos.filter((p) => p.state === "done") ?? [],
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
    const turnstile =
      (
        document.querySelector(
          'input[name="cf-turnstile-response"]',
        ) as HTMLInputElement | null
      )?.value || "";
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
  }, [email]);

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
    setStep(submissionId ? "photos" : "phone");
  }, [codeToken, code, submissionId]);

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
        setPhotos((p) =>
          p.map((s) => (s.id === id ? { ...s, state: "failed", permanent: true } : s)),
        );
        return;
      }
      let position: number | null = null;
      setPhotos((p) => {
        const slot = p.find((s) => s.id === id);
        if (!slot) return p;
        position = slot.position ?? claimPosition(p);
        return p.map((s) =>
          s.id === id ? { ...s, state: "uploading", position } : s,
        );
      });
      if (position === null) return;

      const tk = await call("ticket", {
        session,
        submission_id: submissionId,
        position,
      });
      if (tk.error) {
        setPhotos((p) =>
          p.map((s) =>
            s.id === id ? { ...s, state: "failed", permanent: false } : s,
          ),
        );
        setError(tk.error);
        return;
      }
      const ticket = readOpaqueToken(tk.data, "upload_ticket");
      if (!ticket) {
        setPhotos((p) =>
          p.map((s) =>
            s.id === id ? { ...s, state: "failed", permanent: false } : s,
          ),
        );
        setError({ code: "ticket_spent", ka: "ამ ფოტოს ატვირთვა თავიდან სცადე." });
        return;
      }
      try {
        const res = await fetch(uploadBase.url + "/upload", {
          method: "PUT",
          headers: { Authorization: `Bearer ${ticket}` },
          body: file,
        });
        const state = classifyUploadResponse(res.status);
        setPhotos((p) =>
          p.map((s) =>
            s.id === id
              ? {
                  ...s,
                  state,
                  permanent: state === "failed" && isPermanentUploadFailure(res.status),
                }
              : s,
          ),
        );
        if (state === "done") {
          releasePreview(id);
          setCoverId((c) => c ?? id);
        } else {
          setError({
            code: "photo",
            ka: "ეს ფოტო ვერ აიტვირთა. თავიდან სცადე ან წაშალე.",
          });
        }
      } catch {
        setPhotos((p) =>
          p.map((s) =>
            s.id === id ? { ...s, state: "failed", permanent: false } : s,
          ),
        );
        setError({
          code: "photo",
          ka: "ეს ფოტო ვერ აიტვირთა. თავიდან სცადე ან წაშალე.",
        });
      }
    },
    [session, submissionId, uploadBase, releasePreview],
  );

  // At most MAX_CONCURRENT_UPLOADS run at once, whatever the owner selected.
  const startingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (step !== "photos") return;
    for (const id of nextUploadBatch(photos, MAX_CONCURRENT_UPLOADS)) {
      if (startingRef.current.has(id)) continue;
      startingRef.current.add(id);
      void uploadOne(id).finally(() => startingRef.current.delete(id));
    }
  }, [photos, step, uploadOne]);

  const addFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const incoming = Array.from(list);
      const plan = planAddFiles(photos.length, incoming);
      const messages: string[] = [];
      if (plan.excess > 0) {
        messages.push(`${MAX_PHOTOS} ფოტოზე მეტი არ ჩაიტვირთა (${plan.excess} დარჩა).`);
      }
      if (plan.rejectedType.length > 0) {
        messages.push(
          `${plan.rejectedType.length} ფაილი არ არის მხარდაჭერილი (JPEG/PNG/WebP). iPhone-ზე HEIC გამორთე ან გადაიყვანე.`,
        );
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
        };
      });
      if (added.length > 0) {
        setPreviews((prev) => ({ ...prev, ...fresh }));
        setPhotos((p) => [...p, ...added]);
      }
    },
    [photos.length],
  );

  const removePhoto = useCallback(
    (id: string) => {
      releasePreview(id);
      setPhotos((p) => removeSlot(p, id));
      setCoverId((c) => (c === id ? null : c));
    },
    [releasePreview],
  );

  const retryPhoto = useCallback((id: string) => {
    setPhotos((p) =>
      p.map((s) => (s.id === id ? { ...s, state: "pending", permanent: false } : s)),
    );
  }, []);

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
      setError(r.error);
      return;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    setStep("done");
  }, [session, submissionId, photos, coverId]);

  /* ------------------------------ render -------------------------------- */

  const doneCount = photos.filter((p) => p.state === "done").length;
  const cover = resolveCover(photos, coverId);
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
            onChange={(e) => setEmail(e.target.value)}
          />
          {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
            <div
              className="cf-turnstile mt-3"
              data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            />
          ) : null}
          <button
            type="button"
            className={`${btn} mt-3 w-full`}
            disabled={busy || !email.includes("@") || Boolean(configError)}
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
            {resendIn > 0 ? `ხელახლა გაგზავნა (${resendIn}წმ)` : "ხელახლა გაგზავნა"}
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
              ქუჩა / უბანი
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
              მხოლოდ ქუჩის ან უბნის სახელი — სახლის ნომერი და ბინის ნომერი არ
              ჩაწერო. ნომერს ზარზე / შეხვედრაზე იტყვი.
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
              <label htmlFor="mp-floor" className="mb-1 block text-sm font-medium text-ink">
                სართული
              </label>
              <input
                id="mp-floor"
                name="floor"
                className={input}
                placeholder="4/9"
                value={facts.floor}
                onChange={(e) =>
                  setFacts((f) => ({ ...f, floor: e.target.value }))
                }
              />
            </div>
            <div>
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
          <div>
            <label htmlFor="mp-portal" className="mb-1 block text-sm font-medium text-ink">
              თუ უკვე გაქვს ბმული myhome/ss-ზე — ჩასვი{" "}
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
              ვადასტურებ, რომ ამ ბინის პატრონი ვარ. აგენტი არ ვარ.
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
            ატვირთულია {doneCount} / {photos.length || MIN_PHOTOS} ·
            დაუსრულებელი განცხადება 7 დღე ინახება. მერვე დღეს იშლება, ფოტოების
            ჩათვლით.
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
                  {p.state === "failed" && !p.permanent && (
                    <button
                      type="button"
                      className="absolute inset-x-0 top-0 bg-clay/70 py-1 text-xs font-semibold text-white"
                      onClick={() => retryPhoto(p.id)}
                    >
                      თავიდან სცადე
                    </button>
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
                  className="grid aspect-square cursor-pointer place-items-center rounded-md border border-dashed border-sand-strong text-3xl text-mink"
                >
                  <span className="text-sm font-medium">ფოტოს დამატება</span>
                </label>
                <input
                  id="mp-files"
                  name="photos"
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs text-faint">
            მხოლოდ JPEG და PNG. iPhone-ის HEIC ჯერ არ მიიღება. მინიმუმ{" "}
            {MIN_PHOTOS}, მაქსიმუმ {MAX_PHOTOS} ფოტო. ვერ აიტვირთა — თავიდან
            სცადე ან წაშალე. მთავარი ფოტო ატვირთულზე დაჭერით აირჩიე.
          </p>
          <button
            type="button"
            className={`${btn} mt-4 w-full`}
            disabled={busy || !galleryReady(photos)}
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
            მიღებულია. გამოქვეყნებული ჯერ არ არის. მალე დაგირეკავთ.
          </p>
          {/* Grok D3: the call expectation is the largest type on this page */}
          <p className="mt-4 text-2xl font-bold text-moss-deep">
            მალე დაგირეკავთ.
          </p>
          <p className="mt-2 text-sm text-mink">
            უპასუხე უცნობ ნომერს — ეს ის შემოწმებაა, რაც აქ გიწერია.
          </p>
        </section>
      )}
    </div>
  );
}
