export interface BootInputs {
  stripeSecret: string | undefined;
  stripePublishable: string | undefined;
  killSwitch: boolean | null; // null = could not read the flag → fail closed
}

export function assertBootSafety(i: BootInputs): void {
  if (!i.stripeSecret?.startsWith("sk_test_") || !i.stripePublishable?.startsWith("pk_test_")) {
    throw new Error("Refusing to run: Stripe keys must be TEST keys (sk_test_/pk_test_).");
  }
  if (i.killSwitch !== true) {
    throw new Error("Refusing to run: SYNTHETIC_BOTS_ENABLED must be explicitly enabled (fail-closed).");
  }
}

// ------------------------------------------------------------------
// Runtime helpers (network — not unit-tested here; they need a live DB).
// assertBootSafety above stays pure; these just gather its inputs and call it.
// ------------------------------------------------------------------

/**
 * Minimal shape of the Supabase client this module needs — deliberately not importing
 * `@supabase/supabase-js`'s `SupabaseClient` type so `sim/env.ts` has zero hard dependency
 * on the package being installed (sim/package.json only *declares* it — see Task 7 Step 5).
 * Any real client (service-role, from `createClient()`) satisfies this shape structurally.
 */
export interface MinimalSupabaseClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: { is_enabled: boolean | null } | null; error: unknown }>;
      };
    };
  };
}

/**
 * Reads the SYNTHETIC_BOTS_ENABLED master kill switch from public.feature_flags using the
 * passed service-role Supabase client.
 *
 * Column names confirmed against
 * supabase/migrations/20260723120000_synthetic_weight_safety_spine.sql (Task 0, verified
 * read-only against prod): feature_flags(name, is_enabled, description) — UNIQUE(name).
 *
 * Fail-closed: ANY error, a missing row, or a non-boolean value returns null — never
 * defaults to "on".
 */
export async function readKillSwitch(client: MinimalSupabaseClient): Promise<boolean | null> {
  try {
    const { data, error } = await client
      .from("feature_flags")
      .select("is_enabled")
      .eq("name", "SYNTHETIC_BOTS_ENABLED")
      .maybeSingle();
    if (error || !data || typeof data.is_enabled !== "boolean") return null;
    return data.is_enabled;
  } catch {
    return null;
  }
}

/**
 * The single entry every harness action must call first: gathers live Stripe-key + kill-switch
 * state and delegates to the pure `assertBootSafety` (throws on any unsafe state).
 *
 * Env vars are harness-local (read via `process.env`) — deliberately NOT the app's
 * `VITE_`-prefixed browser vars (those carry the *publishable* prod/staging key, never a
 * server-side secret):
 *   SIM_STRIPE_SECRET_KEY       — Stripe secret key the harness uses (must be sk_test_…)
 *   SIM_STRIPE_PUBLISHABLE_KEY  — Stripe publishable key the harness uses (must be pk_test_…)
 */
export async function assertRuntimeBootSafety(client: MinimalSupabaseClient): Promise<void> {
  const stripeSecret = process.env.SIM_STRIPE_SECRET_KEY;
  const stripePublishable = process.env.SIM_STRIPE_PUBLISHABLE_KEY;
  const killSwitch = await readKillSwitch(client);
  assertBootSafety({ stripeSecret, stripePublishable, killSwitch });
}
