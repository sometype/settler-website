import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/img/[id]/[pos]/route.ts", import.meta.url);
const envUrl = new URL("../.env.example", import.meta.url);

test("only server-side image authorities are accepted and rollback fallback is time-bounded", async () => {
  const [route, env] = await Promise.all([
    readFile(routeUrl, "utf8"),
    readFile(envUrl, "utf8"),
  ]);

  assert.doesNotMatch(route, /NEXT_PUBLIC_IMAGE_BASE_URL/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_IMAGE_BASE_URL/);
  assert.match(route, /process\.env\.IMAGE_CDN_BASE_URL/);
  assert.match(route, /process\.env\.IMAGE_CDN_FALLBACK_BASE_URL/);
  assert.match(route, /process\.env\.IMAGE_CDN_FALLBACK_EXPIRES_AT/);
  assert.match(route, /fallbackExpiresAt <= now/);
  assert.match(env, /^IMAGE_CDN_BASE_URL=$/m);
  assert.match(env, /^IMAGE_CDN_FALLBACK_BASE_URL=$/m);
  assert.match(env, /^IMAGE_CDN_FALLBACK_EXPIRES_AT=$/m);
});

test("the bridge matches the installed ten-minute timer and stored images fail closed", async () => {
  const [route, env] = await Promise.all([
    readFile(routeUrl, "utf8"),
    readFile(envUrl, "utf8"),
  ]);

  assert.match(route, /boundedMinutes\(process\.env\.IMAGE_SYNC_INTERVAL_MIN, 10\)/);
  assert.match(env, /^IMAGE_SYNC_INTERVAL_MIN=10$/m);
  assert.match(route, /if \(!base\) return serviceUnavailable\(\);/);
  assert.match(route, /status: 503/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /Response\.redirect\(`\$\{base\}\/\$\{data\.stored_path\}`, 308\)/);
});

test("CDN authorities require clean credential-free HTTPS origins", async () => {
  const route = await readFile(routeUrl, "utf8");

  assert.match(route, /parsed\.protocol !== "https:"/);
  assert.match(route, /parsed\.username/);
  assert.match(route, /parsed\.password/);
  assert.match(route, /parsed\.search/);
  assert.match(route, /parsed\.hash/);
});
