# Session — create_counter_offer authorization hardening

**Date:** 2026-07-20
**Branch:** `fix/counter-offer-authz` (6 commits: spec ×2, plan ×2, migration ×2)
**Migration:** `supabase/migrations/20260720000000_counter_offer_authz.sql` (applied to prod)
**Trigger:** Founder asked to fix the open finding filed on [[Service-Role Data Exposure]] during
the prior pricing session.

## What was wrong

`create_counter_offer` — a `SECURITY DEFINER` RPC — had **`anon:EXECUTE`** and **zero
authorization**. No `auth.uid()` check, no participant check, no `p_sender_role` validation.
Being definer, it bypassed RLS. Any caller, including anonymous, could pass any `application_id`,
flip a stranger's application to `counter_offered`, decline its pending offers, and insert an
offer under any `sender_id`/`sender_role`. Escalation: forge an offer *as the counterparty* and
self-accept (the UPDATE policy's only sender test is `sender_id != auth.uid()`). The forged value
feeds `agreed_rate` → `increment_budget_spent` (budget accounting, not Stripe).

Demonstrated live before fixing (**red**): a rollback-wrapped call as a random third-party uid
returned a fully forged offer row.

## What shipped

One `CREATE OR REPLACE` migration, **identical 6-arg signature** so the sole caller
(`src/hooks/useCounterOffers.ts`) and generated `types.ts` are untouched:

1. **Identity** (before the `FOR UPDATE` lock, so anon never locks a row):
   `IF auth.uid() IS DISTINCT FROM p_sender_id THEN RAISE` — mirrors `apply_to_campaign`.
2. **Participant + derive role**: caller = application `creator_id` → `'creator'`; caller =
   campaign `user_id` → `'business'`; else raise. `IF/ELSIF/ELSE`, server-derived.
3. **Role integrity**: raise if `p_sender_role` ≠ derived role. INSERT writes `auth.uid()` +
   the **derived** role — never the client's. This closes the self-accept escalation: the forged
   offer now carries `sender_id = auth.uid()`, so the UPDATE policy blocks self-acceptance.
4. **Grants**: `REVOKE EXECUTE … FROM anon, public` + explicit `GRANT … TO authenticated,
   service_role`.
5. **Sibling RLS**: recreated the `application_counter_offers` INSERT policy with `sender_role`
   pinned via `CASE` (creator→`'creator'`, else→`'business'`).
6. **`RETURNING` pinned** to an explicit 9-column list (matching the `CounterOffer` frontend
   type) instead of `RETURNING *`.

## Verification (red → green, all live on prod)

Rollback-wrapped SQL, faking `auth.uid()` via `set_config('request.jwt.claim.sub', <uid>, true)`;
`SET LOCAL ROLE authenticated` for the RLS path (MCP `execute_sql` runs as `postgres`, which
bypasses RLS — the RPC path is RLS-exempt anyway, but the RLS test needs the role switch):

- forged third-party → **raises** `not a participant` (was: returned a row)
- anon (no claim) → **raises** `sender_id must match`
- identity spoof (`sub` ≠ `p_sender_id`) → **raises** `sender_id must match`
- role forge (creator claims `'business'`) → **raises** `sender_role does not match`
- real creator / real owner (matching role) → **succeed**
- RLS direct-insert with correct role → **succeeds**; with forged role → **rejected by policy**
- grant state: `authenticated`, `service_role` (+ `postgres`) retain EXECUTE; **`anon` gone**
- `get_advisors`: no new finding (the generic `0029` definer-callable-by-authenticated lint is
  inherent to the guarded-definer design, shared by `apply_to_campaign`, and in the deferred set)

## Review loop (both independent reviewers)

- **data-exposure-reviewer**: all 5 assessment points PASS; one **[low]** — `RETURNING *` on a
  definer path would auto-surface a future sensitive column. Fixed by pinning the column list.
- **Codex**: raised a **[P1]** — "`REVOKE … FROM public` strips `authenticated`'s only EXECUTE
  path, breaking the caller." **Verified empirically false**: after the revoke, `authenticated`
  still executes the RPC (confirmed via `routine_privileges` *and* an as-`authenticated`-role
  call) because Supabase's default privileges give it a **direct** grant, not one via `public`.
  Hardened anyway with the explicit `GRANT` (so the migration doesn't depend on default privileges
  on a fresh replay), then Codex re-ran **clean**.

## Durable lessons

- **Verify a reviewer's grant claim against live `routine_privileges` + an as-role call before
  accepting OR dismissing it.** Codex's P1 sounded plausible (revoking `public` *can* strip a
  role that only inherited via `public`) but was false here — the post-revoke grant query already
  showed `authenticated:EXECUTE`, and calling the RPC under `SET LOCAL ROLE authenticated`
  succeeded. Supabase default privileges grant EXECUTE **directly** to `anon`/`authenticated`/
  `service_role`, so `REVOKE FROM anon, public` removes anon's direct grant + any PUBLIC grant and
  leaves authenticated's direct grant intact. Adopt the defensive explicit `GRANT` regardless — it
  makes intent explicit and is replay-safe — but don't report the flaw as real without the check.
- **`RETURNING *` on a `SECURITY DEFINER` (RLS-bypassing) path is a latent leak** — pin the column
  list so a future column can't silently surface to the client.
- **Testing `auth.uid()`-dependent RPCs/RLS without a login:** `BEGIN; SELECT
  set_config('request.jwt.claim.sub', '<uid>', true); … ROLLBACK;` fakes `auth.uid()` for the RPC
  (which reads `request.jwt.claim.sub` then the `request.jwt.claims` JSON). For an **RLS** insert,
  also `SET LOCAL ROLE authenticated` (MCP `execute_sql` runs as `postgres`, which bypasses RLS).
- The guarded-`SECURITY DEFINER`-RPC pattern (broad `authenticated` grant + an internal
  `auth.uid()` identity/participant guard) is the established DragonCandy idiom — `apply_to_campaign`
  is the reference. The generic advisor `0029` flags every such function; it is accepted, not a
  regression.

## Not touched (out of scope, per approved spec)

`apply_to_campaign` has the same `anon:EXECUTE` but is guarded by its own `auth.uid()` check, so
anon calls already fail. Left as-is.
