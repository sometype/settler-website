import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let testClient: SupabaseClient | null = null;

/**
 * Install a stand-in client. TEST SEAM ONLY — nothing in `app/` or `lib/` may
 * call this, and it is a no-op path in any real request because no production
 * code ever sets it.
 *
 * It exists because the catalogue pagination contract can only be proven by
 * EXECUTING the queries the feed builds against a fixed inventory
 * (scripts/fake-postgrest.mjs). Asserting on a recorded call list would test
 * the code against itself, which Article III-B does not accept as evidence.
 */
export function __setSupabaseClientForTests(next: SupabaseClient | null): void {
  testClient = next;
}

export function getSupabase(): SupabaseClient {
  if (testClient) return testClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]
      .filter(Boolean)
      .join(" and ");
    throw new Error(`Supabase is not configured. Set ${missing} in .env.local.`);
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}
