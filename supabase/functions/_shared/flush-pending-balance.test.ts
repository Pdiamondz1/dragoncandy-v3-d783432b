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
  assertEquals(out.transferId, "tr_test");
});
