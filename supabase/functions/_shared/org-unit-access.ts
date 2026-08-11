// Ownership gate for a caller-supplied `org_unit_id`.
//
// WHY THIS EXISTS. `org_units` RLS is already correct — active members only. But every
// Stripe-facing edge function reads that table with the **service-role key**, which bypasses
// RLS entirely, and then resolves whatever `org_unit_id` arrived in the request. The table's
// own protection therefore never runs.
//
// Proven on prod 2026-08-08 inside a rolled-back transaction, against a unit carrying a live
// Stripe account: an unrelated restaurant user saw **0 rows** under RLS and the service-role
// client saw **1**. The functions handed over precisely what RLS had just refused.
//
// Same defect class as `create-notification` (the caller was authenticated and then never used)
// and `apply_to_campaign` (a SECURITY DEFINER RPC that skipped its own table's policy):
// **whenever RLS is bypassed, its predicate has to be re-asserted in code.**
//
// The predicate here deliberately mirrors the one `boost-payment` already applies to
// `org_members` (active membership, role owner|admin) rather than inventing a second rule —
// two copies of an authorization rule drift, one does not.

// Pin the SAME supabase-js version the callers construct their client with (2.57.2). An
// unpinned `@2` resolves to a newer major-minor whose `SupabaseClient` is a structurally
// incompatible class (`supabaseUrl` is protected), so every call site fails to type-check.
// `_shared/flush-pending-balance.ts` pins for the same reason — follow it, don't diverge.
// `npm:`, not `esm.sh`. #415 moved the whole fleet off `esm.sh` because those specifiers
// boot-fail on redeploy (WORKER_ERROR before the handler ever runs), and this file was
// created after that sweep — so the sweep could not reach it. That is the #416 shape
// exactly: a rename pass cannot touch a file that does not exist yet, and the miss only
// surfaces when the function it is bundled into is next redeployed. Four money functions
// bundle this one.
//
// The version pin stays: this type must resolve to the SAME major/minor the callers
// construct at (`@2.57.2`), or `SupabaseClient` is structurally incompatible
// (`supabaseUrl` is protected) and every call site fails to typecheck. `npm:` + pin is
// what `_shared/flush-pending-balance.ts` does — which this file's own header cited as
// its precedent while not actually matching it. 6 of the 7 `_shared` type-imports of
// supabase-js were already on `npm:`; this was the lone outlier.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

/** Roles permitted to act on an org unit's payout configuration. */
const PAYOUT_ROLES = ["owner", "admin"];

export interface OrgUnitRow {
  id: string;
  org_id: string;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  pending_balance: number | null;
}

export type OrgUnitAccess =
  | { ok: true; unit: OrgUnitRow }
  | { ok: false; reason: "not_found" | "not_a_member" | "insufficient_role" | "lookup_failed" };

/**
 * Resolve a caller-supplied org unit id ONLY if `userId` is an active owner/admin of the org
 * that owns it.
 *
 * `admin` must be the service-role client (these callers need to read Stripe columns that RLS
 * hides). That is exactly why the membership check below is mandatory.
 *
 * Fails CLOSED: a lookup error returns `lookup_failed`, never an allow — an unavailable check
 * is not permission.
 *
 * Callers MUST treat `ok:false` as "this id is not yours" and **must not** fall back to
 * honouring it or to their own profile's account while still acting on the requested unit.
 */
export async function resolveOwnedOrgUnit(
  admin: SupabaseClient,
  orgUnitId: string,
  userId: string,
): Promise<OrgUnitAccess> {
  const { data: unit, error: unitError } = await admin
    .from("org_units")
    .select("id, org_id, stripe_account_id, stripe_onboarding_complete, pending_balance")
    .eq("id", orgUnitId)
    .maybeSingle();

  if (unitError) {
    console.error("[org-unit-access] unit lookup failed:", unitError.message);
    return { ok: false, reason: "lookup_failed" };
  }
  if (!unit) return { ok: false, reason: "not_found" };

  const { data: membership, error: memberError } = await admin
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", unit.org_id)
    .eq("invitation_status", "active")
    .maybeSingle();

  if (memberError) {
    console.error("[org-unit-access] membership lookup failed:", memberError.message);
    return { ok: false, reason: "lookup_failed" };
  }
  if (!membership) return { ok: false, reason: "not_a_member" };
  if (!PAYOUT_ROLES.includes(membership.role)) return { ok: false, reason: "insufficient_role" };

  return { ok: true, unit: unit as OrgUnitRow };
}
