import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(
  path.join(process.cwd(), "lib/english-agent-contact-core.ts")
).href;
const { buildEnglishAgentContact } = await import(moduleUrl);

test("approved Mepatrone agent contact is exact and listing-attributed", () => {
  const contact = buildEnglishAgentContact("+995555121150", 12411);
  assert.ok(contact);
  assert.equal(contact.phoneE164, "+995555121150");
  assert.equal(contact.displayPhone, "+995 555 12 11 50");
  assert.equal(contact.callHref, "tel:+995555121150");

  const whatsapp = new URL(contact.whatsappHref);
  assert.equal(whatsapp.hostname, "wa.me");
  assert.equal(whatsapp.pathname, "/995555121150");
  assert.match(whatsapp.searchParams.get("text") ?? "", /listing 12411/);
  assert.match(
    whatsapp.searchParams.get("text") ?? "",
    /https:\/\/mepatrone\.com\/en\/listing\/12411/
  );
});

test("contact authority fails closed without fallback", () => {
  for (const authority of [
    undefined,
    null,
    "",
    "995555121150",
    "+995 555 12 11 50",
    "+995555121151",
  ]) {
    assert.equal(buildEnglishAgentContact(authority, 12411), null);
  }
  assert.equal(buildEnglishAgentContact("+995555121150", 0), null);
});
