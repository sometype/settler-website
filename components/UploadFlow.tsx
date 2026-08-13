"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DISTRICTS } from "@/lib/districts";

/**
 * Owner upload flow — Grok's frozen order (OWNERUPLOADDISCUSSION §C):
 * manifesto → email+code → phone → facts → photos → text+declare → status.
 *
 * COPY IS LAW, not placeholder: manifesto split (portal-OK + agent-nuke, both
 * above the fold), «დაგირეკავთ» on its three surfaces, K3 wait screen (never
 * lead with spam), K5 busy/too-fast, 7-day draft notice at start AND photos,
 * per-photo retry (never restart the gallery). Polish is allowed; reversing
 * any of those is not.
 */

const UPLOAD_URL =
  (process.env.NEXT_PUBLIC_INTAKE_UPLOAD_URL || "https://api.mepatrone.com") +
  "/upload";
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 20;

type ApiError = { code: string; ka: string; retry_after_s?: number };

type PhotoSlot = {
  file: File;
  preview: string;
  state: "pending" | "uploading" | "done" | "failed";
};

function newIdem(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
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
    const body = (await res.json()) as {
      error?: ApiError;
      [k: string]: unknown;
    };
    if (!res.ok) {
      return {
        error: body.error ?? {
          code: "busy",
          ka: "ახლა გადატვირთულია. 5 წამში თავიდან სცადე. არაფერი დაიკარგა.",
        },
      };
    }
    return { data: body };
  } catch {
    return {
      error: {
        code: "network",
        ka: "კავშირი გაწყდა. ინტერნეტი შეამოწმე და თავიდან სცადე — არაფერი დაიკარგა.",
      },
    };
  }
}

function maskEmail(e: string): string {
  const [local, domain] = e.split("@");
  if (!domain) return e;
  return `${local.slice(0, 2)}…@${domain}`;
}

/* ---------------------------------- shared bits ------------------------- */

function Err({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <p className="mt-2 rounded-md bg-clay/10 px-3 py-2 text-sm leading-snug text-clay-deep">
      {error.ka}
    </p>
  );
}

function StepTag({ n }: { n: number }) {
  return (
    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">
      ნაბიჯი {n}/6
    </p>
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
          შენი პირდაპირი განცხადება იქნება <b>მთავარი</b> ბარათი Mepatrone-ზე.
          ერთ ბინაზე <b>ორ ბარათს არ ვაჩვენებთ</b>.
        </div>
        <div className="rounded-lg border border-clay/40 bg-clay/5 p-3 text-sm leading-relaxed">
          <span className="font-semibold text-clay-deep">აკრძალულია</span>{" "}
          სხვისი ბინის, აგენტის ან გადაკოპირებული განცხადების ატვირთვა.
          აღმოჩენისას ვშლით — <b>დაკავშირებულ ასლებსაც</b>.
        </div>
      </div>
      <p className="mt-3 text-xs text-faint">
        ვამოწმებთ ფოტოების ანაბეჭდებით და სხვა წყაროებთან შედარებით.
        გამოქვეყნებამდე <b>დაგირეკავთ</b> მითითებულ ნომერზე.
      </p>
      <p className="mt-2 text-xs text-faint">დრაფტი ინახება 7 დღე.</p>
    </header>
  );
}

/* ---------------------------------- main flow --------------------------- */

type Step = "email" | "code" | "phone" | "facts" | "photos" | "describe" | "done";

export default function UploadFlow() {
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [codeToken, setCodeToken] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState("");
  const [spamHint, setSpamHint] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const [phone, setPhone] = useState("");
  const [facts, setFacts] = useState({
    deal_type: "sale",
    district_code: "",
    street_display: "",
    rooms: "2",
    area: "",
    floor: "",
    price_usd: "",
    portal_url: "",
  });
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [cover, setCover] = useState(0);
  const [description, setDescription] = useState("");
  const [declared, setDeclared] = useState(false);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [finalStatus, setFinalStatus] = useState("");

  // Session survives a refresh (Grok §C: surface "განაგრძე" if they return).
  useEffect(() => {
    const saved = sessionStorage.getItem("mp_upload");
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.session) {
          setSession(s.session);
          setEmail(s.email || "");
          if (s.submissionId) setSubmissionId(s.submissionId);
          setStep(s.step || "phone");
        }
      } catch {
        /* corrupt state = start over */
      }
    }
  }, []);
  useEffect(() => {
    if (session) {
      sessionStorage.setItem(
        "mp_upload",
        JSON.stringify({ session, email, submissionId, step }),
      );
    }
  }, [session, email, submissionId, step]);

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

  const idemRef = useRef<Record<string, string>>({});
  const idemFor = (k: string) => {
    if (!idemRef.current[k]) idemRef.current[k] = newIdem();
    return idemRef.current[k];
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
      idem: idemFor("verify" + email.trim()),
    });
    setBusy(false);
    if (r.error) {
      if (r.error.retry_after_s) setResendIn(r.error.retry_after_s);
      setError(r.error);
      return;
    }
    setCodeToken(String(r.data?.token ?? ""));
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
    setSession(String(r.data?.session ?? ""));
    setStep("phone");
  }, [codeToken, code]);

  const createSubmission = useCallback(async () => {
    setBusy(true);
    setError(null);
    const r = await call("create", {
      session,
      phone: phone.trim(),
      deal_type: facts.deal_type,
      district_code: facts.district_code,
      street_display: facts.street_display.trim(),
      rooms: facts.rooms,
      area: Number(facts.area),
      floor: facts.floor.trim(),
      price_usd: Number(facts.price_usd),
      description: null,
      portal_url: facts.portal_url.trim() || null,
      owner_declared: true,
      idem: idemFor("create"),
    });
    setBusy(false);
    if (r.error) {
      if (r.error.code === "session_expired") setStep("email");
      setError(r.error);
      return;
    }
    setSubmissionId(Number(r.data?.submission_id));
    setStep("photos");
  }, [session, phone, facts]);

  const uploadOne = useCallback(
    async (idx: number, slot: PhotoSlot) => {
      if (!submissionId) return;
      setPhotos((p) =>
        p.map((s, i) => (i === idx ? { ...s, state: "uploading" } : s)),
      );
      const tk = await call("ticket", {
        session,
        submission_id: submissionId,
        position: idx,
      });
      if (tk.error) {
        setPhotos((p) =>
          p.map((s, i) => (i === idx ? { ...s, state: "failed" } : s)),
        );
        setError(tk.error);
        return;
      }
      try {
        const res = await fetch(UPLOAD_URL, {
          method: "PUT",
          headers: { Authorization: `Bearer ${tk.data?.upload_ticket}` },
          body: slot.file,
        });
        setPhotos((p) =>
          p.map((s, i) =>
            i === idx ? { ...s, state: res.ok ? "done" : "failed" } : s,
          ),
        );
        if (!res.ok) {
          setError({
            code: "photo",
            ka: "ეს ფოტო ვერ აიტვირთა — თავიდან სცადე. დანარჩენები ადგილზეა.",
          });
        }
      } catch {
        setPhotos((p) =>
          p.map((s, i) => (i === idx ? { ...s, state: "failed" } : s)),
        );
        setError({
          code: "photo",
          ka: "ეს ფოტო ვერ აიტვირთა — თავიდან სცადე. დანარჩენები ადგილზეა.",
        });
      }
    },
    [session, submissionId],
  );

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const room = MAX_PHOTOS - photos.length;
      const next = Array.from(files)
        .slice(0, room)
        .map((f) => ({
          file: f,
          preview: URL.createObjectURL(f),
          state: "pending" as const,
        }));
      const base = photos.length;
      setPhotos((p) => [...p, ...next]);
      // fire uploads sequentially-ish; each owns its slot and its retry
      next.forEach((slot, j) => void uploadOne(base + j, slot));
    },
    [photos.length, uploadOne],
  );

  const finalize = useCallback(async () => {
    if (!submissionId) return;
    setBusy(true);
    setError(null);
    const r = await call("finalize", {
      session,
      submission_id: submissionId,
      preferred_cover: cover,
      idem: idemFor("finalize"),
    });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setFinalStatus(String(r.data?.status ?? "checking"));
    sessionStorage.removeItem("mp_upload");
    setStep("done");
  }, [session, submissionId, cover]);

  /* ------------------------------ render -------------------------------- */

  const doneCount = photos.filter((p) => p.state === "done").length;
  const input =
    "w-full rounded-md border border-sand-strong bg-card px-3 py-2 text-sm text-ink outline-none focus:border-moss";
  const btn =
    "rounded-md bg-pine px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40";

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      {step === "email" ? <Manifesto /> : <Manifesto compact />}

      {step === "email" && (
        <section>
          <StepTag n={1} />
          <label className="mb-1 block text-sm font-medium text-ink">
            ელფოსტა
          </label>
          <input
            className={input}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="შენი ელფოსტა"
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
            className={`${btn} mt-3 w-full`}
            disabled={busy || !email.includes("@")}
            onClick={() => void startVerify()}
          >
            {busy ? "იგზავნება…" : "კოდის მიღება"}
          </button>
          <Err error={error} />
        </section>
      )}

      {step === "code" && (
        <section>
          <StepTag n={1} />
          <p className="text-sm leading-relaxed text-ink">
            კოდი გავუგზავნეთ <b>{maskEmail(email)}</b>. გახსენით წერილი — კოდი
            სათაურშიც წერია.
          </p>
          {spamHint && (
            <p className="mt-1 text-xs text-faint">
              არ ჩანს? გახსენით სპამი / Promotions.
            </p>
          )}
          <input
            className={`${input} mt-3 text-center text-lg tracking-[0.4em]`}
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button
            className={`${btn} mt-3 w-full`}
            disabled={busy || code.length !== 6}
            onClick={() => void checkCode()}
          >
            დადასტურება
          </button>
          <button
            className="mt-2 w-full text-center text-xs text-mink underline disabled:no-underline disabled:opacity-50"
            disabled={resendIn > 0 || busy}
            onClick={() => {
              idemRef.current = {};
              setSpamHint(true); // K3.2: after first resend the hint may show
              void startVerify();
            }}
          >
            {resendIn > 0 ? `ხელახლა გაგზავნა (${resendIn}წმ)` : "ხელახლა გაგზავნა"}
          </button>
          <Err error={error} />
        </section>
      )}

      {step === "phone" && (
        <section>
          <StepTag n={2} />
          <label className="mb-1 block text-sm font-medium text-ink">
            ტელეფონი — რომელზეც მყიდველები დაგირეკავენ
          </label>
          <input
            className={input}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="5XX XX XX XX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="mt-1.5 text-xs font-medium text-moss-deep">
            ამ ნომერზე დაგირეკავთ შემოწმებისას.
          </p>
          <button
            className={`${btn} mt-3 w-full`}
            disabled={phone.replace(/\D/g, "").length < 9}
            onClick={() => {
              setError(null);
              setStep("facts");
            }}
          >
            გაგრძელება
          </button>
          <Err error={error} />
        </section>
      )}

      {step === "facts" && (
        <section className="grid gap-3">
          <StepTag n={3} />
          <div className="grid grid-cols-2 gap-2">
            {(["sale", "rent"] as const).map((d) => (
              <button
                key={d}
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
            <label className="mb-1 block text-sm font-medium text-ink">
              უბანი
            </label>
            <select
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
            <label className="mb-1 block text-sm font-medium text-ink">
              ქუჩა / უბანი
            </label>
            <input
              className={input}
              placeholder="მაგ. პეკინის ქ."
              value={facts.street_display}
              onChange={(e) =>
                setFacts((f) => ({ ...f, street_display: e.target.value }))
              }
            />
            <p className="mt-1 text-xs text-faint">
              მხოლოდ ქუჩის ან უბნის სახელი — სახლის ნომერი და ბინის ნომერი არ
              ჩაწერო. ნომერს ზარზე / შეხვედრაზე იტყვი.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                ოთახები
              </label>
              <select
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
              <label className="mb-1 block text-sm font-medium text-ink">
                ფართი მ²
              </label>
              <input
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
              <label className="mb-1 block text-sm font-medium text-ink">
                სართული
              </label>
              <input
                className={input}
                placeholder="4/9"
                value={facts.floor}
                onChange={(e) =>
                  setFacts((f) => ({ ...f, floor: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                ფასი $
              </label>
              <input
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
            <label className="mb-1 block text-sm font-medium text-ink">
              თუ უკვე გაქვს ბმული myhome/ss-ზე — ჩასვი{" "}
              <span className="font-normal text-faint">(არასავალდებულო)</span>
            </label>
            <input
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
            className={`${btn} w-full`}
            disabled={
              busy ||
              !facts.district_code ||
              facts.street_display.trim().length < 2 ||
              !facts.area ||
              !facts.price_usd
            }
            onClick={() => void createSubmission()}
          >
            {busy ? "ინახება…" : "გაგრძელება"}
          </button>
          <Err error={error} />
        </section>
      )}

      {step === "photos" && (
        <section>
          <StepTag n={4} />
          <p className="text-sm font-medium text-ink">
            ფოტოები ({MIN_PHOTOS}–{MAX_PHOTOS})
          </p>
          <p className="mt-0.5 text-xs text-faint">
            ატვირთულია {doneCount} / {photos.length || MIN_PHOTOS} · დრაფტი
            ინახება 7 დღე
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div
                key={i}
                className={`relative aspect-square overflow-hidden rounded-md border ${
                  i === cover ? "border-2 border-moss" : "border-sand"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.preview}
                  alt={`ფოტო ${i + 1}`}
                  className="h-full w-full object-cover"
                  onClick={() => p.state === "done" && setCover(i)}
                />
                {p.state === "uploading" && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40 text-xs text-white">
                    იტვირთება…
                  </div>
                )}
                {p.state === "failed" && (
                  <button
                    className="absolute inset-0 grid place-items-center bg-clay/70 text-xs font-semibold text-white"
                    onClick={() => void uploadOne(i, p)}
                  >
                    თავიდან სცადე
                  </button>
                )}
                {i === cover && p.state === "done" && (
                  <span className="absolute bottom-1 left-1 rounded bg-moss px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    გარეკანი
                  </span>
                )}
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="grid aspect-square cursor-pointer place-items-center rounded-md border border-dashed border-sand-strong text-3xl text-mink">
                +
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </label>
            )}
          </div>
          <p className="mt-2 text-xs text-faint">
            აირჩიე გარეკანი ატვირთულ ფოტოზე დაჭერით.
          </p>
          <button
            className={`${btn} mt-4 w-full`}
            disabled={doneCount < MIN_PHOTOS || doneCount !== photos.length}
            onClick={() => {
              setError(null);
              setStep("describe");
            }}
          >
            გაგრძელება
          </button>
          <Err error={error} />
        </section>
      )}

      {step === "describe" && (
        <section>
          <StepTag n={5} />
          <label className="mb-1 block text-sm font-medium text-ink">
            აღწერა <span className="font-normal text-faint">(მოკლედ)</span>
          </label>
          <textarea
            className={`${input} min-h-28`}
            maxLength={4000}
            placeholder="მდგომარეობა, ავეჯი, სხვა მნიშვნელოვანი…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="mt-3 flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={declared}
              onChange={(e) => setDeclared(e.target.checked)}
            />
            ვადასტურებ, რომ პატრონი ვარ / უფლება მაქვს გამოვაქვეყნო
          </label>
          <button
            className={`${btn} mt-4 w-full`}
            disabled={busy || !declared}
            onClick={() => void finalize()}
          >
            {busy ? "იგზავნება…" : "გაგზავნა"}
          </button>
          <Err error={error} />
        </section>
      )}

      {step === "done" && (
        <section className="py-8 text-center">
          <p className="text-lg font-semibold text-ink">
            მიღებულია. განვიხილავთ (ჩვ. 24 სთ).
          </p>
          {/* Grok D3: the call expectation is the largest type on this page */}
          <p className="mt-4 text-2xl font-bold text-moss-deep">
            მალე დაგირეკავთ.
          </p>
          <p className="mt-2 text-sm text-mink">
            უპასუხე უცნობ ნომერს — ეს ის შემოწმებაა, რაც აქ გიწერია.
          </p>
          {finalStatus === "pending_review" || finalStatus === "checking" ? null : (
            <p className="mt-3 text-xs text-faint">სტატუსი: {finalStatus}</p>
          )}
        </section>
      )}
    </div>
  );
}
