import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TURNSTILE_HOSTNAME,
  OWNER_UPLOAD_TURNSTILE_ACTION,
  validOwnerUploadTurnstile,
} from "../lib/turnstile.ts";

const honest = {
  success: true,
  hostname: DEFAULT_TURNSTILE_HOSTNAME,
  action: OWNER_UPLOAD_TURNSTILE_ACTION,
};

test("owner upload accepts a token bound to the exact site and action", () => {
  assert.equal(validOwnerUploadTurnstile(honest), true);
});

test("owner upload rejects a token issued for another hostname", () => {
  assert.equal(validOwnerUploadTurnstile({ ...honest, hostname: "attacker.example" }), false);
});

test("owner upload rejects a token issued for another action", () => {
  assert.equal(validOwnerUploadTurnstile({ ...honest, action: "login" }), false);
});

test("owner upload rejects incomplete and unsuccessful responses", () => {
  assert.equal(validOwnerUploadTurnstile({ ...honest, success: false }), false);
  assert.equal(validOwnerUploadTurnstile({ success: true }), false);
});

test("an explicitly configured preview hostname is still exact", () => {
  assert.equal(validOwnerUploadTurnstile({ ...honest, hostname: "preview.example" }, "preview.example"), true);
  assert.equal(validOwnerUploadTurnstile(honest, "preview.example"), false);
});
