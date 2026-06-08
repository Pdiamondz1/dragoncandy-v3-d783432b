# Auto-Flush Stranded `pending_balance` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically transfer a creator/restaurant's held `pending_balance` to their Stripe Connect account the moment that account becomes payout-ready, with no manual action.

**Architecture:** One new shared Deno module `_shared/flush-pending-balance.ts` exposing (a) `transferPendingBalance(...)` — the atomic-claim → Stripe-transfer → restore-on-error → ledger core, extracted from the existing `withdraw-pending-balance` endpoint, and (b) `flushPendingBalance(stripe, supabase, stripeAccountId)` — a state-driven, idempotent wrapper that resolves the owning profile, guards on readiness + owed balance, and calls the core. It is wired into the already-existing `account.updated` Stripe webhook and the two onboarding-return status-poll functions. The manual withdraw endpoint is refactored to delegate to the same core (DRY). No new edge function, secret, migration, or `config.toml` change.

**Tech Stack:** Supabase Deno edge functions, Stripe Connect (Express, transfers), `stripe@18.5.0` / `@supabase/supabase-js@2.57.2` via esm.sh, Deno test runner (`std@0.224.0/assert`).

**Spec:** `docs/superpowers/specs/2026-06-08-auto-flush-creator-balance-design.md` (read it before starting — especially §5.1 on idempotency-key nuances).

---

## Pre-flight

- Branch: `worktree-auto-flush-balance` (already created off `origin/main`), worktree `C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/outstand-webhook`. Run all git/build commands from there.
- Deno is installed at `$HOME/.deno/bin/deno` (v2.8.2). PATH does **not** persist between Bash calls — always use the full path `"$HOME/.deno/bin/deno"`.
- The first `deno test` run fetches `@supabase/supabase-js` from esm.sh (pulled in transitively by `payment-events.ts`) and caches it; allow network on first run.
- These are Deno files under `supabase/` — they are **excluded** from `npm run typecheck` (src-only) and `npm run lint` (ignores `supabase/**`) and from vitest (excluded in `vite.config.ts`). Their only automated gate is `deno test`. The frontend `npm run build` / `typecheck` still must pass (they prove nothing in `src/` regressed).

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/functions/_shared/flush-pending-balance.ts` (**create**) | `transferPendingBalance` core + `flushPendingBalance` wrapper |
| `supabase/functions/_shared/flush-pending-balance.test.ts` (**create**) | Deno unit tests with injected fake supabase + stripe |
| `supabase/functions/withdraw-pending-balance/index.ts` (**modify**) | Refactor inline transfer block (lines ~104–158) to delegate to `transferPendingBalance` (`source: 'manual'`). Behavior unchanged. |
| `supabase/functions/stripe-webhook/index.ts` (**modify**) | In `account.updated` (lines ~370–391), after the boolean update, call `flushPendingBalance` when ready (try/catch, never fail the webhook). |
| `supabase/functions/check-creator-payout-status/index.ts` (**modify**) | After the onboarding flip (lines ~77–86), call `flushPendingBalance` when ready (try/catch, never fail the response). |
| `supabase/functions/check-restaurant-payout-status/index.ts` (**modify**) | After its onboarding write (lines ~135–170), call `flushPendingBalance` when ready (try/catch). |

---

## Task 1: Shared `flush-pending-balance` module (TDD)

**Files:**
- Create: `supabase/functions/_shared/flush-pending-balance.ts`
- Test: `supabase/functions/_shared/flush-pending-balance.test.ts`

- [ ] **Step 1: Write the failing test file**

Mirror the existing Deno test idiom in `_shared/outstand-webhook-lib.test.ts` (`Deno.test`, `assertEquals` from `std@0.224.0`). The fakes below support exactly the fluent chains the module uses: `from(t).select(c).eq(k,v).maybeSingle()`, `from(t).update(o).eq(k,v).eq(k,v).select(c)` (awaited), and `from('payment_events').insert(o)` (awaited).

```ts
// supabase/functions/_shared/flush-pending-balance.test.ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { flushPendingBalance, transferPendingBalance } from "./flush-pending-balance.ts";

type Resp = { data: any; error: any };

// Fake supabase: per-table canned results for select / update / insert.
function fakeSupabase(byTable: Record<string, { select?: Resp; update?: Resp; insert?: Resp }>) {
  const inserted: any[] = [];
  const get = (t: string) => byTable[t] ?? {};
  const selChain = (res: Resp): any => {
    const c: any = { eq: () => c, maybeSingle: () => Promise.resolve(res), then: (r: any) => r(res) };
    return c;
  };
  const updChain = (res: Resp): any => {
    const c: any = { eq: () => c, select: () => ({ then: (r: any) => r(res) }), then: (r: any) => r(res) };
    return c;
  };
  const client: any = {
    inserted,
    from: (t: string) => ({
      select: () => selChain(get(t).select ?? { data: null, error: null }),
      update: () => updChain(get(t).update ?? { data: [], error: null }),
      insert: (row: any) => { inserted.push({ table: t, row }); return Promise.resolve(get(t).insert ?? { error: null }); },
    }),
  };
  return client;
}

// Fake stripe: records transfer calls; optional throw.
function fakeStripe(onTransfer?: (p: any, o: any) => any) {
  const calls: any[] = [];
  return {
    calls,
    transfers: {
      create: (p: any, o: any) => { calls.push({ params: p, opts: o }); return onTransfer ? onTransfer(p, o) : Promise.resolve({ id: "tr_test", amount: p.amount }); },
    },
  } as any;
}

const readyCreator = { data: { user_id: "u1", stripe_onboarding_complete: true, pending_balance: 12.5 }, error: null };
const claimOk = { data: [{ pending_balance: 0 }], error: null };
const claimLost = { data: [], error: null };

Deno.test("flush: ready creator with balance -> one transfer, zeroed, ledgered", async () => {
  const sb = fakeSupabase({ creator_profiles: { select: readyCreator, update: claimOk } });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_1");
  assertEquals(res.flushed, true);
  assertEquals(res.amount, 12.5);
  assertEquals(stripe.calls.length, 1);
  assertEquals(stripe.calls[0].params.amount, 1250);            // dollars -> cents
  assertEquals(stripe.calls[0].params.destination, "acct_1");
  assertEquals(stripe.calls[0].opts.idempotencyKey, "withdraw_u1_1250");
  assertEquals(sb.inserted.length, 1);                          // ledger row written
  assertEquals(sb.inserted[0].row.event_type, "transfer_created");
  assertEquals(sb.inserted[0].row.entity_type, "collaboration");
});

Deno.test("flush: zero balance -> no transfer", async () => {
  const sb = fakeSupabase({ creator_profiles: { select: { data: { user_id: "u1", stripe_onboarding_complete: true, pending_balance: 0 }, error: null } } });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_1");
  assertEquals(res.flushed, false);
  assertEquals(stripe.calls.length, 0);
});

Deno.test("flush: not onboarded -> no transfer", async () => {
  const sb = fakeSupabase({ creator_profiles: { select: { data: { user_id: "u1", stripe_onboarding_complete: false, pending_balance: 30 }, error: null } } });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_1");
  assertEquals(res.flushed, false);
  assertEquals(stripe.calls.length, 0);
});

Deno.test("flush: lost the atomic claim race -> benign no-op, no transfer", async () => {
  const sb = fakeSupabase({ creator_profiles: { select: readyCreator, update: claimLost } });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_1");
  assertEquals(res.flushed, false);
  assertEquals(stripe.calls.length, 0);                        // claim failed before Stripe call
});

Deno.test("flush: Stripe throws -> balance restored, error propagates, no ledger", async () => {
  const sb = fakeSupabase({ creator_profiles: { select: readyCreator, update: claimOk } });
  const stripe = fakeStripe(() => { throw new Error("stripe down"); });
  await assertRejects(() => flushPendingBalance(stripe, sb, "acct_1"), Error, "stripe down");
  assertEquals(sb.inserted.length, 0);                         // no ledger row on failure
});

Deno.test("flush: unknown account -> no-op", async () => {
  const sb = fakeSupabase({});                                 // both tables resolve null
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_unknown");
  assertEquals(res.flushed, false);
  assertEquals(stripe.calls.length, 0);
});

Deno.test("flush: business profile -> sponsorship/business ledger mapping", async () => {
  const sb = fakeSupabase({
    creator_profiles: { select: { data: null, error: null } },
    business_profiles: { select: { data: { user_id: "b1", stripe_onboarding_complete: true, pending_balance: 5 }, error: null }, update: claimOk },
  });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_b");
  assertEquals(res.flushed, true);
  assertEquals(sb.inserted[0].row.entity_type, "sponsorship");
  assertEquals(sb.inserted[0].row.actor_role, "business");
});

Deno.test("transferPendingBalance: manual source keeps existing metadata + key shape", async () => {
  const sb = fakeSupabase({ creator_profiles: { update: claimOk } });
  const stripe = fakeStripe();
  const out = await transferPendingBalance(stripe, sb, {
    table: "creator_profiles", userId: "u9", stripeAccountId: "acct_9", pendingBalance: 7, source: "manual",
  });
  assertEquals(out.amountCents, 700);
  assertEquals(stripe.calls[0].opts.idempotencyKey, "withdraw_u9_700");
  assertEquals(stripe.calls[0].params.metadata.withdrawal_type, "pending_balance");
  assertEquals(sb.inserted[0].row.metadata.type, "wallet_withdrawal");
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `"$HOME/.deno/bin/deno" test supabase/functions/_shared/flush-pending-balance.test.ts`
Expected: FAIL — `Module not found "./flush-pending-balance.ts"`.

- [ ] **Step 3: Implement the module**

```ts
// supabase/functions/_shared/flush-pending-balance.ts
import type Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "./payment-events.ts";

type ProfileTable = "creator_profiles" | "business_profiles";

export interface TransferPendingParams {
  table: ProfileTable;
  userId: string;
  stripeAccountId: string;
  pendingBalance: number; // dollars, the value just read
  source: "manual" | "autoflush";
}

export const BALANCE_CHANGED =
  "Withdrawal already in progress or balance has changed. Please try again.";

/**
 * Core money movement, shared by the manual withdraw endpoint and the auto-flush
 * triggers. Atomically claims the balance (so only one caller can move a given
 * balance), transfers it to the connected account, restores the balance on a
 * Stripe failure, then writes the ledger event.
 *
 * Throws BALANCE_CHANGED when the atomic claim matched 0 rows (someone else won
 * the race, or the balance changed). Throws the Stripe error (AFTER restoring the
 * balance) if the transfer fails. Lets a ledger-write failure propagate WITHOUT
 * restoring — the money already moved correctly; only the audit row is missing.
 *
 * Idempotency: `withdraw_${userId}_${cents}` makes a retry of THIS call safe.
 * Cross-caller single-transfer is guaranteed by the atomic DB claim, NOT the key.
 * Known limitation (spec §5.1, deferred): two SEPARATE balances of the identical
 * cents amount within Stripe's ~24h key window can collide on the key; the atomic
 * claim still prevents double-pay, but the second transfer may replay. The robust
 * fix needs a persisted balance-event id (out of scope).
 */
export async function transferPendingBalance(
  stripe: Stripe,
  supabase: SupabaseClient,
  { table, userId, stripeAccountId, pendingBalance, source }: TransferPendingParams,
): Promise<{ transferId: string; amountCents: number }> {
  const amountCents = Math.round(pendingBalance * 100);

  // Atomic claim: zero the balance only if it still equals what we read.
  const { data: claimed, error: claimError } = await supabase
    .from(table)
    .update({ pending_balance: 0 })
    .eq("user_id", userId)
    .eq("pending_balance", pendingBalance)
    .select("pending_balance");

  if (claimError || !claimed?.length) {
    throw new Error(BALANCE_CHANGED);
  }

  const withdrawalType = source === "manual" ? "pending_balance" : "pending_balance_autoflush";
  const description = source === "manual"
    ? "DragonCandy platform wallet withdrawal"
    : "DragonCandy pending balance auto-payout";

  let transfer: { id: string };
  try {
    transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "usd",
      destination: stripeAccountId,
      description,
      metadata: { user_id: userId, withdrawal_type: withdrawalType },
    }, { idempotencyKey: `withdraw_${userId}_${amountCents}` });
  } catch (stripeError) {
    // Restore so a later trigger / manual retry can move it again.
    await supabase.from(table).update({ pending_balance: pendingBalance }).eq("user_id", userId);
    throw stripeError;
  }

  // After a successful transfer: a ledger failure must NOT restore the balance.
  await writePaymentEvent(supabase, {
    event_type: "transfer_created",
    entity_type: table === "creator_profiles" ? "collaboration" : "sponsorship",
    entity_id: userId,
    campaign_id: null,
    actor_id: userId,
    actor_role: table === "creator_profiles" ? "creator" : "business",
    amount_cents: amountCents,
    stripe_id: transfer.id,
    metadata: { type: source === "manual" ? "wallet_withdrawal" : "pending_balance_autoflush" },
  }, "[FLUSH-PENDING-BALANCE]");

  return { transferId: transfer.id, amountCents };
}

/**
 * Auto-flush entry point: given a Stripe connected-account id (from the
 * account.updated webhook or an onboarding-return status poll), release any held
 * pending_balance to that account — but only when the account is payout-ready and
 * a balance is actually owed. State-driven and idempotent: safe to call any number
 * of times, in any order. Never throws for the benign "lost the race" case;
 * re-throws genuine failures (e.g. Stripe) so the caller can log them.
 */
export async function flushPendingBalance(
  stripe: Stripe,
  supabase: SupabaseClient,
  stripeAccountId: string,
): Promise<{ flushed: boolean; amount: number; transferId?: string }> {
  if (!stripeAccountId) return { flushed: false, amount: 0 };

  // Resolve the owning profile by connected-account id: creator first, then business.
  // (Mirrors how the existing account.updated webhook resolves — creator_profiles
  // then business_profiles, not org_units.)
  const tables: ProfileTable[] = ["creator_profiles", "business_profiles"];
  let table: ProfileTable | null = null;
  let row: { user_id: string; stripe_onboarding_complete: boolean | null; pending_balance: number | null } | null = null;

  for (const t of tables) {
    const { data } = await supabase
      .from(t)
      .select("user_id, stripe_onboarding_complete, pending_balance")
      .eq("stripe_account_id", stripeAccountId)
      .maybeSingle();
    if (data?.user_id) { table = t; row = data; break; }
  }

  if (!table || !row) return { flushed: false, amount: 0 };

  const ready = row.stripe_onboarding_complete === true;
  const pending = row.pending_balance ?? 0;
  if (!ready || pending <= 0) return { flushed: false, amount: 0 };

  try {
    const { transferId, amountCents } = await transferPendingBalance(stripe, supabase, {
      table, userId: row.user_id, stripeAccountId, pendingBalance: pending, source: "autoflush",
    });
    console.warn(`[FLUSH-PENDING-BALANCE] Flushed ${amountCents}c for ${row.user_id} (${table}) tr=${transferId}`);
    return { flushed: true, amount: pending, transferId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === BALANCE_CHANGED) return { flushed: false, amount: 0 }; // lost the race; benign
    throw err; // genuine failure; balance already restored by the core. Caller must not fail its response.
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `"$HOME/.deno/bin/deno" test supabase/functions/_shared/flush-pending-balance.test.ts`
Expected: PASS — `ok | 8 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/flush-pending-balance.ts supabase/functions/_shared/flush-pending-balance.test.ts
git commit -m "feat(payments): shared flushPendingBalance routine + tests"
```

---

## Task 2: Refactor `withdraw-pending-balance` to delegate (DRY)

**Files:**
- Modify: `supabase/functions/withdraw-pending-balance/index.ts`

Goal: replace the inline atomic-claim → transfer → restore → ledger block (currently lines ~104–158) with a single `transferPendingBalance(..., source: 'manual')` call, leaving **everything else identical** — auth, the `stripe.accounts.retrieve` + `payouts_enabled` pre-check (lines ~92–102), all guards, and the HTTP success/error responses. `transferPendingBalance` reproduces the exact key, transfer metadata, description, and ledger row the manual path emits today, so observable behavior is unchanged. The `BALANCE_CHANGED` throw surfaces through the existing outer `catch` as the same 500 + message.

- [ ] **Step 1: Add the import**

At the top of `withdraw-pending-balance/index.ts`, add:
```ts
import { transferPendingBalance } from "../_shared/flush-pending-balance.ts";
```
Then **remove** the now-unused `import { writePaymentEvent } from "../_shared/payment-events.ts";` (the core handles the ledger write).

- [ ] **Step 2: Replace the inline block**

Replace lines ~104–158 (from `// Convert to cents for Stripe` through the end of the `writePaymentEvent(...)` call) with:

```ts
    // Move the money via the shared core (atomic claim → transfer → restore-on-error → ledger).
    // Behavior is identical to the previous inline implementation.
    const { transferId } = await transferPendingBalance(stripe, supabaseClient, {
      table: profileTable as "creator_profiles" | "business_profiles",
      userId: user.id,
      stripeAccountId,
      pendingBalance,
      source: "manual",
    });

    logStep("Withdrawal complete", { transferId, amountWithdrawn: pendingBalance });
```

Leave the existing success `return new Response(... transferId ... amount: pendingBalance ...)` block as-is (it references `transferId` and `pendingBalance`, both still in scope). Leave the outer `catch` returning 500 as-is.

- [ ] **Step 3: Sanity-check the diff**

Run: `git diff supabase/functions/withdraw-pending-balance/index.ts`
Verify: the `accounts.retrieve` / `payouts_enabled` pre-check and the `pendingBalance <= 0` guard are still present and unchanged; only the cents-calc-through-ledger block was replaced; `writePaymentEvent` import removed; `transferPendingBalance` import added.

- [ ] **Step 4: Type-check the Deno module graph**

Run: `"$HOME/.deno/bin/deno" check supabase/functions/withdraw-pending-balance/index.ts`
Expected: no errors. (First run fetches esm.sh deps; allow network.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/withdraw-pending-balance/index.ts
git commit -m "refactor(payments): withdraw-pending-balance delegates to shared core"
```

---

## Task 3: Wire `stripe-webhook` `account.updated` to auto-flush

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Add the import**

At the top with the other `_shared` imports:
```ts
import { flushPendingBalance } from "../_shared/flush-pending-balance.ts";
```

- [ ] **Step 2: Call the flush inside `account.updated`**

In the `case "account.updated":` block (lines ~370–391), after the creator/business `stripe_onboarding_complete` updates and **before** the closing `logStep(...)`/`break;`, insert:

```ts
        // Now payout-ready → release any held pending_balance. Never fail the
        // webhook on a flush error (the onboarding-return poll is the backstop),
        // so Stripe does not retry-storm.
        if (onboardingComplete) {
          try {
            const flush = await flushPendingBalance(stripe, supabase, account.id);
            if (flush.flushed) logStep("Auto-flushed pending balance", { accountId: account.id, amount: flush.amount, transferId: flush.transferId });
          } catch (flushErr) {
            logStep("Pending-balance auto-flush failed (non-fatal)", { accountId: account.id, error: String(flushErr) });
          }
        }
```

(The `stripe` client is already in scope in this handler, instantiated earlier in the function; confirm with `git grep -n "new Stripe" supabase/functions/stripe-webhook/index.ts` — it is created once near the top.)

- [ ] **Step 3: Type-check**

Run: `"$HOME/.deno/bin/deno" check supabase/functions/stripe-webhook/index.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(payments): auto-flush pending balance on account.updated webhook"
```

---

## Task 4: Wire `check-creator-payout-status` to auto-flush

**Files:**
- Modify: `supabase/functions/check-creator-payout-status/index.ts`

- [ ] **Step 1: Add the import**
```ts
import { flushPendingBalance } from "../_shared/flush-pending-balance.ts";
```

- [ ] **Step 2: Call the flush after the onboarding flip**

Immediately after the `if (onboardingComplete !== creatorProfile.stripe_onboarding_complete) { ... }` block (ends ~line 86) and before the balance-retrieve block (~line 88), insert:

```ts
    // Onboarding-return backstop: if payout-ready, release any held pending_balance.
    // Best-effort — never fail the status response the frontend depends on.
    if (onboardingComplete) {
      try {
        const flush = await flushPendingBalance(stripe, supabaseClient, creatorProfile.stripe_account_id);
        if (flush.flushed) logStep("Auto-flushed pending balance", { amount: flush.amount, transferId: flush.transferId });
      } catch (flushErr) {
        logStep("Pending-balance auto-flush failed (non-fatal)", { error: String(flushErr) });
      }
    }
```

Note (cosmetic, acceptable): the JSON response's `platformPendingBalance` is read from the initial `creatorProfile.pending_balance` select, so after a successful flush it briefly reports the pre-flush figure until the next poll. It self-corrects; do not add extra plumbing for it (YAGNI).

- [ ] **Step 3: Type-check**

Run: `"$HOME/.deno/bin/deno" check supabase/functions/check-creator-payout-status/index.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/check-creator-payout-status/index.ts
git commit -m "feat(payments): auto-flush on creator onboarding-return poll"
```

---

## Task 5: Wire `check-restaurant-payout-status` to auto-flush

**Files:**
- Modify: `supabase/functions/check-restaurant-payout-status/index.ts`

- [ ] **Step 1: Add the import**
```ts
import { flushPendingBalance } from "../_shared/flush-pending-balance.ts";
```

- [ ] **Step 2: Call the flush after the onboarding write**

After the onboarding-status write block (the `if (org_unit_id) { ... } else if (...) { ... }` that ends ~line 170) and before the balance-retrieve block (~line 172), insert:

```ts
    // Onboarding-return backstop: if payout-ready, release any held pending_balance.
    // Best-effort — never fail the status response.
    if (onboardingComplete) {
      try {
        const flush = await flushPendingBalance(stripe, supabaseClient, stripeAccountId);
        if (flush.flushed) logStep("Auto-flushed pending balance", { amount: flush.amount, transferId: flush.transferId });
      } catch (flushErr) {
        logStep("Pending-balance auto-flush failed (non-fatal)", { error: String(flushErr) });
      }
    }
```

(`stripeAccountId` and `stripe` are both in scope here. `pending_balance` lives on `business_profiles`; `flushPendingBalance` resolves it from the connected-account id, consistent with the webhook.)

- [ ] **Step 3: Type-check**

Run: `"$HOME/.deno/bin/deno" check supabase/functions/check-restaurant-payout-status/index.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/check-restaurant-payout-status/index.ts
git commit -m "feat(payments): auto-flush on restaurant onboarding-return poll"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the shared-lib unit tests**

Run: `"$HOME/.deno/bin/deno" test supabase/functions/_shared/flush-pending-balance.test.ts`
Expected: `ok | 8 passed | 0 failed`.

- [ ] **Step 2: Type-check every touched Deno function**

Run:
```bash
"$HOME/.deno/bin/deno" check \
  supabase/functions/_shared/flush-pending-balance.ts \
  supabase/functions/withdraw-pending-balance/index.ts \
  supabase/functions/stripe-webhook/index.ts \
  supabase/functions/check-creator-payout-status/index.ts \
  supabase/functions/check-restaurant-payout-status/index.ts
```
Expected: no errors.

- [ ] **Step 3: Frontend gates still green (prove `src/` untouched)**

Run: `npm run typecheck` → exit 0. Then `npm run build` → exit 0, `✓ built`.

- [ ] **Step 4: Confirm no stray vitest pickup**

Run: `npx vitest run supabase/functions/_shared/flush-pending-balance.test.ts`
Expected: "No test files found" (the `supabase/**` exclude in `vite.config.ts` keeps Deno tests out of CI's `verify` job).

- [ ] **Step 5: Push the branch and open the PR**

```bash
git push -u origin worktree-auto-flush-balance
gh pr create --title "feat(payments): auto-flush stranded pending_balance on payout-readiness" --body "<summary + link to spec>"
```
The CI `verify` + `smoke` checks must pass before merge (Deno files are excluded from `verify`; this PR adds no `src/` behavior, so both should be green). Use the project's standard merge path.

---

## Deploy (DEFERRED to the user's deploy session — NOT part of code execution)

Mirror the Outstand-webhook deploy discipline. **Do not run these during plan execution.**

1. Redeploy via Supabase MCP `deploy_edge_function` to **staging** (`mhffqrawgizhprbobcta`) first, then **prod** (`zocahiffooqdybdhguqv`): `stripe-webhook`, `check-creator-payout-status`, `check-restaurant-payout-status`, `withdraw-pending-balance`. Each deploy bundles the new `_shared/flush-pending-balance.ts`. No new secret, migration, or `config.toml` change.
2. Staging validation: with a test creator that has `pending_balance > 0` and an incomplete Connect account, complete onboarding (or trigger an `account.updated`) and confirm the balance zeroes and a `transfer_created` / `pending_balance_autoflush` `payment_events` row appears. Re-fire the webhook to confirm idempotent no-op (no second transfer).
3. Manual-withdraw regression on staging: confirm the existing Withdraw button still returns its success JSON and transfers correctly (the refactor must be invisible).
4. Promote to prod; spot-check one real onboarding completion or read `get_logs` for the flush log line.

## Out of scope (per spec)

- Parked DragonShare boosts (need a re-engagement notification — separate spec).
- `pg_cron` backstop sweep (deferrable precisely because the routine is idempotent).
- New push/email notification on auto-payout (ledger event only, matching manual withdraw).
- The robust idempotency-key discriminator (needs a persisted balance-event id).
