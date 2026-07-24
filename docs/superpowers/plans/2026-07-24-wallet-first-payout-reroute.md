# Wallet-First Payout Reroute (Stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route `release-creator-payout`'s onboarded path through the pending wallet + the (stage-1) exactly-once flush, removing the transfer-vs-pending fork — closing the last two payout residuals (cross-path concurrent double-pay; Stripe-up/DB-down marker split-brain) — and update the frontend money-display readers so nothing double-counts or freezes.

**Architecture:** Every payout becomes one shape: `credit_pending_balance_for_payout` (atomic wallet credit + durable marker) → if `verifyPayoutReady`, best-effort `flushPendingBalance` (exactly-once via the stage-1 ledger) → `finalizePayoutState`. No divergent money path ⇒ both residuals close by construction. The ledger writes one collaboration-keyed `payment_released` + `payout_pending_wallet` per payout; the three frontend readers adopt one reconciled Total-Earned rule (`metadata.type` discriminates wallet-level transfers) and read `pending_balance` for In Wallet.

**Tech Stack:** Supabase Deno edge functions (Stripe SDK 18.5.0, supabase-js 2.57.2), React 18 + Vitest + Testing Library, existing `_shared/flush-pending-balance.ts` / `payment-events.ts` / `payout-ready.ts`.

**Spec:** `docs/superpowers/specs/2026-07-23-wallet-first-payout-redesign-design.md` — read it first.

**Standing rules:** No new migration (all columns + RPCs live from #329/#334). Follow the `careful` skill before any prod write (edge-fn deploy). This is an **edge-fn + frontend** change. Prod ref: `zocahiffooqdybdhguqv`.

---

## File Structure

- **Modify** `supabase/functions/release-creator-payout/index.ts` — replace the `if (creatorPayoutReady) {…transfer…} else {…credit…}` fork (lines ~316–573) with the single wallet-first path; add the `flushPendingBalance` import; delete `markTransferExecuted` (now unused).
- **Create** `supabase/functions/release-creator-payout/index.test.ts` — Deno tests for the rerouted ledger writes + flush gating (mocked stripe/supabase, same fake style as `_shared/flush-pending-balance.test.ts`).
- **Modify** `src/components/payments/PaymentSummaryCards.tsx` — `computeCreatorStats` (totalEarned `metadata.type` exclusion; inWallet from a new `pendingBalanceCents` prop).
- **Create** `src/components/payments/PaymentSummaryCards.test.tsx` — vitest for the reconciled rule across historical + new event mixes.
- **Modify** `src/hooks/useCreatorEarnings.ts` — the `totalEarned` query/derivation.
- **Modify** `src/pages/PaymentsPage.tsx` — plumb `pendingBalanceCents` into `<PaymentSummaryCards>`.
- **Knowledge:** compound onto `docs/wiki/concepts/payout-finalization-consistency.md` + the usual core docs.

---

## Task 1: Backend reroute — `release-creator-payout` (TDD)

**Files:**
- Modify: `supabase/functions/release-creator-payout/index.ts`
- Test: `supabase/functions/release-creator-payout/index.test.ts` (create)

- [ ] **Step 1: Read the current function end-to-end.** Confirm the pieces this task KEEPS unchanged: the early re-entry guard (`if (collaboration.payout_executed_at || collaboration.stripe_transfer_id) → finalize-only`, ~lines 243–263), the amount/fee computation (`creatorPayout`), `verifyPayoutReady` + the stale-flag self-heal (~308–315), `finalizePayoutState` (helper ~120), `writePaymentEvent`, and the auto-schedule + response tail. The pieces this task REPLACES: the whole `if (creatorPayoutReady) { … } else { … }` fork (~316–573).

- [ ] **Step 2: Write failing Deno tests.** The function is a large `serve` handler that builds its own supabase/stripe clients from env, so it isn't directly unit-testable. **Extract the wallet-first payout body into an exported, dependency-injected helper** `applyWalletFirstPayout(d)` that returns a plain `{ status, body }` (NOT a `Response` — keeps `req`/CORS out of the testable unit; the handler wraps it). This is the single committed testing approach. Helper signature to implement in Step 4:
```ts
export interface WalletFirstDeps {
  supabase: SupabaseClient;
  stripe: Stripe;
  collaborationId: string;
  campaignId: string;
  creatorId: string;
  callerId: string | null;
  creatorPayout: number;          // dollars
  stripeAccountId: string | null;
  creatorPayoutReady: boolean;
}
export async function applyWalletFirstPayout(d: WalletFirstDeps): Promise<{ status: number; body: Record<string, unknown> }>;
```
Create `index.test.ts` (mirror the fake-stripe / fake-supabase-by-rpc-name style of `_shared/flush-pending-balance.test.ts`; record `rpc`/`from().insert` calls). Cover, calling `applyWalletFirstPayout(deps)` directly:
  - **Onboarded + fresh credit** (`credit_pending_balance_for_payout` → `'credited'`, `verifyPayoutReady.ready=true`): writes exactly `content_approved`, `payment_release_initiated`, `payment_released`, `payout_pending_wallet` (all `entity_type:'collaboration'`, `entity_id:collaborationId`); calls `flushPendingBalance(stripe, supabase, stripeAccountId)`; NO `stripe.transfers.create` directly; finalize called.
  - **Not-onboarded + fresh credit** (`ready=false`): same four ledger writes; `flushPendingBalance` NOT called; finalize called.
  - **Concurrent re-entry** (`credit_… → 'already'`): NO ledger writes (the `!alreadyCredited` gate), NO flush of new intent (flush may still be a no-op call — assert the ledger writes are skipped); finalize still called.
  - **Flush throws**: swallowed (best-effort), finalize still called, response `success:true`.
  - **Credit RPC error**: throws → surfaces 500 (nothing moved).
  - **Finalize fails**: returns `500 {needsRetry}`.

- [ ] **Step 3: Run the tests — verify they fail.** `deno test supabase/functions/release-creator-payout/index.test.ts --allow-net --allow-env`. Expected FAIL (helper not exported / new behavior absent).

- [ ] **Step 4: Implement the reroute.** Add the import and replace the fork. Import:
```ts
import { flushPendingBalance } from "../_shared/flush-pending-balance.ts";
```
Define the exported helper at module level (its body is the whole payout logic), then replace the entire `if (creatorPayoutReady) { … } else { … }` block (~lines **316–575**, INCLUSIVE of both branches — the `} else {` is at ~495 and its close `}` at ~575; grep to confirm the exact bounds) with a thin call site. Keep everything BEFORE the fork (early re-entry guard, fees, `verifyPayoutReady` + stale-flag heal). The helper (note: `writePaymentEvent`, `flushPendingBalance`, `finalizePayoutState` are module-level; `generateAutoSchedule` stays in the handler because it needs the full `campaign` object):
```ts
export async function applyWalletFirstPayout(d: WalletFirstDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  const { supabase, stripe, collaborationId, campaignId, creatorId, callerId, creatorPayout, stripeAccountId, creatorPayoutReady } = d;

  // Credit the pending wallet ATOMICALLY with the durable marker (row-locked inside the RPC): concurrent
  // invocations cannot double-credit — exactly one credits + marks, the rest return 'already'. On error the
  // RPC's tx rolls back entirely (no partial credit, no marker) → safe to retry.
  const { data: creditResult, error: creditError } = await supabase.rpc('credit_pending_balance_for_payout', {
    p_collaboration_id: collaborationId, p_user_id: creatorId, p_amount: creatorPayout,
  });
  if (creditError) throw new Error(`Failed to credit pending balance: ${creditError.message}`);
  const alreadyCredited = creditResult === 'already';

  // Ledger — only when THIS call actually credited (skip on a concurrent-race 'already').
  // Collaboration-keyed: payment_released decrements business In Escrow; payout_pending_wallet is the
  // creator "earned" signal. (The wallet→Stripe transfer_created is written user-keyed by the flush.)
  if (!alreadyCredited) {
    const amountCents = Math.round(creatorPayout * 100);
    const events = [
      { event_type: 'content_approved', actor_id: callerId ?? undefined, actor_role: 'business' as const },
      { event_type: 'payment_release_initiated', actor_role: 'system' as const, amount_cents: amountCents, metadata: { destination: stripeAccountId } },
      { event_type: 'payment_released', actor_id: creatorId, actor_role: 'creator' as const, amount_cents: amountCents },
      { event_type: 'payout_pending_wallet', actor_id: creatorId, actor_role: 'creator' as const, amount_cents: amountCents, metadata: { reason: creatorPayoutReady ? 'flushing_to_stripe' : 'creator_onboarding_incomplete' } },
    ];
    for (const ev of events) {
      try { await writePaymentEvent(supabase, { entity_type: 'collaboration', entity_id: collaborationId, campaign_id: campaignId, ...ev }, '[RELEASE-CREATOR-PAYOUT]'); }
      catch (auditErr) { console.error('Payment event logging failed (non-blocking):', auditErr); }
    }
  }

  // Best-effort exactly-once flush to Stripe if the creator can receive payouts NOW. The wallet credit is
  // already durable; a flush failure leaves the money SAFELY in the wallet (reconcile-pending-flushes + the
  // webhook/poll triggers heal it). verifyPayoutReady (not the flush's own onboarding-flag check) is the
  // "flush now?" decision, so a stale-false flag doesn't wrongly hold the money — the heal in the handler set
  // stripe_onboarding_complete=true before this, so the flush's internal check now passes.
  if (creatorPayoutReady && stripeAccountId) {
    try { await flushPendingBalance(stripe, supabase, stripeAccountId); }
    catch (flushErr) { console.error('[RELEASE-CREATOR-PAYOUT] flush failed (money safe in wallet; reconcile will retry):', flushErr); }
  }

  // Finalize DB state (retried). Wallet credit + marker are committed atomically → re-invocation is
  // finalize-only (early re-entry guard), so a persistent finalize failure can safely surface for retry.
  const finalized = await finalizePayoutState(supabase, collaborationId, campaignId);
  if (!finalized) {
    console.error('Credited + marked but finalize failed after retries — surfacing for retry.', { collaborationId });
    return { status: 500, body: { success: false, needsRetry: true, error: 'finalize_failed' } };
  }
  return { status: 200, body: { success: true, amount: creatorPayout, method: creatorPayoutReady ? 'wallet_flush' : 'pending_balance' } };
}
```
The handler call site (replaces the deleted fork):
```ts
    const result = await applyWalletFirstPayout({
      supabase: supabaseClient, stripe,
      collaborationId, campaignId: campaign.id, creatorId: collaboration.creator_id,
      callerId: callerId ?? null, creatorPayout,
      stripeAccountId: creatorProfile.stripe_account_id ?? null, creatorPayoutReady,
    });
    if (result.status === 200) {
      try { await generateAutoSchedule(supabaseClient, campaign, collaboration.creator_id); }
      catch (scheduleError) { logStep('Auto-schedule generation failed (non-blocking)', { error: scheduleError instanceof Error ? scheduleError.message : String(scheduleError) }); }
    }
    return new Response(JSON.stringify(result.body), { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: result.status });
```
Then **delete** the now-unused `markTransferExecuted` helper (~line 158) and confirm no remaining reference to `stripe.transfers.create`, `markTransferExecuted`, `payout_${collaborationId}`, `escrow_status: 'releasing'`, or `manualReconciliation` in this file (grep to be sure). `verifyPayoutReady`/`finalizePayoutState`/`flushPendingBalance` remain imported/used; remove any import left unused after the deletion.

- [ ] **Step 5: Run the tests — verify they pass.** `deno test … --allow-net --allow-env`. All green.

- [ ] **Step 6: `npm run build`** (push gate; edge fn isn't in the bundle but confirms nothing frontend broke). Expected clean.

- [ ] **Step 7: Commit.** `git add supabase/functions/release-creator-payout/ && git commit -m "feat(payout): wallet-first reroute — one money path (credit→flush→finalize)"`

---

## Task 2: Frontend readers (TDD)

**Files:**
- Modify: `src/components/payments/PaymentSummaryCards.tsx`, `src/hooks/useCreatorEarnings.ts`, `src/pages/PaymentsPage.tsx`
- Test: `src/components/payments/PaymentSummaryCards.test.tsx` (create)

- [ ] **Step 1: Write failing vitest tests** for `computeCreatorStats`. To test the pure functions, either export them or test via the rendered component; **prefer exporting `computeCreatorStats`/`computeBusinessStats`** (named exports) for direct unit tests. Cover the reconciled Total-Earned rule with a mixed event list:
  - historical transfer-path payout: `transfer_created` (collaboration-keyed, `metadata:{destination}`, **no** `type`) → **counts** once.
  - historical pending payout: `payout_pending_wallet` → counts once.
  - new rerouted payout: `payment_released` + `payout_pending_wallet` (collaboration) + a user-keyed `transfer_created` with `metadata.type:'pending_balance_autoflush'` → **counts once** (only `payout_pending_wallet`; the flush event excluded).
  - legacy manual withdrawal: `transfer_created` `metadata.type:'wallet_withdrawal'` (no `flush_id`) → **excluded** from earnings.
  - `inWallet` = the `pendingBalanceCents` prop (assert it renders `formatCurrency(pendingBalanceCents)`), NOT event-derived.
  - `computeBusinessStats.inEscrow`: an `escrow_held` with a matching `payment_released` → decremented; without → still in escrow.

- [ ] **Step 2: Run — verify fail.** `npx vitest run src/components/payments/PaymentSummaryCards.test.tsx`. (Trust "Tests N passed, 0 failed" over the exit code — nested-worktree Playwright files fail unrelatedly.)

- [ ] **Step 3: Implement `PaymentSummaryCards.tsx`.**
  - Add `pendingBalanceCents?: number` to `PaymentSummaryCardsProps`.
  - `computeCreatorStats.totalEarned` — change the `transfer_created` term to exclude wallet-level transfers by `metadata.type`:
```ts
const WALLET_TRANSFER_TYPES = new Set(['wallet_withdrawal', 'pending_balance_autoflush']);
const totalEarned = events
  .filter(e =>
    e.event_type === 'payout_pending_wallet' ||
    (e.event_type === 'transfer_created' && !WALLET_TRANSFER_TYPES.has((e.metadata?.type as string) ?? '')))
  .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
```
  - `computeCreatorStats` — accept `pendingBalanceCents` and return it as `inWallet` (delete the old event-matching `inWallet` derivation):
```ts
function computeCreatorStats(events: PaymentEvent[], pendingBalanceCents: number) {
  const totalEarned = /* as above */;
  const inWallet = pendingBalanceCents;   // source of truth; events are not authoritative for the wallet balance
  const pendingReview = /* unchanged */;
  return { totalEarned, inWallet, pendingReview };
}
```
  - In the creator branch of the component, call `computeCreatorStats(events, pendingBalanceCents ?? 0)`.

- [ ] **Step 4: Implement `useCreatorEarnings.ts`.** Change the earned query from `.in('event_type', ['payment_released', 'payout_pending_wallet'])` to `.in('event_type', ['payout_pending_wallet', 'transfer_created'])` (still `.in('entity_id', collabIds).eq('entity_type', 'collaboration')` — that scoping already excludes user-keyed wallet transfers, so no `metadata.type` filter is needed here). Keep `inEscrow`/`available` unchanged. This drops `payment_released` from the earned sum (which now fires on every payout and would double-count).

- [ ] **Step 5: Implement `PaymentsPage.tsx`.** It renders `<PaymentSummaryCards events={allEvents} userRole={role} />` and does NOT import `useCreatorEarnings`. **Read the file first** — it uses `user` (`user?.id`) and `role` (not `userId`/`userRole`), so wire with the real names. Add the single-source wallet value (gate the hook on the creator role so business/brand users don't fire an unused `check-creator-payout-status` invoke):
```tsx
import { useCreatorEarnings } from '@/hooks/useCreatorEarnings';
// …inside the component:
const { data: earnings } = useCreatorEarnings(role === 'creator' ? user?.id : undefined);   // `available` is dollars
// …in the render:
<PaymentSummaryCards events={allEvents} userRole={role}
  pendingBalanceCents={Math.round((earnings?.available ?? 0) * 100)} />
```
  `useCreatorEarnings` already short-circuits when its `userId` arg is falsy (`enabled: !!userId`), so passing `undefined` for non-creators is a clean no-op.

- [ ] **Step 6: Note the tab-classification consequence (verify, don't necessarily change).** `PaymentsPage` groups a collaboration into "Completed" when its latest event type is in `terminalTypes` (`transfer_created`/`payout_completed`/`refund_completed`/`dispute_resolved`). After the reroute an onboarded payout no longer writes a collaboration-keyed `transfer_created`, so its collaboration now ends on `payout_pending_wallet` → it renders under **"Active"**, not "Completed" (same as how pending-path payouts already behave — not a new bug class, but a visible change for onboarded creators). Decide during implementation: either accept it (document in the PR) OR add `'payout_pending_wallet'` to `terminalTypes` so a paid collaboration reads as Completed. This is a UX/classification call, not a money-safety one; confirm the chosen behavior in the Task 3 prod verify.

- [ ] **Step 7: Run tests — verify pass** (`npx vitest run src/components/payments/PaymentSummaryCards.test.tsx`) and **`npm run typecheck` + `npm run build`** (the push gate). All clean.

- [ ] **Step 8: Commit.** `git add src/ && git commit -m "feat(payout): reconcile Total Earned rule + In Wallet from pending_balance across the 3 readers"`

---

## Task 3: Deploy + prod verify (careful gate)

- [ ] **Step 1: Reviews before deploy.** Dispatch `edge-function-reviewer` on `release-creator-payout` (verify_jwt drift, `_shared` bundling incl. `flush-pending-balance.ts`/`payment-events.ts`/`payout-ready.ts`, no leftover transfer-path code) and `data-exposure-reviewer` on the change (the RPC is service-role; the function is service-role — confirm no new cross-actor path). Resolve ISSUES.

- [ ] **Step 2: Re-fetch `origin/main`; collision-check** `release-creator-payout` (Lovable/founder). Confirm its live `verify_jwt` via `list_edge_functions` (it is `false`) — deploy `--no-verify-jwt` to preserve.

- [ ] **Step 3: Deploy** from the worktree: `supabase functions deploy release-creator-payout --no-verify-jwt --project-ref zocahiffooqdybdhguqv`. Confirm it bundled `_shared/flush-pending-balance.ts`.

- [ ] **Step 4: Boot-check.** `list_edge_functions` → version bumped, `verify_jwt=false`.

- [ ] **Step 5: Rollback-wrapped prod test** (a `DO`/`execute_sql` sequence with `set_config('request.jwt.claims',…service_role…)` where it touches RPCs). Verify: an onboarded-creator payout credits the wallet + sets the marker + flushes (row→`succeeded`), writes the 4 collaboration-keyed events once; a concurrent double-invoke credits once (RPC lock); a not-onboarded payout credits + marks + no flush. Prefer invoking the deployed fn for a seeded test collaboration, cleaned up afterward (as stage 1's E2E).

- [ ] **Step 6: Frontend prod verify.** After the frontend deploys (Vercel), load a creator's `/payments` for a known account and confirm Total Earned counts each payout once and In Wallet matches the wallet balance; both viewports.

---

## Task 4: Codex + PR + knowledge-sync

- [ ] **Step 1: Codex** — `codex review --base origin/main --title "wallet-first payout reroute"` from the worktree. Fix real issues; re-run until clean.
- [ ] **Step 2: knowledge-sync** — compound onto `docs/wiki/concepts/payout-finalization-consistency.md` (flip the two residuals from "remaining" to "closed by the reroute"; document the ledger-event contract + the reconciled reader rule); new raw session; `index.md`/`log.md`; `SHIPPED_LOG.md` prepend; `PROJECT_CONTEXT.md` §5 line; no `DATABASE_SCHEMA` change (no schema change). Mark the wallet-first spec's stage-2 done.
- [ ] **Step 3: PR** (push; REST blob→tree→commit→ref fallback if the push hangs). Body: what shipped, the fork removal, the reconciled contract, deploy-verified, Codex-clean.
- [ ] **Step 4: Merge** (after CI green — note the `Supabase Preview` fail is the known staging-drift false-failure), refresh local main (fires the RAG hook), verify `donny_knowledge` advanced, run `verify-knowledge`.

---

## Definition of Done

- `release-creator-payout` is a single wallet-first path (fork + `markTransferExecuted` + direct transfer deleted); Deno tests green.
- The 3 frontend readers use the reconciled Total-Earned rule (`metadata.type` exclusion) + `pendingBalanceCents` for In Wallet; vitest green; `npm run build` clean.
- Deployed (`verify_jwt=false` preserved, boot-checked); rollback-wrapped prod test + both-viewport frontend verify pass.
- All reviews clean (edge-function, data-exposure, Codex).
- Both residuals (cross-path concurrent double-pay; marker split-brain) closed; no double-count/freeze in Total Earned / In Wallet / In Escrow for historical OR new events.
- Knowledge layer updated + RAG synced.
