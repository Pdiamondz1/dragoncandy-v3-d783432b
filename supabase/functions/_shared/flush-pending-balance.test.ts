import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BALANCE_CHANGED,
  buildFlushTransferParams,
  executeFlushTransfer,
  flushPendingBalance,
  isDefiniteFailure,
  transferPendingBalance,
} from "./flush-pending-balance.ts";

type Resp = { data: any; error: any };

// Fixed flush uuid the claim RPC returns by default. The idempotency key is therefore
// `flush_${FLUSH_ID}` — durable + per-flush, not the old amount-based `withdraw_${user}_${cents}`.
const FLUSH_ID = "flush-fixed-uuid-0001";

// Fake supabase.
//  - `rpc(fn, args)` dispatches BY FUNCTION NAME, recording every call in `rpcCalls` and returning a
//    canned response per fn. Default: claim_pending_balance_flush → { data: FLUSH_ID }, everything else
//    → { data: null }. Override any fn via `opts.rpc` (a Resp or a () => Resp for per-call values).
//  - `from(t).select()` / `.insert()` still serve the profile-resolution SELECT (flushPendingBalance)
//    and the payment_events ledger INSERT (writePaymentEvent). There is NO `.update()` claim anymore.
function fakeSupabase(opts: {
  byTable?: Record<string, { select?: Resp; insert?: Resp }>;
  rpc?: Record<string, Resp | (() => Resp)>;
} = {}) {
  const byTable = opts.byTable ?? {};
  const rpcCanned = opts.rpc ?? {};
  const inserted: any[] = [];
  const rpcCalls: any[] = [];
  const get = (t: string) => byTable[t] ?? {};
  const selChain = (res: Resp): any => {
    const c: any = { eq: () => c, maybeSingle: () => Promise.resolve(res), then: (r: any) => r(res) };
    return c;
  };
  const defaultRpc = (fn: string): Resp =>
    fn === "claim_pending_balance_flush" ? { data: FLUSH_ID, error: null }
    : fn === "confirm_pending_balance_flush" ? { data: true, error: null }   // real RPC returns "did it transition"
    : { data: null, error: null };
  const client: any = {
    inserted,
    rpcCalls,
    rpc: (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      const canned = rpcCanned[fn];
      const res = canned === undefined ? defaultRpc(fn) : (typeof canned === "function" ? canned() : canned);
      return Promise.resolve(res);
    },
    from: (t: string) => ({
      select: () => selChain(get(t).select ?? { data: null, error: null }),
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

// ─────────────────────────── flushPendingBalance (pre-existing, reworked) ───────────────────────────

Deno.test("flush: ready creator with balance -> one transfer, zeroed, ledgered", async () => {
  const sb = fakeSupabase({ byTable: { creator_profiles: { select: readyCreator } } });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_1");
  assertEquals(res.flushed, true);
  assertEquals(res.amount, 12.5);
  assertEquals(stripe.calls.length, 1);
  assertEquals(stripe.calls[0].params.amount, 1250);              // dollars -> cents
  assertEquals(stripe.calls[0].params.destination, "acct_1");
  assertEquals(stripe.calls[0].opts.idempotencyKey, `flush_${FLUSH_ID}`);
  assertEquals(sb.rpcCalls[0].fn, "claim_pending_balance_flush"); // claim is rpcCalls[0]
  assertEquals(sb.rpcCalls[1].fn, "confirm_pending_balance_flush");
  assertEquals(sb.inserted.length, 1);                            // ledger row written
  assertEquals(sb.inserted[0].row.event_type, "transfer_created");
  assertEquals(sb.inserted[0].row.entity_type, "collaboration");
});

Deno.test("flush: zero balance -> no transfer", async () => {
  const sb = fakeSupabase({ byTable: { creator_profiles: { select: { data: { user_id: "u1", stripe_onboarding_complete: true, pending_balance: 0 }, error: null } } } });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_1");
  assertEquals(res.flushed, false);
  assertEquals(stripe.calls.length, 0);
});

Deno.test("flush: not onboarded -> no transfer", async () => {
  const sb = fakeSupabase({ byTable: { creator_profiles: { select: { data: { user_id: "u1", stripe_onboarding_complete: false, pending_balance: 30 }, error: null } } } });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_1");
  assertEquals(res.flushed, false);
  assertEquals(stripe.calls.length, 0);
});

Deno.test("flush: lost the atomic claim race -> benign no-op, no transfer", async () => {
  // The claim is now an RPC that returns NULL when it loses the race / balance changed.
  const sb = fakeSupabase({ byTable: { creator_profiles: { select: readyCreator } }, rpc: { claim_pending_balance_flush: { data: null, error: null } } });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_1");
  assertEquals(res.flushed, false);
  assertEquals(stripe.calls.length, 0);                          // NULL claim short-circuits before Stripe
});

Deno.test("flush: Stripe throws a plain error -> AMBIGUOUS (bump, no restore, no ledger), propagates", async () => {
  const sb = fakeSupabase({ byTable: { creator_profiles: { select: readyCreator } } });
  const stripe = fakeStripe(() => { throw new Error("stripe down"); });
  await assertRejects(() => flushPendingBalance(stripe, sb, "acct_1"), Error, "stripe down");
  assertEquals(sb.rpcCalls[0].fn, "claim_pending_balance_flush");
  assertEquals(sb.rpcCalls[1].fn, "bump_flush_attempt");         // ambiguous → bump, NOT fail
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "fail_pending_balance_flush"), false);
  assertEquals(sb.inserted.length, 0);                          // no ledger row on failure
});

Deno.test("flush: unknown account -> no-op", async () => {
  const sb = fakeSupabase({});                                  // both tables resolve null
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_unknown");
  assertEquals(res.flushed, false);
  assertEquals(stripe.calls.length, 0);
});

Deno.test("flush: business profile -> sponsorship/business ledger mapping", async () => {
  const sb = fakeSupabase({
    byTable: {
      creator_profiles: { select: { data: null, error: null } },
      business_profiles: { select: { data: { user_id: "b1", stripe_onboarding_complete: true, pending_balance: 5 }, error: null } },
    },
  });
  const stripe = fakeStripe();
  const res = await flushPendingBalance(stripe, sb, "acct_b");
  assertEquals(res.flushed, true);
  assertEquals(sb.inserted[0].row.entity_type, "sponsorship");
  assertEquals(sb.inserted[0].row.actor_role, "business");
});

// ─────────────────────── transferPendingBalance (pre-existing, reworked) ───────────────────────

Deno.test("transferPendingBalance: manual source -> flush_${id} key + metadata + flush_id present", async () => {
  const sb = fakeSupabase({});
  const stripe = fakeStripe();
  const out = await transferPendingBalance(stripe, sb, {
    table: "creator_profiles", userId: "u9", stripeAccountId: "acct_9", pendingBalance: 7, source: "manual",
  });
  assertEquals(out.amountCents, 700);
  assertEquals(stripe.calls[0].opts.idempotencyKey, `flush_${FLUSH_ID}`);
  assertEquals(stripe.calls[0].params.metadata.withdrawal_type, "pending_balance");
  assertEquals(stripe.calls[0].params.metadata.flush_id, FLUSH_ID);   // newly present
  assertEquals(sb.inserted[0].row.metadata.type, "wallet_withdrawal");
  assertEquals(sb.inserted[0].row.metadata.flush_id, FLUSH_ID);
  assertEquals(out.transferId, "tr_test");
});

Deno.test("transfer: plain Stripe error -> AMBIGUOUS (bump, NO restore, NO ledger), propagates", async () => {
  const sb = fakeSupabase({});
  const stripe = fakeStripe(() => { throw new Error("stripe down"); });
  await assertRejects(
    () => transferPendingBalance(stripe, sb, {
      table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 9.25, source: "autoflush",
    }),
    Error,
    "stripe down",
  );
  assertEquals(sb.rpcCalls[0].fn, "claim_pending_balance_flush");
  assertEquals(sb.rpcCalls[1].fn, "bump_flush_attempt");                       // ambiguous → bump
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "fail_pending_balance_flush"), false);
  assertEquals(sb.inserted.length, 0);                                        // no ledger row
});

Deno.test("transfer: DEFINITE Stripe failure (400 invalid request) -> fail_pending_balance_flush(restore) then throw", async () => {
  const sb = fakeSupabase({});
  const stripe = fakeStripe(() => { throw { type: "StripeInvalidRequestError", statusCode: 400, message: "No such destination" }; });
  let threw = false;
  try {
    await transferPendingBalance(stripe, sb, {
      table: "creator_profiles", userId: "u1", stripeAccountId: "acct_bad", pendingBalance: 4, source: "autoflush",
    });
  } catch (e: any) {
    threw = true;
    assertEquals(String(e?.message ?? e).includes("No such destination"), true);
  }
  assertEquals(threw, true);
  assertEquals(sb.rpcCalls[0].fn, "claim_pending_balance_flush");
  assertEquals(sb.rpcCalls[1].fn, "fail_pending_balance_flush");
  assertEquals(sb.rpcCalls[1].args.p_restore, true);
  assertEquals(sb.rpcCalls[1].args.p_flush_id, FLUSH_ID);
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "bump_flush_attempt"), false);
  assertEquals(sb.inserted.length, 0);
});

Deno.test("transfer: ledger write fails AFTER transfer -> balance NOT restored", async () => {
  const sb = fakeSupabase({ byTable: { payment_events: { insert: { data: null, error: { message: "ledger boom" } } } } });
  const stripe = fakeStripe();
  await assertRejects(
    () => transferPendingBalance(stripe, sb, {
      table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 4, source: "autoflush",
    }),
    Error,
    "ledger boom",
  );
  // rpcCalls = [claim, confirm]; the transfer succeeded, so NO restore (no fail/bump).
  assertEquals(sb.rpcCalls[0].fn, "claim_pending_balance_flush");
  assertEquals(sb.rpcCalls[1].fn, "confirm_pending_balance_flush");
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "fail_pending_balance_flush" || c.fn === "bump_flush_attempt"), false);
  assertEquals(stripe.calls.length, 1);                                       // transfer was made
});

// ─────────────────────────────── new: buildFlushTransferParams ───────────────────────────────

Deno.test("buildFlushTransferParams: manual shape", () => {
  const p = buildFlushTransferParams({ id: "f1", user_id: "u1", profile_type: "creator", stripe_account_id: "acct_1", amount_cents: 1250, source: "manual" });
  assertEquals(p.amount, 1250);
  assertEquals(p.currency, "usd");
  assertEquals(p.destination, "acct_1");
  assertEquals(p.description, "DragonCandy platform wallet withdrawal");
  assertEquals(p.metadata.user_id, "u1");
  assertEquals(p.metadata.withdrawal_type, "pending_balance");
  assertEquals(p.metadata.flush_id, "f1");
});

Deno.test("buildFlushTransferParams: autoflush shape", () => {
  const p = buildFlushTransferParams({ id: "f2", user_id: "u2", profile_type: "business", stripe_account_id: "acct_2", amount_cents: 500, source: "autoflush" });
  assertEquals(p.amount, 500);
  assertEquals(p.currency, "usd");
  assertEquals(p.destination, "acct_2");
  assertEquals(p.description, "DragonCandy pending balance auto-payout");
  assertEquals(p.metadata.user_id, "u2");
  assertEquals(p.metadata.withdrawal_type, "pending_balance_autoflush");
  assertEquals(p.metadata.flush_id, "f2");
});

// ────────────── new: distinct claims for identical cents -> distinct keys (the bug this closes) ──────────────

Deno.test("two flushes, same user + identical cents, distinct claims -> DISTINCT idempotency keys", async () => {
  let n = 0;
  const ids = ["flush-aaaa", "flush-bbbb"];
  const sb = fakeSupabase({ rpc: { claim_pending_balance_flush: () => ({ data: ids[n++], error: null }) } });
  const stripe = fakeStripe();
  await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 10, source: "manual" });
  await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 10, source: "manual" });
  assertEquals(stripe.calls.length, 2);
  const k1 = stripe.calls[0].opts.idempotencyKey;
  const k2 = stripe.calls[1].opts.idempotencyKey;
  assertEquals(k1, "flush_flush-aaaa");
  assertEquals(k2, "flush_flush-bbbb");
  assert(k1 !== k2);   // the under-pay bug: identical cents no longer collide on the key
});

// ─────────────────────── new: definite vs ambiguous classification edges ───────────────────────

Deno.test("transfer: 500-class error -> AMBIGUOUS (bump, no restore)", async () => {
  const sb = fakeSupabase({});
  const stripe = fakeStripe(() => { throw { type: "StripeAPIError", statusCode: 500, message: "server error" }; });
  let threw = false;
  try {
    await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 6, source: "autoflush" });
  } catch { threw = true; }
  assertEquals(threw, true);
  assertEquals(sb.rpcCalls[1].fn, "bump_flush_attempt");
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "fail_pending_balance_flush"), false);
});

Deno.test("transfer: idempotency-conflict error (type) -> AMBIGUOUS (no restore)", async () => {
  const sb = fakeSupabase({});
  const stripe = fakeStripe(() => { throw { type: "StripeIdempotencyError", statusCode: 400, message: "Keys for idempotent requests..." }; });
  let threw = false;
  try {
    await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 6, source: "autoflush" });
  } catch { threw = true; }
  assertEquals(threw, true);
  assertEquals(sb.rpcCalls[1].fn, "bump_flush_attempt");                       // conflict caught before the 4xx check
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "fail_pending_balance_flush"), false);
});

Deno.test("transfer: idempotency-conflict by message -> AMBIGUOUS (no restore)", async () => {
  const sb = fakeSupabase({});
  // A StripeInvalidRequestError whose message is the idempotency-reuse string must stay ambiguous.
  const stripe = fakeStripe(() => { throw { type: "StripeInvalidRequestError", statusCode: 400, message: "Keys for idempotent requests can only be used with the same parameters they were first used with." }; });
  let threw = false;
  try {
    await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 6, source: "autoflush" });
  } catch { threw = true; }
  assertEquals(threw, true);
  assertEquals(sb.rpcCalls[1].fn, "bump_flush_attempt");                       // message guard beats the 4xx branch
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "fail_pending_balance_flush"), false);
});

// ─────────────────────────────── new: stuck alert (fileStuckFinding) ───────────────────────────────

Deno.test("stuck flush files EXACTLY ONE well-formed aios finding", async () => {
  const calls: { url: string; init: any }[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((url: any, init?: any) => { calls.push({ url: String(url), init }); return Promise.resolve(new Response("{}", { status: 200 })); }) as any;
  try {
    const sb = fakeSupabase({ rpc: { bump_flush_attempt: { data: "stuck", error: null } } });
    const stripe = fakeStripe(() => { throw new Error("connection reset"); });   // ambiguous → bump → 'stuck'
    let threw = false;
    try {
      await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 3, source: "autoflush" });
    } catch { threw = true; }
    assertEquals(threw, true);
    assertEquals(calls.length, 1);                                             // fired exactly once
    const body = JSON.parse(calls[0].init.body);
    assertEquals(body.type, "findings");                                       // well-formed envelope, not a flat 400ing payload
    const f = body.payload.findings[0];
    assert(typeof f.title === "string" && f.title.length > 0);
    assert(typeof f.summary_md === "string" && f.summary_md.length > 0);
    assertEquals(f.fingerprint, `payout:flush:stuck:${FLUSH_ID}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("bump that stays 'claimed' (not stuck) files NO finding", async () => {
  const calls: any[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((url: any, init?: any) => { calls.push({ url, init }); return Promise.resolve(new Response("{}", { status: 200 })); }) as any;
  try {
    const sb = fakeSupabase({ rpc: { bump_flush_attempt: { data: "claimed", error: null } } });
    const stripe = fakeStripe(() => { throw new Error("connection reset"); });
    let threw = false;
    try {
      await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 3, source: "autoflush" });
    } catch { threw = true; }
    assertEquals(threw, true);
    assertEquals(calls.length, 0);                                             // no alert below the cap
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ─────────────────────────────── new: BALANCE_CHANGED + executeFlushTransfer ───────────────────────────────

Deno.test("transferPendingBalance: NULL claim -> throws BALANCE_CHANGED, no Stripe call", async () => {
  const sb = fakeSupabase({ rpc: { claim_pending_balance_flush: { data: null, error: null } } });
  const stripe = fakeStripe();
  await assertRejects(
    () => transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 5, source: "manual" }),
    Error,
    BALANCE_CHANGED,
  );
  assertEquals(stripe.calls.length, 0);
});

Deno.test("executeFlushTransfer: happy path -> flush_${id} key, confirm, ledger (no claim of its own)", async () => {
  const sb = fakeSupabase({});
  const stripe = fakeStripe();
  const out = await executeFlushTransfer(stripe, sb, { id: "f9", user_id: "u1", profile_type: "creator", stripe_account_id: "acct_1", amount_cents: 900, source: "manual" });
  assertEquals(out.transferId, "tr_test");
  assertEquals(out.amountCents, 900);
  assertEquals(stripe.calls[0].opts.idempotencyKey, "flush_f9");
  assertEquals(sb.rpcCalls[0].fn, "confirm_pending_balance_flush");           // executeFlushTransfer does NOT claim
  assertEquals(sb.inserted[0].row.stripe_id, "tr_test");
  assertEquals(sb.inserted[0].row.metadata.flush_id, "f9");
});

Deno.test("executeFlushTransfer: confirm error -> throws BEFORE ledger write (row stays claimed for replay)", async () => {
  const sb = fakeSupabase({ rpc: { confirm_pending_balance_flush: { data: null, error: { message: "confirm boom" } }, bump_flush_attempt: { data: "claimed", error: null } } });
  const stripe = fakeStripe();
  let threw = false;
  try {
    await executeFlushTransfer(stripe, sb, { id: "f9", user_id: "u1", profile_type: "creator", stripe_account_id: "acct_1", amount_cents: 900, source: "manual" });
  } catch (e: any) {
    threw = true;
    assertEquals(String(e?.message ?? e).includes("confirm_pending_balance_flush failed"), true);
  }
  assertEquals(threw, true);
  assertEquals(stripe.calls.length, 1);                                       // money moved
  assertEquals(sb.inserted.length, 0);                                        // but NO ledger row (thrown first)
});

Deno.test("executeFlushTransfer: confirm no-op (already confirmed by a concurrent run) -> NO duplicate ledger row", async () => {
  const sb = fakeSupabase({ rpc: { confirm_pending_balance_flush: { data: false, error: null } } });   // 0 rows transitioned
  const stripe = fakeStripe();
  const out = await executeFlushTransfer(stripe, sb, { id: "f9", user_id: "u1", profile_type: "creator", stripe_account_id: "acct_1", amount_cents: 900, source: "manual" });
  assertEquals(out.transferId, "tr_test");                                    // transfer replayed the same flush_${id} key
  assertEquals(out.amountCents, 900);
  assertEquals(sb.rpcCalls[0].fn, "confirm_pending_balance_flush");
  assertEquals(sb.inserted.length, 0);                                        // confirm didn't transition -> skip ledger (no double-count)
});

Deno.test("confirm failure -> bump (bounds re-drive by the cap), no restore, throws", async () => {
  const sb = fakeSupabase({ rpc: { confirm_pending_balance_flush: { data: null, error: { message: "db down" } }, bump_flush_attempt: { data: "claimed", error: null } } });
  const stripe = fakeStripe();
  let threw = false;
  try {
    await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 9, source: "autoflush" });
  } catch { threw = true; }
  assertEquals(threw, true);
  // rpcCalls = [claim, confirm, bump]; the confirm failure must be BOUNDED by the cap, not re-driven forever.
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "bump_flush_attempt"), true);
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "fail_pending_balance_flush"), false);   // money moved → NO restore
  assertEquals(sb.inserted.length, 0);
});

Deno.test("confirm failure that hits the cap (bump -> 'stuck') fires the stuck alert", async () => {
  const calls: any[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((url: any, init?: any) => { calls.push({ url, init }); return Promise.resolve(new Response("{}", { status: 200 })); }) as any;
  try {
    const sb = fakeSupabase({ rpc: { confirm_pending_balance_flush: { data: null, error: { message: "db down" } }, bump_flush_attempt: { data: "stuck", error: null } } });
    const stripe = fakeStripe();
    let threw = false;
    try {
      await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 9, source: "autoflush" });
    } catch { threw = true; }
    assertEquals(threw, true);
    assertEquals(calls.length, 1);                                            // stuck alert fired
    const body = JSON.parse(calls[0].init.body);
    assertEquals(body.type, "findings");
    assertEquals(body.payload.findings[0].fingerprint, `payout:flush:stuck:${FLUSH_ID}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ─────────────────────────── new: isDefiniteFailure direct unit tests (money decision) ───────────────────────────

Deno.test("isDefiniteFailure: classifies each Stripe error shape", () => {
  // raw.* fallbacks: a 400 invalid-request nested under `raw` is DEFINITE.
  assertEquals(isDefiniteFailure({ raw: { type: "StripeInvalidRequestError", statusCode: 400 } }), true);
  // 4xx boundary: 499 definite, 500 ambiguous.
  assertEquals(isDefiniteFailure({ type: "StripeInvalidRequestError", statusCode: 499 }), true);
  assertEquals(isDefiniteFailure({ type: "StripeInvalidRequestError", statusCode: 500 }), false);
  // invalid-request with NO statusCode (→ 0) is NOT a definite 4xx → ambiguous (don't restore).
  assertEquals(isDefiniteFailure({ type: "StripeInvalidRequestError" }), false);
  // idempotency conflict (by type) → ambiguous.
  assertEquals(isDefiniteFailure({ type: "StripeIdempotencyError", statusCode: 400 }), false);
  // idempotency conflict (by message, even under a 4xx invalid-request type) → ambiguous.
  assertEquals(isDefiniteFailure({ type: "StripeInvalidRequestError", statusCode: 400, message: "Keys for idempotent requests can only be used with the same parameters they were first used with." }), false);
  // connection/unknown error (no type) → ambiguous.
  assertEquals(isDefiniteFailure(new Error("connection reset")), false);
});

// ─────────────────────────── new: fractional dollars -> cents conversion ───────────────────────────

Deno.test("transferPendingBalance: fractional balance -> Math.round(*100) cents", async () => {
  const sb = fakeSupabase({});
  const stripe = fakeStripe();
  const out = await transferPendingBalance(stripe, sb, { table: "creator_profiles", userId: "u1", stripeAccountId: "acct_1", pendingBalance: 1.1, source: "manual" });
  assertEquals(out.amountCents, 110);
  assertEquals(stripe.calls[0].params.amount, 110);
  assertEquals(sb.rpcCalls[0].args.p_amount_cents, 110);
});
