// Shared bearer gate for the report-only / cron ingest endpoints
// (aios-report-ingest, donny-knowledge-sync, content-performance-capture).
//
// These functions run with verify_jwt=false and check the bearer themselves.
// A caller is authorized when its Authorization header EXACTLY equals either:
//   - `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` — the platform-injected key, used by
//     internal function-to-function calls (e.g. donny-chat → aios-report-ingest).
//     Both ends source it from injection, so it rotates in lockstep automatically.
//   - `Bearer ${AIOS_INGEST_SECRET}` — a shared secret the function accepts directly,
//     held by external callers (the 3am cloud agents, the Vault-driven pg_cron job).
//     Set out-of-band to the project's Supabase secret API key (`sb_secret_…`) so the
//     same value also works as the callers' PostgREST `apikey`/Bearer for their reads.
//     Because the function accepts this user-managed value explicitly, a Supabase-
//     initiated rotation of the auto-injected legacy service-role key can no longer
//     silently 401 these routines.
//
// Exact match only — never a prefix/substring test — to preserve the original
// "no substring bypass" property.

export function isAuthorizedIngest(req: Request): boolean {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && auth === `Bearer ${serviceRoleKey}`) return true;

  const ingestSecret = Deno.env.get("AIOS_INGEST_SECRET");
  if (ingestSecret && auth === `Bearer ${ingestSecret}`) return true;

  return false;
}
