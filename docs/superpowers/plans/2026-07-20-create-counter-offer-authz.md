# create_counter_offer Authorization Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add identity + participant + role-integrity authorization to the `create_counter_offer` SECURITY DEFINER RPC (which currently has none and is anon-executable), revoke its anon EXECUTE grant, and pin `sender_role` in the sibling `application_counter_offers` INSERT RLS policy — in one migration.

**Architecture:** A single SQL migration. `CREATE OR REPLACE FUNCTION` with the **identical 6-arg signature** (so the one caller, `src/hooks/useCounterOffers.ts`, and generated `types.ts` are untouched), adding an `auth.uid()` identity check before the row lock, a participant check that derives the caller's role server-side, and a role-integrity check — then writing the *derived* role, never the client's. Plus a `REVOKE … FROM anon, public` and a `DROP POLICY / CREATE POLICY` that adds a `sender_role` constraint. Spec: `docs/superpowers/specs/2026-07-20-create-counter-offer-authz-design.md`.

**Tech Stack:** Supabase Postgres (PL/pgSQL, RLS), applied to prod via the Supabase MCP `apply_migration`. No application-code change. Verification is rollback-wrapped SQL simulation (`set_config('request.jwt.claims', …)` to fake `auth.uid()`), plus `get_advisors`, `data-exposure-reviewer`, and Codex.

**Branch:** `fix/counter-offer-authz` (already checked out off `origin/main`, spec committed).

---

## File Structure

- **Create:** `supabase/migrations/20260720000000_counter_offer_authz.sql` — the entire change (function replace + grant revoke + policy replace). One file; it sorts after the latest existing migration `20260719120002`.
- **No app-code changes.** The RPC signature is unchanged, so `src/integrations/supabase/types.ts` needs no regeneration and `src/hooks/useCounterOffers.ts` is untouched.
- **Knowledge (Task 8):** flip the open finding on `docs/wiki/concepts/service-role-data-exposure.md` from "Open finding" → resolved, plus the standard knowledge-sync artifacts.

---

## Task 1: Write the migration file

**Files:**
- Create: `supabase/migrations/20260720000000_counter_offer_authz.sql`

- [ ] **Step 1: Write the complete migration**

```sql
-- Harden create_counter_offer: identity + participant + role-integrity authorization.
-- It was SECURITY DEFINER with anon:EXECUTE and ZERO authz — any caller (incl. anon) could
-- flip a stranger's application to counter_offered, decline its pending offers, and insert an
-- offer under any sender_id/sender_role, bypassing RLS. Escalation: forge an offer AS the
-- counterparty, then self-accept. See docs/wiki/concepts/service-role-data-exposure.md.
-- CREATE OR REPLACE with the IDENTICAL 6-arg signature: the sole caller
-- (src/hooks/useCounterOffers.ts) and generated types.ts are untouched.

CREATE OR REPLACE FUNCTION public.create_counter_offer(
  p_application_id uuid,
  p_sender_id uuid,
  p_sender_role text,
  p_proposed_rate numeric DEFAULT NULL,
  p_proposed_timeline text DEFAULT NULL,
  p_message text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app   record;
  v_offer record;
  v_owner uuid;
  v_role  text;
BEGIN
  -- 1. Identity — BEFORE the row lock, so anon/unauthorized never take a lock.
  --    Mirrors apply_to_campaign (20260521000002:21). auth.uid() is NULL for anon,
  --    so NULL IS DISTINCT FROM <any uuid> = TRUE → rejected.
  IF auth.uid() IS DISTINCT FROM p_sender_id THEN
    RAISE EXCEPTION 'Unauthorized: sender_id must match authenticated user';
  END IF;

  -- Lock the application row to serialize concurrent counter-offers.
  SELECT * INTO v_app
    FROM campaign_applications
    WHERE id = p_application_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- 2. Participant + derive role (server truth — never trust p_sender_role).
  SELECT user_id INTO v_owner FROM campaigns WHERE id = v_app.campaign_id;

  IF    auth.uid() = v_app.creator_id THEN v_role := 'creator';   -- first-branch precedence:
  ELSIF auth.uid() = v_owner          THEN v_role := 'business';  -- self-application → 'creator' (benign)
  ELSE  RAISE EXCEPTION 'Unauthorized: not a participant on this application';
  END IF;

  -- 3. Role integrity — reject a forged/mismatched client role.
  IF p_sender_role IS DISTINCT FROM v_role THEN
    RAISE EXCEPTION 'Unauthorized: sender_role does not match your role on this application';
  END IF;

  -- Update application status.
  UPDATE campaign_applications
    SET status = 'counter_offered', updated_at = now()
    WHERE id = p_application_id;

  -- Decline ALL pending counter-offers on this application.
  UPDATE application_counter_offers
    SET status = 'declined', updated_at = now()
    WHERE application_id = p_application_id
      AND status = 'pending';

  -- Insert the new counter-offer — sender_id + role are SERVER-DERIVED, not client-supplied.
  INSERT INTO application_counter_offers (
    application_id, sender_id, sender_role,
    proposed_rate, proposed_timeline, message, status
  )
  VALUES (
    p_application_id, auth.uid(), v_role,
    p_proposed_rate, p_proposed_timeline, p_message, 'pending'
  )
  RETURNING * INTO v_offer;

  RETURN row_to_json(v_offer);
END;
$$;

-- Grant tightening: remove anon (and public) EXECUTE; keep authenticated + service_role.
-- Defense-in-depth over the auth.uid() guard. Per project_supabase_definer_revoke_anon,
-- revoking only `public` does NOT lock a definer fn — revoke `anon` explicitly too.
REVOKE EXECUTE ON FUNCTION public.create_counter_offer(uuid, uuid, text, numeric, text, text)
  FROM anon, public;

-- Sibling RLS: the INSERT policy constrained sender_id but NOT sender_role, so a hand-crafted
-- REST insert on the direct-insert apply-time path (useCreateApplication.ts:107) could label a
-- creator's row 'business' (display-only, but same forged-role class). Recreate with the role
-- pinned. DROP POLICY / CREATE POLICY on a POLICY is the standard reversible amend (not a
-- table/column drop). Name matches the live policy exactly.
DROP POLICY IF EXISTS "Users can create counter-offers for their applications"
  ON public.application_counter_offers;

CREATE POLICY "Users can create counter-offers for their applications"
ON public.application_counter_offers FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM campaign_applications ca
    WHERE ca.id = application_counter_offers.application_id
    AND (
      ca.creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM campaigns c
        WHERE c.id = ca.campaign_id AND c.user_id = auth.uid()
      )
    )
  )
  AND sender_role = CASE
    WHEN EXISTS (
      SELECT 1 FROM campaign_applications ca
      WHERE ca.id = application_counter_offers.application_id
        AND ca.creator_id = auth.uid()
    ) THEN 'creator' ELSE 'business' END
);
```

- [ ] **Step 2: Sanity-check the file locally**

Run: `npm run build`
Expected: PASS (no app code changed; this just confirms nothing else broke). Note: SQL is not compiled by the build — the real validation is Task 3+ against the DB.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260720000000_counter_offer_authz.sql
git commit -m "fix(security): authorize create_counter_offer + pin sender_role RLS"
```

---

## Task 2: Capture the live hole (the "red" — prove the vuln exists pre-fix)

**Files:** none (read-only + rollback-wrapped SQL against prod via MCP `execute_sql`).

- [ ] **Step 1: Grab real fixtures**

Run (MCP `execute_sql`, project `zocahiffooqdybdhguqv`):
```sql
SELECT ca.id AS application_id, ca.creator_id, c.user_id AS owner_id, ca.campaign_id
FROM campaign_applications ca
JOIN campaigns c ON c.id = ca.campaign_id
WHERE c.group_id IS NULL
ORDER BY ca.created_at DESC
LIMIT 1;
```
Record `application_id`, `creator_id`, `owner_id`. Pick any unrelated uuid as `THIRD_PARTY` (e.g. `gen_random_uuid()`).

- [ ] **Step 2: Confirm how `auth.uid()` reads its claim**

Run: `SELECT pg_get_functiondef('auth.uid'::regproc);`
Expected: it reads `request.jwt.claims` (JSON `->> 'sub'`) and/or `request.jwt.claim.sub`. Use whichever it references in Step 3's `set_config`. (Set the JSON `request.jwt.claims` form below; if the definition uses `request.jwt.claim.sub`, set that GUC instead.)

- [ ] **Step 3: Demonstrate the current function accepts a FORGED call (rolled back)**

Run:
```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','<THIRD_PARTY>','role','authenticated')::text, true);
-- Third party, not a participant, forging a 'business' offer on someone else's application:
SELECT create_counter_offer('<application_id>', '<THIRD_PARTY>', 'business', 999, NULL, 'forged');
ROLLBACK;
```
Expected (PRE-FIX): **returns a JSON offer row** (the hole — no authz). This is the failing "test." Record that it succeeded.

---

## Task 3: Apply the migration to prod (`careful` gate)

**Files:** applies `supabase/migrations/20260720000000_counter_offer_authz.sql` to prod.

- [ ] **Step 1: Run the `careful` skill**

Invoke `careful` for a prod DDL apply: state the blast radius (one SECURITY DEFINER function replaced + one policy replaced + a grant revoke; single caller unaffected; reversible via CREATE OR REPLACE back). Confirm it is **not** a DROP/RENAME of a table or column (it is not). Get explicit go.

- [ ] **Step 2: Apply via MCP `apply_migration`**

Use `mcp__plugin_supabase__apply_migration` (project `zocahiffooqdybdhguqv`, name `counter_offer_authz`, the Task 1 SQL as the query). This applies the DDL to prod.
Expected: success, no error.

**Known wrinkle (this repo's apply-then-commit flow):** applying via MCP *and* committing the
`20260720000000_*.sql` file means a replay (staging/CI/`db push`) re-runs the committed file — a
second history application. This is harmless here because every statement is replay-safe
(`CREATE OR REPLACE`, `DROP POLICY IF EXISTS` → `CREATE POLICY`, `REVOKE`). Don't be surprised by a
duplicate history entry; do not "fix" it by dropping the committed file (it is the source of truth
for fresh environments).

---

## Task 4: Verify the RPC is closed (the "green")

**Files:** none (rollback-wrapped SQL via MCP `execute_sql`). Use the Task 2 fixtures.

- [ ] **Step 1: Re-run the forged third-party call — must now RAISE**

Run the exact Task 2 Step 3 block again.
Expected (POST-FIX): **ERROR `Unauthorized: not a participant on this application`** (identity passes because `sub` = p_sender_id, but the third party is neither creator nor owner).

- [ ] **Step 2: Anon call — must RAISE**

Run:
```sql
BEGIN;
-- no set_config → auth.uid() is NULL
SELECT create_counter_offer('<application_id>', '<creator_id>', 'creator', 100, NULL, 'x');
ROLLBACK;
```
Expected: **ERROR `Unauthorized: sender_id must match authenticated user`** (NULL ≠ p_sender_id).

- [ ] **Step 3: Identity spoof (sub ≠ p_sender_id) — must RAISE**

Run with `request.jwt.claims` sub = `<creator_id>` but pass `p_sender_id = <THIRD_PARTY>`.
Expected: **ERROR `Unauthorized: sender_id must match authenticated user`**.

- [ ] **Step 4: Role forge (real creator claims 'business') — must RAISE**

Run with sub = `<creator_id>`, `p_sender_id = <creator_id>`, `p_sender_role = 'business'`.
Expected: **ERROR `Unauthorized: sender_role does not match your role on this application`**.

- [ ] **Step 5: Positive — real creator succeeds (rolled back)**

Run with sub = `<creator_id>`, `p_sender_id = <creator_id>`, `p_sender_role = 'creator'`.
Expected: **returns a JSON offer row** with `sender_id = <creator_id>`, `sender_role = 'creator'`. `ROLLBACK`.

- [ ] **Step 6: Positive — real owner succeeds (rolled back)**

Run with sub = `<owner_id>`, `p_sender_id = <owner_id>`, `p_sender_role = 'business'`.
Expected: **returns a JSON offer row** with `sender_role = 'business'`. `ROLLBACK`.

- [ ] **Step 7: Live app-path smoke (spec Verification item 5) — both directions**

The SQL positives above prove the RPC accepts legitimate creator + owner calls; this step
confirms the real UI hook (`useCounterOffers` → `create_counter_offer`) still works end-to-end
after the role-integrity tightening. On prod, in a real `counter_offered` application:
- **Creator direction:** as the creator, send a counter-offer from `AppliedPhaseView` /
  `DetailedApplicationCard` (both hardcode `senderRole:'creator'`).
- **Business direction:** as the business, send a counter from `ApplicationCard` (hardcodes
  `senderRole:'business'`).
Expected: both succeed (offer row created, other party notified), no console error.
**Note:** this is an auth-gated live check — it needs a logged-in creator *and* business and a
suitable application, so it may require the user to drive login (same class as the mobile-viewport
gap). If a real `counter_offered` fixture isn't readily available, the Task 4 SQL positives +
the verified per-surface role hardcoding stand as the primary proof; record honestly which was done.

---

## Task 5: Verify the §3 RLS policy — both sides

**Files:** none (rollback-wrapped SQL via MCP `execute_sql`). This exercises the direct-insert path (RLS-checked), so run as `authenticated` — set the role in `request.jwt.claims` and `SET LOCAL ROLE authenticated` so RLS applies (the RPC path bypasses RLS; this does not).

- [ ] **Step 1: Positive — creator inserts with 'creator' succeeds**

Run:
```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','<creator_id>','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
INSERT INTO application_counter_offers (application_id, sender_id, sender_role, proposed_rate, message, status)
VALUES ('<application_id>', '<creator_id>', 'creator', 100, 'ok', 'pending');
ROLLBACK;
```
Expected: **INSERT succeeds** (1 row).

**If this positive UNEXPECTEDLY fails,** suspect the harness, not the new policy: MCP `execute_sql`
runs as `postgres`, and this step relies on `postgres` being able to `SET ROLE authenticated`,
`authenticated` holding table INSERT, and the `WITH CHECK` subquery seeing the `campaign_applications`
row through *that* table's RLS. All hold in stock Supabase; a failure here is a harness/role issue,
not a policy bug — confirm before concluding the policy is wrong.

- [ ] **Step 2: Negative — creator inserts with forged 'business' is rejected**

Same block, but `sender_role = 'business'`.
Expected: **ERROR — new row violates row-level security policy** (the pinned `sender_role` CASE fails).

---

## Task 6: Advisors + grant confirmation

- [ ] **Step 1: Security advisors**

Run MCP `get_advisors` (type `security`).
Expected: no NEW findings attributable to this change. (Pre-existing advisors are the deferred set — do not act on them here.)

- [ ] **Step 2: Confirm the grant change landed**

Run:
```sql
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'create_counter_offer';
```
Expected: `authenticated` + `service_role` (+ `postgres`) retain EXECUTE; **`anon` is gone**.

---

## Task 7: Independent review

- [ ] **Step 1: data-exposure-reviewer**

Dispatch the `data-exposure-reviewer` subagent on `supabase/migrations/20260720000000_counter_offer_authz.sql`. Ask specifically: does the identity+participant+role trio fully close the RPC hole, is the §3 RLS `sender_role` pin correct, and is anything still reachable cross-actor? Resolve any ISSUE before proceeding.

- [ ] **Step 2: Codex second pass**

Run: `codex review --base main --title "Authorize create_counter_offer + pin sender_role RLS"`
Fix anything real; re-run until clean. Relay the verdict.

---

## Task 8: Knowledge-sync + finish the branch

- [ ] **Step 1: Flip the open finding to resolved**

In `docs/wiki/concepts/service-role-data-exposure.md`, change the "Open finding — `create_counter_offer` has no authorization" section to a dated **resolved** record (what shipped: the three guards + anon revoke + the RLS pin), per the edit-in-place-on-supersession rule.

- [ ] **Step 2: Run the `knowledge-sync` skill**

Write the raw session source, `/wiki-ops ingest`, prepend to `docs/SHIPPED_LOG.md`, add the one-line `PROJECT_CONTEXT.md` §5 Shipped entry, update `index.md` + `log.md`. `DATABASE_SCHEMA.md` gets a one-line note on the `create_counter_offer` authorization + the pinned INSERT policy (a real RLS/authz change). Bundle the loop-memory Run Log entry.

- [ ] **Step 3: Finish the branch**

Use `superpowers:finishing-a-development-branch`: push `fix/counter-offer-authz`, open the PR (spec + migration + knowledge in one), confirm CI green, merge, refresh local main (the post-merge hook syncs the RAG since `docs/` changed), then `verify-knowledge` to close the loop.

---

## Notes / Guardrails

- **Never a DROP/RENAME of a table or column** — this is `CREATE OR REPLACE FUNCTION` + `DROP/CREATE POLICY` only (both reversible, definition-only). No data migration.
- **Do not change the RPC signature** — it would force a `types.ts` regen and touch the caller. The whole design depends on the 6-arg signature staying identical.
- **`apply_to_campaign`'s anon grant is intentionally left alone** (guarded by its own `auth.uid()` check; out of scope per the approved spec).
- **Rollback:** `CREATE OR REPLACE` the prior function body, `GRANT EXECUTE … TO anon`, and re-create the prior policy `WITH CHECK`. Definition-only; no data to unwind.
