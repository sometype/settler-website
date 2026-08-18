/**
 * Driver for scripts/upload-mobile.browser.mjs — real Chromium at 390x844.
 *
 * Deliberately NOT named *.test.mjs: `npm run test:unit` globs that pattern and
 * runs it under `node --test`, which cannot start a browser or a dev server.
 * This is a separate command because it has a separate prerequisite (a running
 * dev server), and a test that silently cannot run is worse than one that says
 * so — it reports SETUP and exits 2 rather than passing empty.
 *
 * Usage:
 *   npm run dev                      # in another shell
 *   BASE_URL=http://localhost:3000 SHOTS=/tmp/shots node scripts/run-upload-mobile.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { run, VIEWPORT_SIZE } from "./upload-mobile.browser.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOT_DIR = process.env.SHOTS || "";
const LABEL = process.env.LABEL || "run";

async function reachable(url) {
  try {
    const r = await fetch(url, { method: "GET" });
    return r.status < 500;
  } catch {
    return false;
  }
}

const target = `${BASE}/upload`;
if (!(await reachable(target))) {
  console.error(`SETUP: ${target} is not reachable. Start the dev server first.`);
  process.exit(2);
}

if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT_SIZE,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();

const screenshot = SHOT_DIR
  ? async (name) =>
      page.screenshot({ path: `${SHOT_DIR}/${LABEL}-${name}.png`, fullPage: false })
  : undefined;

let results = [];
let code = 0;
try {
  results = await run(page, { screenshot });
} catch (e) {
  console.error(`SETUP: harness error: ${e.message}`);
  code = 2;
} finally {
  await browser.close();
}

if (code !== 2) {
  for (const [status, name, msg] of results) {
    console.log(`${status}  ${name}${msg ? `  -- ${msg}` : ""}`);
  }
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\nMOBILE_BROWSER: ${results.length - failed} pass, ${failed} fail`);
  code = failed > 0 ? 1 : 0;
}
process.exit(code);
