/**
 * Test-only module resolution.
 *
 * The app is built by Next, which resolves extensionless relative imports
 * (`./coverSelect`) and the `@/` alias. Node's own ESM loader does neither, so
 * `node --test` could previously only import leaf modules with no relative
 * imports of their own — which is exactly why the feed had unit tests for pure
 * helpers and none for `lib/listings.ts`, where the pagination defect lived.
 *
 * This hook teaches the test runner the same two rules Next already applies. It
 * resolves only; it never transforms, so what the tests execute is the real
 * TypeScript source Node type-strips, not a rewritten copy.
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".json"];
const ROOT = new URL("../", import.meta.url);

function firstExisting(base) {
  for (const ext of EXTENSIONS) {
    const candidate = new URL(base.href + ext);
    if (existsSync(fileURLToPath(candidate))) return candidate.href;
  }
  // Directory import: `./foo` -> `./foo/index.ts`
  for (const ext of EXTENSIONS) {
    const candidate = new URL(`${base.href}/index${ext}`);
    if (existsSync(fileURLToPath(candidate))) return candidate.href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // ⚠️ Dependencies resolve themselves. node_modules is full of CommonJS
    // packages whose internal `require("./Foo")` must go through Node's own
    // algorithm — rewriting those to file URLs breaks the CJS loader outright
    // (observed: @supabase/functions-js). This hook covers first-party source
    // only, which is all Next's aliasing ever applied to.
    const fromDependency = (context.parentURL ?? "").includes("/node_modules/");
    const hasExtension = /\.[cm]?[jt]sx?$|\.json$/i.test(specifier);
    if (!hasExtension && !fromDependency) {
      let base = null;
      if (specifier.startsWith("@/")) {
        base = new URL(specifier.slice(2), ROOT);
      } else if (specifier.startsWith(".") && context.parentURL) {
        base = new URL(specifier, context.parentURL);
      }
      if (base) {
        const resolved = firstExisting(base);
        if (resolved) return nextResolve(resolved, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
