// Supabase client factory for the harness.
//
// TWO clients, deliberately separated:
//   • serviceClient() — service-role, bypasses RLS. Used ONLY for what a real user's
//     browser never does directly: minting, profiles.email_verified, reading the cohort,
//     and teardown (purge_synthetic_data).
//   • botClient(token) — anon key + the bot's OWN JWT in the Authorization header, so
//     PostgREST applies Row-Level Security AS THE BOT. Every marketplace write in the
//     behavior engine (crew create/invite/accept, apply, hire, upload, submit, complete,
//     review, message) goes through this — real RLS, real auth, exactly like a live user.
//
// Env vars are harness-local (SIM_*), never the app's VITE_* browser vars. See sim/env.ts
// for the fail-closed boot safety every entrypoint runs before creating either client.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const NO_SESSION = { persistSession: false, autoRefreshToken: false } as const;

/** Service-role client — bypasses RLS. Mint / email_verified / cohort-read / teardown only. */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv("SIM_SUPABASE_URL"), requireEnv("SIM_SUPABASE_SECRET_KEY"), {
    auth: NO_SESSION,
  });
}

/** Bot-scoped client — anon key + the bot's JWT, so RLS applies as that bot. */
export function botClient(accessToken: string): SupabaseClient {
  if (!accessToken) throw new Error("botClient requires a bot access token");
  return createClient(requireEnv("SIM_SUPABASE_URL"), requireEnv("SIM_SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: NO_SESSION,
  });
}
