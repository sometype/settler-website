/**
 * REAL BROWSER test for the /upload entry step at 390x844 (iPhone 12/13/14).
 *
 * ⚠️ WHY THIS IS NOT ANOTHER SOURCE-STRING TEST. `upload-flow.test.mjs` asserts
 * on `UploadFlow.tsx` as text, which cannot tell you whether the rendered button
 * is actually disabled, whether the first screen overflows 390px, or whether
 * verify-start fires once. Those are the exact things this round changed, and a
 * regex over source would have passed against the broken build. This drives the
 * component Next actually renders, in a real engine, at a real viewport.
 *
 * It runs against a dev server the caller starts, and it NEVER sends an OTP:
 * `/api/intake/*` is intercepted in the page, so `verify-start` is counted and
 * answered locally. No network, no provider, no rate-limit slot consumed.
 *
 * Turnstile is stubbed the way the real widget behaves under implicit
 * rendering: it calls the global named callback with a token. That is the
 * contract the component depends on, so stubbing it is legitimate; what is
 * being tested is OUR readiness gate, not Cloudflare's challenge.
 *
 * Usage:  BASE_URL=http://localhost:3000 node scripts/upload-mobile.browser.test.mjs
 * Exit:   0 pass, 1 assertion failure, 2 setup/environment error (never silent).
 */
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const VIEWPORT = { width: 390, height: 844 };

/* The harness is supplied by the runner (Playwright/CDP). This file exports the
   assertions so the same script can be driven by whatever driver is available;
   `run(page)` is the contract. */

/**
 * Write a persisted draft and reload in the SAME tick.
 *
 * ⚠️ The component serialises its own state to sessionStorage on every change.
 * Seeding and then reloading as two awaits lets that effect fire in between and
 * clobber the fixture, so the app restores its previous step and the assertion
 * fails for a reason that has nothing to do with the code under test. JS is
 * single-threaded: calling location.reload() immediately after setItem leaves
 * React no window to run.
 */

/**
 * The restored-draft gate ("დაუსრულებელი განცხადება გაქვს") is offered
 * explicitly and must be accepted before the step renders.
 *
 * ⚠️ A bare `count()` here is a race: it polls ONCE, and before hydration has
 * painted the gate it returns 0, so the click is skipped and the app then sits
 * on the gate forever while the assertion waits for a step that will never
 * appear. Wait for the control, then click it.
 */
async function dismissResumeGate(page) {
  const resume = page.getByRole("button", { name: "განაგრძე" });
  try {
    await resume.waitFor({ state: "visible", timeout: 8_000 });
    await resume.click();
  } catch {
    // Gate not shown (no restorable draft) — the step is already rendering.
  }
}

async function seedAndReload(page, draft) {
  await page.evaluate((data) => {
    sessionStorage.setItem("mp_upload", data);
    location.reload();
  }, JSON.stringify(draft));
  await page.waitForLoadState("domcontentloaded");
}

export const VIEWPORT_SIZE = VIEWPORT;

export async function run(page, { screenshot } = {}) {
  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push(["PASS", name, ""]);
    } catch (e) {
      results.push(["FAIL", name, String(e.message).split("\n")[0]]);
    }
  };

  // ---- install stubs BEFORE any app script runs -------------------------
  await page.addInitScript(() => {
    window.__verifyStartCalls = 0;
    window.__abandonCalls = 0;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/intake/verify-start")) {
        window.__verifyStartCalls += 1;
        return new Response(JSON.stringify({ token: "stub-challenge-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/intake/verify-check")) {
        return new Response(JSON.stringify({ session: "verified-owner-session" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/intake/recover")) {
        return new Response(JSON.stringify({ draft: {
          submission_id: 77, status: "draft", phone: "+995555123456",
          deal_type: "rent", district_code: "gldani",
          street_display: "პეკინის ქ.", rooms: "2", area: "65",
          floor: "4/9", price_usd: 600, condition: "ახალი რემონტით",
          description: "ძველი აღწერა", portal_url: null,
          owner_declared: true, preferred_cover: null,
          bathrooms: null, build_period: null, building_status: null,
          project_type: null, balcony: null, amenities: [],
          deposit_required: null, utilities_included: null,
          min_months: null, pets_allowed: null,
          positions: [], pending_positions: [],
        }}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/intake/abandon")) {
        window.__abandonCalls += 1;
        return new Response(JSON.stringify({ ok: true, submission_id: 77 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/intake/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return realFetch(input, init);
    };
    // Turnstile stub: implicit rendering invokes the global named callback.
    window.__solveTurnstile = () => {
      const el = document.querySelector(".cf-turnstile");
      const cb = el && el.getAttribute("data-callback");
      if (cb && typeof window[cb] === "function") window[cb]("stub-turnstile-token");
    };
    window.__expireTurnstile = () => {
      const el = document.querySelector(".cf-turnstile");
      const cb = el && el.getAttribute("data-expired-callback");
      if (cb && typeof window[cb] === "function") window[cb]();
    };
  });

  await page.setViewportSize(VIEWPORT);
  await page.goto(`${BASE}/upload`, { waitUntil: "domcontentloaded" });

  // ⚠️ Located by the VISIBLE LABEL, not by a data-testid. A testid that only
  // exists on the repaired tree makes every baseline failure a missing-selector
  // artifact instead of a behavioural one, and a control that fails for the
  // wrong reason is not evidence (III-B).
  const btn = () => page.getByRole("button", { name: "კოდის მიღება" });
  const emailBox = () => page.locator("#mp-email");
  // ⚠️ Wait for hydration before capturing. The component renders only the
  // manifesto until `hydrated` flips, so a shot taken at DOMContentLoaded
  // shows neither the email field nor the button and compares nothing.
  await emailBox().waitFor({ state: "visible", timeout: 15_000 });
  if (screenshot) await screenshot("entry-step");

  // ---- 1. invalid email cannot advance ---------------------------------
  await check("invalid email cannot advance", async () => {
    for (const bad of ["", "@", "a@", "a@b", "me@localhost", "no-at-sign", "a b@c.com"]) {
      await emailBox().fill(bad);
      await page.evaluate(() => window.__solveTurnstile());
      assert.equal(
        await btn().isDisabled(),
        true,
        `button enabled for invalid email ${JSON.stringify(bad)}`
      );
    }
  });

  // ---- 2. valid email WITHOUT a token cannot advance --------------------
  await check("valid email without Turnstile token cannot advance", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await emailBox().fill("owner@example.com");
    assert.equal(await btn().isDisabled(), true, "button enabled with no token");
    // and an expired token must revoke readiness, not weaken it
    await page.evaluate(() => window.__solveTurnstile());
    assert.equal(await btn().isDisabled(), false, "token should enable");
    await page.evaluate(() => window.__expireTurnstile());
    assert.equal(await btn().isDisabled(), true, "expired token must disable again");
  });

  // ---- 3. valid email + token invokes verification exactly once ---------
  await check("valid email + token invokes verify-start exactly once", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await emailBox().fill("owner@example.com");
    await page.evaluate(() => window.__solveTurnstile());
    assert.equal(await btn().isDisabled(), false, "should be enabled");
    await btn().click();
    await page.waitForTimeout(600);
    const calls = await page.evaluate(() => window.__verifyStartCalls);
    assert.equal(calls, 1, `verify-start called ${calls} times, expected exactly 1`);
  });

  // ---- 4. no horizontal overflow on the first screen --------------------
  await check("first screen has no horizontal overflow at 390px", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      inner: window.innerWidth,
    }));
    assert.ok(
      m.doc <= m.inner && m.body <= m.inner,
      `overflow: doc=${m.doc} body=${m.body} viewport=${m.inner}`
    );
  });

  // ---- 5. the prohibition warning is at the declaration step ------------
  await check("prohibition warning is NOT on the first screen", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    // ⚠️ Text-based on purpose. Checking the testid alone passed against the
    // baseline — where the warning IS on the first screen — because the
    // baseline has no testid at all. That is a false green, and it is the
    // exact failure this suite exists to prevent.
    const firstScreen = await page.locator("body").innerText();
    assert.ok(
      !firstScreen.includes("აკრძალულია"),
      "prohibition warning is still on the entry screen"
    );
  });

  await check("prohibition warning IS at the ownership/declaration step", async () => {
    // Drive to the declare step through the real flow.
    await seedAndReload(page, {
      v: 2, session: "browser-test", email: "owner@example.com",
      phone: "555123456", step: "describe",
      facts: { deal_type: "rent", district_code: "gldani",
               street_display: "პეკინის ქ.", rooms: "2", area: "65",
               floor: "4/9", price_usd: "600",
               condition: "ახალი რემონტით", portal_url: "" },
      description: "", declared: false, submissionId: null,
      createIdem: "", coverId: null, photos: [],
    });
    await dismissResumeGate(page);
    // Wait for the step to actually render rather than guessing a duration —
    // a fixed sleep made this report a false FAIL on a tree that was fine.
    await page.locator("#mp-declared").waitFor({ state: "visible", timeout: 10_000 });
    const text = await page.locator("body").innerText();
    assert.ok(text.includes("აკრძალულია"), "prohibition warning missing at declare step");
    assert.match(text, /აკრძალულია/);
    assert.match(text, /ასეთი განცხადებები არ გამოქვეყნდება/,
      "the publication rule must survive verbatim");
    const declared = page.locator("#mp-declared");
    assert.equal(await declared.count(), 1, "declaration checkbox not on this step");
    if (screenshot) await screenshot("declare-step");
  });

  // ---- 6. completion screen unchanged this round -----------------------
  await check("completion screen is unchanged for this round", async () => {
    await seedAndReload(page, {
      v: 2, session: "browser-test", email: "o@example.com", phone: "555123456",
      step: "done", facts: {}, description: "", declared: true,
      submissionId: 1, createIdem: "", coverId: null, photos: [],
    });
    await dismissResumeGate(page);
    await page.getByText("მიღებულია").first().waitFor({ state: "visible", timeout: 10_000 });
    const body = await page.locator("body").innerText();
    assert.match(body, /მიღებულია/, "completion heading changed");
    assert.ok(
      !body.includes("აკრძალულია"),
      "prohibition warning leaked onto the completion screen"
    );
  });

  // ---- 7. empty-browser recovery offers both honest exits ---------------
  const verifyIntoRecovery = async () => {
    await page.evaluate(() => {
      sessionStorage.clear();
      location.reload();
    });
    await page.waitForLoadState("domcontentloaded");
    await emailBox().waitFor({ state: "visible", timeout: 10_000 });
    await emailBox().fill("owner@example.com");
    await page.evaluate(() => window.__solveTurnstile());
    await btn().click();
    const code = page.locator("#mp-code");
    await code.waitFor({ state: "visible", timeout: 10_000 });
    await code.fill("123456");
    await page.getByRole("button", { name: "დადასტურება" }).click();
    await page.getByRole("button", { name: "არსებული განცხადების გაგრძელება" })
      .waitFor({ state: "visible", timeout: 10_000 });
  };

  await check("verified owner on an empty browser can resume the server draft", async () => {
    await verifyIntoRecovery();
    const body = await page.locator("body").innerText();
    assert.ok(body.includes("ძველი განცხადების წაშლა და თავიდან დაწყება"));
    assert.ok(!body.includes("7 დღე დაიცადე"), "the old seven-day dead end returned");
    await page.getByRole("button", { name: "არსებული განცხადების გაგრძელება" }).click();
    await page.getByText("ფოტოები", { exact: true }).first()
      .waitFor({ state: "visible", timeout: 10_000 });
  });

  await check("verified owner can abandon the old draft and restart", async () => {
    await verifyIntoRecovery();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", {
      name: "ძველი განცხადების წაშლა და თავიდან დაწყება",
    }).click();
    await page.locator("#mp-phone").waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await page.evaluate(() => window.__abandonCalls), 1);
    const body = await page.locator("body").innerText();
    assert.ok(body.includes("ძველი განცხადება წაიშალა"));
  });

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error("This module is driven by a browser harness; see the run() export.");
  process.exit(2);
}
