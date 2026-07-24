# Durable Pending-Balance Flush Ledger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared wallet→Stripe flush (`transferPendingBalance`) exactly-once — fix the identical-cents idempotency-key under-pay without re-introducing ambiguous-failure over-pay — by backing every flush with a durable `pending_balance_flushes` record keyed on a per-flush uuid, plus a reconciliation cron.

**Architecture:** A new `pending_balance_flushes` table records each flush (`claimed`→`succeeded`/`failed`/`stuck`). Four service-role SECURITY DEFINER RPCs (claim/confirm/fail/bump) mutate it atomically. `_shared/flush-pending-balance.ts` is refactored so a single `buildFlushTransferParams(row)` + `executeFlushTransfer(row)` pair is used by BOTH the inline send and a new `reconcile-pending-flushes` cron — so a replay is byte-identical to the original (real Stripe idempotent replay, not a 400 conflict). Money is never lost (tracked as `claimed`/`stuck`) and never double-sent (stable key + identical params).

**Tech Stack:** Supabase Postgres (plpgsql SECURITY DEFINER RPCs, RLS), Deno edge functions (Stripe SDK 18.5.0, supabase-js 2.57.2), pg_cron + `net.http_post` fleet pattern, Deno test.

**Spec:** `docs/superpowers/specs/2026-07-23-durable-flush-ledger-design.md` — read it first.

**Standing rules for every task:** Follow the `careful` skill before any prod write (migration apply, edge-fn deploy). Verify DB objects live via `pg_proc`/`information_schema`, NOT `schema_migrations`. Rollback-wrapped prod SQL tests use `set_config('request.jwt.claims','{"role":"service_role"}',true)` in a `DO` block that `RAISE`s at the end to force rollback. Prod ref: `zocahiffooqdybdhguqv`.

---

## File Structure

- **Create** `supabase/migrations/<TS>_pending_balance_flushes.sql` — table + RLS + partial index + 4 RPCs. (`<TS>` = next free `20260723NNNNNN`; see Task 1 Step 1 — verify no collision with concurrent worktrees.)
- **Modify** `supabase/functions/_shared/flush-pending-balance.ts` — add `buildFlushTransferParams`, `executeFlushTransfer`, `isDefiniteFailure`, `RECONCILE_CAP`; refactor `transferPendingBalance` to claim→execute; keep `flushPendingBalance` contract.
- **Modify** `supabase/functions/_shared/flush-pending-balance.test.ts` — new Deno tests for the above.
- **Create** `supabase/functions/reconcile-pending-flushes/index.ts` — the cron worker.
- **Create** `supabase/migrations/<TS+1>_reconcile_pending_flushes_cron.sql` — schedules the cron (applied AFTER the function is deployed AND the Vault URL secret exists).
- **Modify** `supabase/config.toml` — add a `[functions.reconcile-pending-flushes]` / `verify_jwt = false` stanza (the default is `true`; without it a later plain redeploy silently flips the auth model).
- **Redeploy (no code change, they bundle the shared file):** `withdraw-pending-balance`, `stripe-webhook`, `check-creator-payout-status`, `check-restaurant-payout-status`.
- **Knowledge:** compound onto `docs/wiki/concepts/payout-finalization-consistency.md` + the usual core docs.

---

## Task 1: Migration — `pending_balance_flushes` table + 4 RPCs

**Files:**
- Create: `supabase/migrations/<TS>_pending_balance_flushes.sql`

- [ ] **Step 1: Pick a collision-free migration timestamp.** Run `git ls-files 'supabase/migrations/202607*' | sort | tail -5` and pick the next free `20260723NNNNNN` after the highest (expected `20260723180000`). Per the concurrent-worktree memory, confirm no other unmerged branch uses it (`git log --oneline --all -- supabase/migrations/ | head`). Use that as `<TS>`.

- [ ] **Step 2: Write the migration file.** Full contents:

```sql
-- Durable per-flush record: makes transferPendingBalance exactly-once. Each row is a wallet→Stripe
-- transfer keyed on `flush_${id}` (collision-free), with enough stored to rebuild the transfer
-- byte-identically for a reconciliation replay. See docs/wiki/concepts/payout-finalization-consistency.md.
CREATE TABLE IF NOT EXISTS public.pending_balance_flushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_type text NOT NULL CHECK (profile_type IN ('creator','business')),
  stripe_account_id text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  source text NOT NULL CHECK (source IN ('manual','autoflush')),
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','succeeded','failed','stuck')),
  stripe_transfer_id text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reconciliation scans only 'claimed' rows → partial index keeps it cheap and never re-scans terminals.
CREATE INDEX IF NOT EXISTS idx_pbf_claimed_created
  ON public.pending_balance_flushes (created_at) WHERE status = 'claimed';

ALTER TABLE public.pending_balance_flushes ENABLE ROW LEVEL SECURITY;

-- No client access. Internal-team read; service-role full (writes only via the RPCs below).
DROP POLICY IF EXISTS pbf_internal_select ON public.pending_balance_flushes;
CREATE POLICY pbf_internal_select ON public.pending_balance_flushes
  FOR SELECT USING (public.is_internal_user());
DROP POLICY IF EXISTS pbf_service_all ON public.pending_balance_flushes;
CREATE POLICY pbf_service_all ON public.pending_balance_flushes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── claim: atomically zero the balance (if unchanged) AND insert a 'claimed' row; return its id ──
CREATE OR REPLACE FUNCTION public.claim_pending_balance_flush(
  p_user_id uuid, p_profile_type text, p_stripe_account_id text, p_amount_cents integer, p_source text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_balance numeric; v_flush_id uuid; caller_role text;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role','');
  IF caller_role <> 'service_role' THEN RAISE EXCEPTION 'claim_pending_balance_flush is server-only'; END IF;

  IF p_profile_type = 'creator' THEN
    SELECT pending_balance INTO v_balance FROM creator_profiles WHERE user_id = p_user_id FOR UPDATE;
  ELSE
    SELECT pending_balance INTO v_balance FROM business_profiles WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Balance changed / not found / non-positive / cents mismatch → caller treats NULL as BALANCE_CHANGED.
  IF v_balance IS NULL OR p_amount_cents <= 0 OR round(v_balance * 100) <> p_amount_cents THEN
    RETURN NULL;
  END IF;

  IF p_profile_type = 'creator' THEN
    UPDATE creator_profiles SET pending_balance = 0 WHERE user_id = p_user_id;
  ELSE
    UPDATE business_profiles SET pending_balance = 0 WHERE user_id = p_user_id;
  END IF;

  INSERT INTO pending_balance_flushes (user_id, profile_type, stripe_account_id, amount_cents, source, status)
  VALUES (p_user_id, p_profile_type, p_stripe_account_id, p_amount_cents, p_source, 'claimed')
  RETURNING id INTO v_flush_id;

  RETURN v_flush_id;
END; $$;

-- ── confirm: mark a claimed row succeeded (money left) ──
CREATE OR REPLACE FUNCTION public.confirm_pending_balance_flush(p_flush_id uuid, p_transfer_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller_role text;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role','');
  IF caller_role <> 'service_role' THEN RAISE EXCEPTION 'confirm_pending_balance_flush is server-only'; END IF;
  UPDATE pending_balance_flushes
    SET status='succeeded', stripe_transfer_id=p_transfer_id, updated_at=now()
    WHERE id=p_flush_id AND status='claimed';
END; $$;

-- ── fail: mark a claimed row failed; optionally restore the balance (definite failures only) ──
CREATE OR REPLACE FUNCTION public.fail_pending_balance_flush(p_flush_id uuid, p_restore boolean, p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller_role text; v_user uuid; v_type text; v_cents integer; v_status text;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role','');
  IF caller_role <> 'service_role' THEN RAISE EXCEPTION 'fail_pending_balance_flush is server-only'; END IF;

  SELECT user_id, profile_type, amount_cents, status INTO v_user, v_type, v_cents, v_status
    FROM pending_balance_flushes WHERE id = p_flush_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'flush % not found', p_flush_id; END IF;
  IF v_status <> 'claimed' THEN RETURN; END IF;  -- idempotent: only act on a claimed row

  IF p_restore THEN
    IF v_type = 'creator' THEN
      UPDATE creator_profiles SET pending_balance = COALESCE(pending_balance,0) + (v_cents::numeric / 100) WHERE user_id = v_user;
    ELSE
      UPDATE business_profiles SET pending_balance = COALESCE(pending_balance,0) + (v_cents::numeric / 100) WHERE user_id = v_user;
    END IF;
  END IF;

  UPDATE pending_balance_flushes SET status='failed', last_error=p_error, updated_at=now() WHERE id=p_flush_id;
END; $$;

-- ── bump: increment attempt; flip to terminal 'stuck' at the cap (returns the resulting status) ──
CREATE OR REPLACE FUNCTION public.bump_flush_attempt(p_flush_id uuid, p_error text, p_cap integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller_role text; v_status text;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role','');
  IF caller_role <> 'service_role' THEN RAISE EXCEPTION 'bump_flush_attempt is server-only'; END IF;
  UPDATE pending_balance_flushes
    SET attempts = attempts + 1, last_error = p_error, updated_at = now(),
        status = CASE WHEN attempts + 1 >= p_cap AND status = 'claimed' THEN 'stuck' ELSE status END
    WHERE id = p_flush_id AND status = 'claimed'
    RETURNING status INTO v_status;
  RETURN v_status;  -- 'claimed' | 'stuck' | NULL (row wasn't claimed)
END; $$;

REVOKE EXECUTE ON FUNCTION public.claim_pending_balance_flush(uuid,text,text,integer,text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_pending_balance_flush(uuid,text,text,integer,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_pending_balance_flush(uuid,text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_pending_balance_flush(uuid,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fail_pending_balance_flush(uuid,boolean,text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fail_pending_balance_flush(uuid,boolean,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bump_flush_attempt(uuid,text,integer) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bump_flush_attempt(uuid,text,integer) TO service_role;
```

- [ ] **Step 3: Data-exposure review of the migration (before applying).** Dispatch the `data-exposure-reviewer` on the migration file (new table RLS + 4 SECURITY DEFINER RPCs). Resolve any ISSUES. Confirm the REVOKE/GRANT pattern locks each RPC to service_role and the RLS gives no client write path.

- [ ] **Step 4: Apply to prod** (careful gate). Via Supabase MCP `apply_migration` (name `pending_balance_flushes`, the SQL above).

- [ ] **Step 5: Verify live** (not `schema_migrations`). Run via `execute_sql`:
```sql
SELECT proname, prosecdef, proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname IN ('claim_pending_balance_flush','confirm_pending_balance_flush','fail_pending_balance_flush','bump_flush_attempt');
SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='pending_balance_flushes';
```
Expected: 4 rows, all `prosecdef=t`, `proacl` shows `{postgres=X/postgres,service_role=X/postgres}` (no anon/authenticated); table count = 1.

- [ ] **Step 6: Rollback-wrapped RPC behavior test** on prod. Run each in a `DO` block that `RAISE`s `TEST_OK …` at the end (forces rollback — nothing persists). Verify:
  - `claim_pending_balance_flush` on a creator with a known `pending_balance`: returns a uuid, zeroes the balance, inserts one `claimed` row with the right `amount_cents`/`stripe_account_id`/`source`; a second call with a mismatched `p_amount_cents` returns NULL.
  - `fail_pending_balance_flush(id, true, 'x')` restores **exactly** `amount_cents/100` dollars (test a non-round amount like 1050 cents → +10.50, proving the `::numeric` cast).
  - `confirm_pending_balance_flush(id, 'tr_x')` sets `succeeded` + `stripe_transfer_id`.
  - `bump_flush_attempt(id,'x',2)` twice → second returns `'stuck'`.
  - Non-service-role caller (omit the `set_config`) → each RPC `RAISE`s `… is server-only`.

- [ ] **Step 7: Commit** the migration file.
```bash
git add supabase/migrations/<TS>_pending_balance_flushes.sql
git commit -m "feat(payout): pending_balance_flushes ledger + claim/confirm/fail/bump RPCs (applied to prod)"
```

---

## Task 2: Refactor `_shared/flush-pending-balance.ts` (TDD)

**Files:**
- Modify: `supabase/functions/_shared/flush-pending-balance.ts`
- Test: `supabase/functions/_shared/flush-pending-balance.test.ts`

- [ ] **Step 1a: Rewrite the existing fake `supabase` harness FIRST — the refactor breaks it.** The current fake (`flush-pending-balance.test.ts` lines 19–24) hard-codes `rpc: () => ({ data: null, error: null })` for *all* RPCs; the pre-existing tests assert on the old `.update({pending_balance:0})` claim + an `increment_pending_balance` restore. After the refactor the claim is `rpc("claim_pending_balance_flush")` (which must now return a flush uuid, or `null` ⇒ `BALANCE_CHANGED`), the restore is `rpc("fail_pending_balance_flush")`, and the confirm is `rpc("confirm_pending_balance_flush")` — so **every pre-existing `transferPendingBalance`/`flushPendingBalance` test fails as written** unless the harness *and its assertions* are reworked. Do this before adding new tests:
  - **Fake `rpc` dispatches by fn name**, canned per RPC: `claim_pending_balance_flush → { data: "<fixed test uuid>", error: null }` (override to `{ data: null }` for the lost-claim / balance-changed cases — this replaces the old `update: claimLost` mechanism), `confirm/fail/bump_… → { data: null, error: null }` (override `bump_…` to `{ data: 'stuck' }` in the stuck test). Keep recording every call in `rpcCalls` (`fn`, `args`).
  - **`claim` is now `rpcCalls[0]`.** The restore/bump/confirm calls are `rpcCalls[1]` (and `[2]` where both a confirm and a ledger write happen). Update index-based assertions accordingly.
  - **Idempotency key:** old `"withdraw_u1_1250"` / `"withdraw_u9_700"` → `flush_${uuid}` (the fixed test uuid the claim mock returns). The `metadata.withdrawal_type`/`metadata.type` assertions still hold; `metadata.flush_id` is newly present.
  - **The plain-error "Stripe throws" tests are the AMBIGUOUS case, not a restore.** `flush: Stripe throws…` (lines 88–92) and `transfer: Stripe throws…` (lines 128–147) throw `new Error("stripe down")`, which `isDefiniteFailure` classifies **ambiguous** (no `type`/4xx) → the code calls `bump_flush_attempt`, NOT `fail_pending_balance_flush`. So rewrite these to assert `rpcCalls[1].fn === "bump_flush_attempt"` and that **no** `fail_pending_balance_flush` / no restore occurred (the old `increment_pending_balance` + `sb.updates.length===1` assertions are deleted — there is no `.update()` claim and no restore on an ambiguous error).
  - **Add a NEW definite-failure test** (this is where a restore is asserted): throw a Stripe-style `{ type: "StripeInvalidRequestError", statusCode: 400, message: "No such destination" }` → assert `rpcCalls[1].fn === "fail_pending_balance_flush"` with `args.p_restore === true`, then the error propagates.
  - **`transfer: ledger write fails AFTER transfer`** (lines 149–166): the transfer succeeds, so `rpcCalls` = `[claim, confirm]`, then `writePaymentEvent`'s `payment_events` insert errors ("ledger boom") and propagates. Replace `sb.updates.length === 1` (the removed update-claim) with `rpcCalls[0].fn === "claim_pending_balance_flush"` + `rpcCalls[1].fn === "confirm_pending_balance_flush"`; keep `stripe.calls.length === 1` and no restore.
  - **`flush:` happy-path + business tests** (lines 49–62, 103–113): now reach the transfer only because the `claim` mock returns a uuid; the ledger-row assertions (`inserted[0].row.event_type/entity_type/actor_role`) are unchanged.
- [ ] **Step 1b: Write the new failing Deno tests.** Add to the reworked harness. Cover:
  - `buildFlushTransferParams(row)` returns `amount/currency:'usd'/destination/description/metadata{user_id,withdrawal_type,flush_id}` matching the manual + autoflush shapes exactly.
  - Two `transferPendingBalance` calls for the **same user, identical cents, distinct claims** produce **distinct** idempotency keys `flush_${id1}` ≠ `flush_${id2}` (the bug this closes). Mock the claim RPC to return distinct uuids.
  - Definite Stripe failure (mock `err.type='StripeInvalidRequestError'`, status 400) → `fail_pending_balance_flush(id,true,…)` called, then throw.
  - Ambiguous failure (mock a connection error / 500) → `bump_flush_attempt` called, `fail…` NOT called, then throw.
  - Idempotency-conflict (`err.type='StripeIdempotencyError'`) → treated ambiguous (no restore).
  - Stub `globalThis.fetch` to capture the request. `bump_flush_attempt` mocked to return `{ data: 'stuck' }` → `fileStuckFinding` fires exactly once AND the captured body is the **well-formed** envelope: `type === "findings"`, `payload.findings[0]` has non-empty `title` + `summary_md` and `fingerprint === "payout:flush:stuck:<id>"` (assert the shape, not merely that fetch was called — a 400ing payload would still "fire"). Mocked `{ data: 'claimed' }` → no fetch. Restore `fetch` after.
  - `claim` returns NULL → throws `BALANCE_CHANGED`.

- [ ] **Step 2: Run tests — verify they fail.**
Run: `deno test supabase/functions/_shared/flush-pending-balance.test.ts`
Expected: FAIL (`buildFlushTransferParams` / new behavior not defined). **This is a money path — the Deno tests are the gate, not optional.** They must run and pass (Step 4). If the Deno CLI is genuinely missing, that is a blocker to resolve (install/locate Deno), not a reason to skip to prod-only; the mocked definite-vs-ambiguous branching is only exercisable here. (The real-Stripe replay is additionally proven in Task 4 Step 7.)

- [ ] **Step 3: Implement the refactor.** Replace the body of `transferPendingBalance` and add the shared pieces. Key shape:

```ts
export const RECONCILE_CAP = 6;

export interface FlushRow {
  id: string; user_id: string; profile_type: "creator" | "business";
  stripe_account_id: string; amount_cents: number; source: "manual" | "autoflush";
}

export function buildFlushTransferParams(row: FlushRow) {
  const isManual = row.source === "manual";
  return {
    amount: row.amount_cents,
    currency: "usd",
    destination: row.stripe_account_id,
    description: isManual ? "DragonCandy platform wallet withdrawal" : "DragonCandy pending balance auto-payout",
    metadata: {
      user_id: row.user_id,
      withdrawal_type: isManual ? "pending_balance" : "pending_balance_autoflush",
      flush_id: row.id,
    },
  };
}

// A definite failure means the transfer was NOT created (safe to restore). Anything ambiguous
// (connection/5xx/unknown/idempotency-conflict) MUST NOT restore — the transfer may exist.
// NOTE: this consciously NARROWS spec §3.3 (which also inspects the specific decline code/message):
// every StripeInvalidRequestError is raised pre-creation, so restore-on-4xx cannot double-pay, and the
// idempotency-conflict cases are caught as ambiguous *above* the 4xx check. Restated here so a reviewer
// reads the simplification as deliberate, not an accidental over-restore.
export function isDefiniteFailure(err: any): boolean {
  const type = err?.type ?? err?.raw?.type;
  if (type === "StripeIdempotencyError") return false;                 // conflict → ambiguous
  const msg = String(err?.message ?? "");
  if (msg.includes("idempotent requests can only be used with the same parameters")) return false;
  if (type !== "StripeInvalidRequestError") return false;               // connection/5xx/unknown → ambiguous
  const status = err?.statusCode ?? err?.raw?.statusCode ?? 0;
  return status >= 400 && status < 500;                                 // 4xx invalid request → definite
}

// Alert once when a flush goes terminal-stuck: its wallet balance is already zeroed at claim and is
// NEVER auto-restored, so a human must reconcile. bump_flush_attempt returns 'stuck' on exactly the
// claimed→stuck transition (a re-call finds status<>'claimed' → NULL), giving us file-once for free.
// Fire-and-forget: an alert failure must never mask the original transfer error.
async function fileStuckFinding(row: FlushRow, error: string): Promise<void> {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/aios-report-ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}` },
      // VERIFIED aios-report-ingest contract (index.ts: reads body.type + body.payload; for 'findings',
      // pulls payload.findings[], each requiring title + summary_md; fingerprint dedups idempotently).
      // A flat {severity,title,detail} 400s ("payload is required") and never files.
      body: JSON.stringify({
        type: "findings",
        payload: {
          findings: [{
            severity: "critical",
            title: `Pending-balance flush stuck: ${row.id}`,
            summary_md: `Flush \`${row.id}\` (user ${row.user_id}, ${row.amount_cents}¢, ${row.profile_type}) hit the retry cap; the wallet balance was zeroed at claim and is **not** auto-restored. Manual reconciliation required. Last error: ${error}`,
            source: "reconcile-pending-flushes",
            fingerprint: `payout:flush:stuck:${row.id}`,
          }],
        },
      }),
    });
  } catch (e) {
    console.error("[FLUSH-PENDING-BALANCE] failed to file stuck finding", { flushId: row.id, error: String((e as Error)?.message ?? e) });
  }
}

// Shared by transferPendingBalance (inline) AND reconcile-pending-flushes (replay).
// The row already exists as 'claimed'; move the money exactly-once.
export async function executeFlushTransfer(stripe: Stripe, supabase: SupabaseClient, row: FlushRow): Promise<{ transferId: string; amountCents: number }> {
  const params = buildFlushTransferParams(row);
  let transfer: { id: string };
  try {
    transfer = await stripe.transfers.create(params, { idempotencyKey: `flush_${row.id}` });
  } catch (err) {
    const errMsg = String((err as Error)?.message ?? err);
    if (isDefiniteFailure(err)) {
      await supabase.rpc("fail_pending_balance_flush", { p_flush_id: row.id, p_restore: true, p_error: errMsg });
    } else {
      const { data: bumpedStatus } = await supabase.rpc("bump_flush_attempt", { p_flush_id: row.id, p_error: errMsg, p_cap: RECONCILE_CAP });
      if (bumpedStatus === "stuck") await fileStuckFinding(row, errMsg);   // fires exactly once, at the transition
    }
    throw err;
  }
  // Check the confirm error: if it fails, throw BEFORE the ledger write so the row stays 'claimed' and
  // reconcile re-drives it (Stripe replays the same key → same transfer, no double-pay) and writes the
  // ledger exactly once. Writing the ledger on an unconfirmed row would duplicate it on the re-drive.
  const { error: confirmErr } = await supabase.rpc("confirm_pending_balance_flush", { p_flush_id: row.id, p_transfer_id: transfer.id });
  if (confirmErr) throw new Error(`confirm_pending_balance_flush failed after transfer ${transfer.id}: ${confirmErr.message}`);
  await writePaymentEvent(supabase, {
    event_type: "transfer_created",
    entity_type: row.profile_type === "creator" ? "collaboration" : "sponsorship",
    entity_id: row.user_id,
    campaign_id: null,
    actor_id: row.user_id,
    actor_role: row.profile_type === "creator" ? "creator" : "business",
    amount_cents: row.amount_cents,
    stripe_id: transfer.id,
    metadata: { type: row.source === "manual" ? "wallet_withdrawal" : "pending_balance_autoflush", flush_id: row.id },
  }, "[FLUSH-PENDING-BALANCE]");
  return { transferId: transfer.id, amountCents: row.amount_cents };
}

// KEEP the existing type annotations — the illustrative snippet omits them, but under Deno/noImplicitAny
// `stripe`/`supabase`/the destructured arg must stay typed (`: Stripe`, `: SupabaseClient`,
// `: TransferPendingParams`), and retain the existing `TransferPendingParams`/`ProfileTable` types.
export async function transferPendingBalance(
  stripe: Stripe, supabase: SupabaseClient, { table, userId, stripeAccountId, pendingBalance, source }: TransferPendingParams,
): Promise<{ transferId: string; amountCents: number }> {
  const amountCents = Math.round(pendingBalance * 100);
  const profileType = table === "creator_profiles" ? "creator" : "business";
  const { data: flushId, error } = await supabase.rpc("claim_pending_balance_flush", {
    p_user_id: userId, p_profile_type: profileType, p_stripe_account_id: stripeAccountId, p_amount_cents: amountCents, p_source: source,
  });
  if (error || !flushId) throw new Error(BALANCE_CHANGED);
  return executeFlushTransfer(stripe, supabase, {
    id: flushId, user_id: userId, profile_type: profileType, stripe_account_id: stripeAccountId, amount_cents: amountCents, source,
  });
}
```
Leave `flushPendingBalance` unchanged (it calls `transferPendingBalance` and its `{flushed, amount, transferId?}` contract is preserved). Delete the old amount-based-key transfer + `increment_pending_balance`-restore block that `transferPendingBalance` used to contain. `writePaymentEvent` stays imported from `_shared/payment-events.ts` (already used by the old body).

- [ ] **Step 4: Run tests — verify they pass.**
Run: `deno test supabase/functions/_shared/flush-pending-balance.test.ts`
Expected: PASS — the new cases **and** the pre-existing tests **as rewritten in Step 1a** (they cannot pass unchanged; the rewrite to the fn-dispatching fake `rpc` + updated key/restore assertions is what makes them green).

- [ ] **Step 5: Frontend build guard.** The edge fn isn't in the Vite build, but run `npm run build` from the worktree to confirm nothing frontend broke (push gate). Expected: clean.

- [ ] **Step 6: Commit.**
```bash
git add supabase/functions/_shared/flush-pending-balance.ts supabase/functions/_shared/flush-pending-balance.test.ts
git commit -m "feat(payout): flush keyed on flush_\${id} via durable ledger (buildFlushTransferParams + executeFlushTransfer)"
```

---

## Task 3: `reconcile-pending-flushes` cron worker

**Files:**
- Create: `supabase/functions/reconcile-pending-flushes/index.ts`
- Create: `supabase/migrations/<TS+1>_reconcile_pending_flushes_cron.sql`

- [ ] **Step 1: Write the function.** Mirror `auto-approve-content`'s auth (`isAuthorizedIngest`) + fleet shape:

```ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";
import { executeFlushTransfer, type FlushRow } from "../_shared/flush-pending-balance.ts";

const log = (s: string, d?: any) => console.log(`[RECONCILE-PENDING-FLUSHES] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

serve(async (req) => {
  if (!isAuthorizedIngest(req)) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-08-27.basil" });

  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();  // ≥5 min old — never contend with a first attempt
  const { data: rows, error } = await supabase
    .from("pending_balance_flushes")
    .select("id, user_id, profile_type, stripe_account_id, amount_cents, source")
    .eq("status", "claimed")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) { log("scan failed", { error: error.message }); return new Response(JSON.stringify({ error: error.message }), { status: 500 }); }
  if (!rows?.length) return new Response(JSON.stringify({ reconciled: 0 }), { status: 200 });

  let reconciled = 0;
  for (const row of rows as FlushRow[]) {
    try {
      const { transferId } = await executeFlushTransfer(stripe, supabase, row);  // replays same key → same transfer, or creates it
      log("reconciled", { flushId: row.id, transferId }); reconciled++;
    } catch (err) {
      // executeFlushTransfer already recorded fail(restore) / bump(→stuck). Non-blocking; next tick retries claimed rows.
      log("reconcile attempt did not confirm (recorded)", { flushId: row.id, error: String((err as Error)?.message ?? err) });
    }
  }
  log("done", { scanned: rows.length, reconciled });
  return new Response(JSON.stringify({ scanned: rows.length, reconciled }), { status: 200 });
});
```
Note: `executeFlushTransfer` writes the `transfer_created` ledger event on confirm, so a cron-delivered transfer has audit parity with the inline path.

- [ ] **Step 2: Add the `config.toml` stanza.** In `supabase/config.toml`, add (mirroring `[functions.auto-approve-content]` at ~lines 119–120):
```toml
[functions.reconcile-pending-flushes]
verify_jwt = false
```
The default is `verify_jwt = true`; the `--no-verify-jwt` deploy flag only fixes *that one* deploy. Without the stanza, a later plain `supabase functions deploy` (or whole-project deploy) flips this fn to `verify_jwt=true` and breaks the `isAuthorizedIngest` auth model out from under the cron.

- [ ] **Step 3: Edge-function review** (before deploy). Dispatch `edge-function-reviewer` on `reconcile-pending-flushes` (and note it bundles `_shared/flush-pending-balance.ts`, `_shared/ingest-auth.ts`, `_shared/payment-events.ts`). Resolve ISSUES.

- [ ] **Step 4: Write the cron migration** `<TS+1>_reconcile_pending_flushes_cron.sql` (apply in Task 4, AFTER the fn is deployed AND the Vault URL secret exists). Copy the exact structure of `20260723120003_auto_approve_content_cron.sql` (`net.http_post` with the URL from `vault.decrypted_secrets` + `aios_ingest_key` bearer), schedule name `reconcile-pending-flushes`, cron `*/15 * * * *`. **The template resolves `url := (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_pending_flushes_url')` — a NEW, distinct secret from `auto_approve_content_url`.** Point it at that new secret name (Task 4 Step 5 creates + verifies it). If the secret is absent, `url` is NULL and `net.http_post` silently no-ops — the ledger would never reconcile. `aios_ingest_key` already exists and is shared (reuse it). Do NOT apply yet.

- [ ] **Step 5: Commit** (function + config.toml stanza + cron migration).
```bash
git add supabase/functions/reconcile-pending-flushes/index.ts supabase/config.toml supabase/migrations/<TS+1>_reconcile_pending_flushes_cron.sql
git commit -m "feat(payout): reconcile-pending-flushes cron worker + config stanza + schedule migration"
```

---

## Task 4: Deploy + schedule + prod-verify (careful gate)

**Deploy order: migration (Task 1, already applied) → shared-bundling functions → reconcile fn → cron migration.**

- [ ] **Step 1: Re-fetch `origin/main`; check for collision** on any of the touched functions (Lovable/founder). Confirm `verify_jwt` per function via `list_edge_functions`.

- [ ] **Step 2: Deploy the four shared-bundling callers** (they must pick up the refactored shared file). Preserve each one's current `verify_jwt` (all four are `verify_jwt=false`):
```bash
supabase functions deploy withdraw-pending-balance --no-verify-jwt --project-ref zocahiffooqdybdhguqv
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref zocahiffooqdybdhguqv
supabase functions deploy check-creator-payout-status --no-verify-jwt --project-ref zocahiffooqdybdhguqv
supabase functions deploy check-restaurant-payout-status --no-verify-jwt --project-ref zocahiffooqdybdhguqv
```
Confirm each upload lists `_shared/flush-pending-balance.ts` bundled.

- [ ] **Step 3: Deploy the reconcile worker** `--no-verify-jwt` (it self-gates via `isAuthorizedIngest`):
```bash
supabase functions deploy reconcile-pending-flushes --no-verify-jwt --project-ref zocahiffooqdybdhguqv
```

- [ ] **Step 4: Boot-check.** `list_edge_functions` → all five bumped, `verify_jwt=false`. Curl `reconcile-pending-flushes` with no auth → expect `Unauthorized` (booted, guard runs — bundle OK).

- [ ] **Step 5: Create + verify the Vault URL secret** (careful gate; the cron is inert without it). Create the NEW secret on prod:
```sql
select vault.create_secret('https://zocahiffooqdybdhguqv.supabase.co/functions/v1/reconcile-pending-flushes', 'reconcile_pending_flushes_url');
```
Then **verify it resolves non-null** (this is the check that catches the silent-no-op failure mode):
```sql
select name, decrypted_secret is not null as has_value from vault.decrypted_secrets where name = 'reconcile_pending_flushes_url';
```
Expected: one row, `has_value = true`. (`aios_ingest_key` already exists — do NOT recreate it.)

- [ ] **Step 6: Apply the cron migration** (now the fn exists AND the URL secret resolves) via `apply_migration`. Verify: `SELECT jobname, schedule FROM cron.job WHERE jobname='reconcile-pending-flushes';` → one row, `*/15 * * * *`.

- [ ] **Step 7: Real (test-mode) Stripe replay E2E — proves the exactly-once core claim.** Stripe is in test mode, so a real transfer here is harmless. This exercises `executeFlushTransfer`'s real Stripe path + idempotent replay end-to-end (the mocks in Task 2 can't):
  1. First confirm the no-op: invoke `reconcile-pending-flushes` with the service-role bearer → expect `{scanned:0,reconciled:0}` (no claimed rows). If it's non-zero, a real ambiguous flush landed between the Step 2 deploy and now — note those pre-existing `claimed` rows (`select id,user_id,amount_cents,created_at from pending_balance_flushes where status='claimed'`) and proceed; they are legitimate work for the cron, not a test failure.
  2. **Committed** (not rollback-wrapped — a separate HTTP invocation can't see uncommitted rows) insert ONE synthetic `claimed` row directly (NOT via the claim RPC, so no real creator's `pending_balance` is touched): a small `amount_cents` (e.g. `50`), `source='autoflush'`, `profile_type='creator'`, a **`user_id` that is a real `auth.users` id** (the seeded test creator's — the row FKs `auth.users`), a **test-mode connected account** in `stripe_account_id` (that creator's `stripe_account_id` with charges+payouts enabled — record which account), and **backdate `created_at` to `now() - interval '10 minutes'`** so it clears the 5-min cutoff. Capture the inserted `id`.
  3. Invoke `reconcile-pending-flushes` → assert exactly **one** Stripe transfer created (the row flips to `succeeded` with a `stripe_transfer_id`; confirm in the Stripe test dashboard there is one transfer for idempotency key `flush_${id}`). Record that transfer id.
  4. **Prove replay (required — this is the core claim):** reset the SAME row back to claimable rather than re-inserting (a same-`id` insert collides on the PK; a new `id` would use a different idempotency key and prove nothing): `UPDATE pending_balance_flushes SET status='claimed', stripe_transfer_id=NULL WHERE id='<id>'`. Re-invoke `reconcile-pending-flushes` → assert the `stripe_transfer_id` written back is the **SAME** id from step 3 and the Stripe dashboard shows **no second transfer** (the `flush_${id}` key replayed the original).
  5. **Clean up:** delete the synthetic `pending_balance_flushes` row and both `transfer_created` `payment_events` rows it wrote (steps 3 + 4 each confirm→ledger; the step-4 replay writes a second ledger row for the same `stripe_id` — expected, they're test artifacts). The test-mode Stripe transfer is inert.
  If no seeded test connected account is available, create one via the test-onboarding flow first; do NOT skip this step — it is the only real-Stripe proof of the replay guarantee.

---

## Task 5: Codex + PR + knowledge-sync

- [ ] **Step 1: Codex second review** — `codex review --base main --title "durable flush ledger"` from the worktree. Fix any real issues; re-run until clean.

- [ ] **Step 2: knowledge-sync.** Compound onto `docs/wiki/concepts/payout-finalization-consistency.md` (new "Durable flush ledger" section + move the identical-cents residual from "remaining" to "closed"); raw session source; `index.md`/`log.md`; `SHIPPED_LOG.md` prepend; `PROJECT_CONTEXT.md` §5 line; `DATABASE_SCHEMA.md` (`pending_balance_flushes` + the 4 RPCs). Mark the wallet-first spec's stage-1 prerequisite as satisfied.

- [ ] **Step 3: Open the PR** (push; if the push hangs, use the REST blob→tree→commit→ref workaround). Body: what shipped, reviews, the exactly-once argument, deploy-verified.

- [ ] **Step 4: Merge** (after CI green), refresh local main (fires the RAG hook), verify `donny_knowledge` advanced, run `verify-knowledge`.

---

## Definition of Done

- `pending_balance_flushes` + 4 RPCs live on prod (verified via `pg_proc`/`information_schema`, service-role-only ACL).
- `deno test` on the shared file passes — the rewritten pre-existing tests **and** the new distinct-key / definite-vs-ambiguous / stuck-alert cases.
- Five functions deployed (`verify_jwt=false` preserved via the `config.toml` stanza + boot-checked); the `reconcile_pending_flushes_url` Vault secret exists and resolves non-null; cron scheduled.
- The real test-mode Stripe replay E2E (Task 4 Step 7) passed: one transfer created, re-invocation replays the same transfer id with no second transfer.
- A `claimed→stuck` transition files exactly one `aios-report-ingest` CRITICAL finding (so a zeroed-but-unpaid wallet is never silent).
- All three reviews clean (data-exposure, edge-function, Codex).
- Two identical-cents flushes now move money twice (bug closed) **without** re-introducing ambiguous-failure over-pay.
- Knowledge layer updated + RAG synced; wallet-first stage-2 prerequisite marked satisfied.

## Known residuals (accepted, documented — not regressions)

- **Ledger-write failure after `confirm`.** If `confirm_pending_balance_flush` succeeds (row `succeeded`, money moved) but the subsequent `writePaymentEvent` throws, the flush is `succeeded` with no `transfer_created` audit row, and reconciliation (which scans only `status='claimed'`) will not re-drive it. This exactly matches the pre-existing "money moved, ledger row missing" behavior of the old code — **not a new regression**. Accepted for this stage; a belt-and-suspenders "`succeeded` rows lacking a ledger event" sweep is a possible follow-up, not in scope.
- **`isDefiniteFailure` narrows spec §3.3** (documented inline in Task 2 Step 3) — deliberate and safe (all `StripeInvalidRequestError`s are pre-creation; idempotency-conflict is caught as ambiguous first), called out so it isn't mistaken for an accidental over-restore.
