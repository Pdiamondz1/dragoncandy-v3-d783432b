# create_counter_offer authorization hardening — design

**Date:** 2026-07-20
**Status:** Approved design → implementation
**Type:** Security fix (SECURITY DEFINER RPC + one RLS policy)

## Context

`create_counter_offer` (`supabase/migrations/20260521000003_atomic_counter_offer.sql`) is a
`SECURITY DEFINER` function that performs **no authorization of any kind**. Live grants on prod
include **`anon:EXECUTE`** — so it is callable by anonymous users, not just authenticated. Being
definer, it bypasses RLS on `campaign_applications` and `application_counter_offers`.

With any `application_id`, a caller can:
- flip a stranger's application to `status='counter_offered'`;
- mass-decline that application's pending counter-offers;
- insert an offer attributed to an arbitrary `sender_id` / `sender_role`.

Escalation: a legitimate participant forges an offer **as the counterparty** (the UPDATE policy's
only sender test is `sender_id != auth.uid()`) and accepts it themselves. Scoped honestly: the
forged value lands in `campaign_applications.agreed_rate`, consumed by `verify-campaign-escrow`
→ `increment_budget_spent` (budget accounting) — it does **not** by itself move Stripe funds.

Surfaced by `data-exposure-reviewer` during the 2026-07-19 pricing work; filed on
`docs/wiki/concepts/service-role-data-exposure.md` as an open finding, deliberately not fixed
then. This spec fixes it.

## Constraints established by investigation

- **Single caller.** `src/hooks/useCounterOffers.ts:62` is the only caller
  (`src/integrations/supabase/types.ts` is generated types, not a call site). It calls
  `supabase.auth.getUser()`, throws if unauthenticated, and passes `p_sender_id: user.id` — the
  caller's own id — plus the caller's real role. **So an `auth.uid()` identity guard cannot break
  it.**
- **Guard idiom to mirror.** `apply_to_campaign` (`20260521000002:20-23`) already enforces
  `IF auth.uid() IS DISTINCT FROM p_creator_id THEN RAISE EXCEPTION`. Same shape here.
- **Participant test to mirror.** The `application_counter_offers` RLS INSERT/SELECT policies
  (`20260216133652:38-54`) already express "caller is the application's creator OR the campaign
  owner." The RPC will derive the caller's role from the same test.
- **Migration safety.** `CREATE OR REPLACE FUNCTION` with the **identical 6-arg signature** — no
  DROP, no RENAME, no signature change — so `types.ts` stays valid and the caller is untouched.

## The fix

### 1. `create_counter_offer` — add authorization (server-derived, not client-trusted)

Inside the function, immediately after the existing `SELECT * INTO v_app … FOR UPDATE`:

1. **Identity.** `IF auth.uid() IS DISTINCT FROM p_sender_id THEN RAISE EXCEPTION
   'Unauthorized: sender_id must match authenticated user';`. Rejects anon (auth.uid() is null).
2. **Participant + derive role.** Read `v_app.creator_id` and
   `SELECT user_id INTO v_owner FROM campaigns WHERE id = v_app.campaign_id`. Then:
   - `auth.uid() = v_app.creator_id` → `v_role := 'creator'`
   - `auth.uid() = v_owner` → `v_role := 'business'`
   - else → `RAISE EXCEPTION 'Unauthorized: not a participant on this application'`
3. **Role integrity.** `IF p_sender_role IS DISTINCT FROM v_role THEN RAISE EXCEPTION
   'Unauthorized: sender_role does not match your role on this application';`. The INSERT then
   writes **`v_role`** (the derived value), never `p_sender_role`.

Everything else (the `FOR UPDATE` lock, the decline-all-pending UPDATE, the insert, the
`row_to_json` return) is preserved byte-for-byte.

### 2. Grant tightening

```sql
REVOKE EXECUTE ON FUNCTION public.create_counter_offer(uuid, uuid, text, numeric, text, text)
  FROM anon, public;
```
Keep `authenticated` + `service_role` (the caller is authenticated). Defense-in-depth over the
`auth.uid()` guard; removes the function from the anon attack surface entirely. Per
`project_supabase_definer_revoke_anon`: revoke from `anon` AND `public` (revoking only `public`
does not lock a definer function), and re-run advisors after.

### 3. Sibling RLS `sender_role` gap (approved for inclusion)

The `application_counter_offers` INSERT policy constrains `sender_id` but not `sender_role`, so a
hand-crafted REST insert on the **direct-insert** apply-time path (`useCreateApplication.ts:107`)
could label a creator's row `'business'`. Display-integrity only (the accept gate keys off
`sender_id`), but same forged-role class. Recreate the INSERT policy with the role pinned:

```sql
DROP POLICY "Users can create counter-offers for their applications" ON public.application_counter_offers;
CREATE POLICY "Users can create counter-offers for their applications"
ON public.application_counter_offers FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS ( … existing participant check … )
  AND sender_role = CASE
        WHEN EXISTS (SELECT 1 FROM campaign_applications ca
                     WHERE ca.id = application_id AND ca.creator_id = auth.uid())
        THEN 'creator' ELSE 'business' END
);
```
(`DROP POLICY … ; CREATE POLICY …` on a **policy** is the normal way to amend a `WITH CHECK`; it
is not a table/column DROP and is fully reversible.) The one legitimate direct-insert caller
hardcodes `sender_role: 'creator'` and inserts on its own application, so it satisfies the pinned
role.

## Out of scope (noted, not touched)

- **`apply_to_campaign` anon grant.** Same `anon:EXECUTE`, but it is guarded by its own
  `auth.uid()` check, so anon calls already fail. Left as-is per decision; revoke separately if
  desired.
- The counter-offer feature behavior, the pricing work, and every other RPC.

## Verification

1. **Rollback-wrapped SQL simulation on prod** (no persisted writes):
   `BEGIN; SELECT set_config('request.jwt.claim.sub', '<uid>', true); SELECT create_counter_offer(…); ROLLBACK;`
   - **Positive:** the application's real creator and the real campaign owner each succeed with a
     matching `p_sender_role`.
   - **Negative (each must RAISE):** a third-party uid; anon (`sub` unset); `p_sender_id` ≠
     `auth.uid()`; `p_sender_role` mismatching the derived role.
2. **`get_advisors`** (security) after the migration — no new findings; confirm the grant change.
3. **`data-exposure-reviewer`** on the migration, then **Codex** `--base main`.
4. **App-path smoke:** the live post-apply counter flow (`useCounterOffers`) still sends an offer
   for a legitimate participant (both creator and business directions).

## Rollback

`CREATE OR REPLACE` back to the prior body and re-`GRANT EXECUTE … TO anon` if a regression
appears; the policy is restored by re-creating the prior `WITH CHECK`. No data migration, so
rollback is definition-only.
