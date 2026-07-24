import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyWalletFirstPayout } from "./wallet-first.ts";

// Mirrors the fake-supabase-by-rpc-name / fake-stripe style of _shared/flush-pending-balance.test.ts,
// extended with `.update().eq()` (used by finalizePayoutState). Tests applyWalletFirstPayout — the single
// wallet-first payout body — by dependency injection, letting the REAL flushPendingBalance run against the
// fakes (its own internals are covered by flush-pending-balance.test.ts) so we can assert flush gating.

type Resp = { data: any; error: any };
const FLUSH_ID = "flush-fixed-uuid-0001";

// A creator profile the (real) flush resolves by stripe_account_id when the payout is onboarded.
const readyCreator = (pending: number): Resp => ({
  data: { user_id: "creator-1", stripe_onboarding_complete: true, pending_balance: pending },
  error: null,
});

function fakeSupabase(opts: {
  byTable?: Record<string, { select?: Resp; insert?: Resp; update?: Resp }>;
  rpc?: Record<string, Resp | (() => Resp)>;
} = {}) {
  const byTable = opts.byTable ?? {};
  const rpcCanned = opts.rpc ?? {};
  const inserted: any[] = [];
  const updated: any[] = [];
  const rpcCalls: any[] = [];
  const get = (t: string) => byTable[t] ?? {};
  const selChain = (res: Resp): any => {
    const c: any = { eq: () => c, maybeSingle: () => Promise.resolve(res), single: () => Promise.resolve(res), then: (r: any) => r(res) };
    return c;
  };
  const defaultRpc = (fn: string): Resp =>
    fn === "credit_pending_balance_for_payout" ? { data: "credited", error: null }
    : fn === "claim_pending_balance_flush" ? { data: FLUSH_ID, error: null }
    : fn === "confirm_pending_balance_flush" ? { data: true, error: null }
    : { data: null, error: null };
  const client: any = {
    inserted,
    updated,
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
      update: (row: any) => {
        updated.push({ table: t, row });
        const res = get(t).update ?? { error: null };
        const c: any = { eq: () => c, then: (r: any) => r(res) };
        return c;
      },
    }),
  };
  return client;
}

function fakeStripe(onTransfer?: (p: any, o: any) => any) {
  const calls: any[] = [];
  return {
    calls,
    transfers: {
      create: (p: any, o: any) => { calls.push({ params: p, opts: o }); return onTransfer ? onTransfer(p, o) : Promise.resolve({ id: "tr_test", amount: p.amount }); },
    },
  } as any;
}

const baseDeps = {
  collaborationId: "collab-1",
  campaignId: "camp-1",
  creatorId: "creator-1",
  callerId: "owner-1" as string | null,
  creatorPayout: 80,
  stripeAccountId: "acct_1" as string | null,
};

const collabEventTypes = (sb: any) =>
  sb.inserted
    .filter((i: any) => i.row.entity_type === "collaboration" && i.row.entity_id === "collab-1")
    .map((i: any) => i.row.event_type);

// ───────────────────────── onboarded + fresh credit → credit, 4 events, flush, finalize ─────────────────────────

Deno.test("onboarded fresh credit: credits, writes the 4 collaboration events, flushes exactly-once, finalizes", async () => {
  const sb = fakeSupabase({ byTable: { creator_profiles: { select: readyCreator(80) } } });
  const stripe = fakeStripe();
  const res = await applyWalletFirstPayout({ ...baseDeps, supabase: sb, stripe, creatorPayoutReady: true });

  // Money-in-DB step
  const credit = sb.rpcCalls.find((c: any) => c.fn === "credit_pending_balance_for_payout");
  assert(credit, "credit_pending_balance_for_payout must be called");
  assertEquals(credit.args, { p_collaboration_id: "collab-1", p_user_id: "creator-1", p_amount: 80 });

  // Exactly the 4 collaboration-keyed events, in order
  assertEquals(collabEventTypes(sb), ["content_approved", "payment_release_initiated", "payment_released", "payout_pending_wallet"]);

  // The flush ran: a wallet-level (user-keyed) transfer_created is written, keyed flush_${id}, NEVER payout_
  const flushEvent = sb.inserted.find((i: any) => i.row.entity_id === "creator-1" && i.row.event_type === "transfer_created");
  assert(flushEvent, "flush writes a user-keyed transfer_created");
  assertEquals(flushEvent.row.metadata.type, "pending_balance_autoflush");
  assertEquals(stripe.calls.length, 1);
  assert(String(stripe.calls[0].opts.idempotencyKey).startsWith("flush_"), "transfer keyed on flush_${id}");
  assert(!String(stripe.calls[0].opts.idempotencyKey).startsWith("payout_"), "NO direct payout_ transfer");

  // Finalize ran; success shape
  assert(sb.updated.some((u: any) => u.table === "campaign_collaborations"));
  assert(sb.updated.some((u: any) => u.table === "campaigns"));
  assertEquals(res.status, 200);
  assertEquals(res.body.success, true);
  assertEquals(res.body.method, "wallet_flush");
});

// ───────────────────────── not-onboarded + fresh credit → 4 events, NO flush, finalize ─────────────────────────

Deno.test("not-onboarded fresh credit: 4 events, NO flush/transfer, finalizes", async () => {
  const sb = fakeSupabase();
  const stripe = fakeStripe();
  const res = await applyWalletFirstPayout({ ...baseDeps, supabase: sb, stripe, stripeAccountId: null, creatorPayoutReady: false });

  assertEquals(collabEventTypes(sb), ["content_approved", "payment_release_initiated", "payment_released", "payout_pending_wallet"]);
  assertEquals(stripe.calls.length, 0);
  assertEquals(sb.rpcCalls.some((c: any) => c.fn === "claim_pending_balance_flush"), false);
  assertEquals(res.status, 200);
  assertEquals(res.body.success, true);
  assertEquals(res.body.method, "pending_balance");
});

// ───────────────────────── concurrent re-entry (credit → 'already') → NO ledger writes, finalize-only ─────────────────────────

Deno.test("concurrent re-entry ('already'): NO ledger writes, no new transfer, still finalizes", async () => {
  // ready=true but the wallet is already flushed (pending 0) → flush is invoked but a benign no-op.
  const sb = fakeSupabase({
    byTable: { creator_profiles: { select: readyCreator(0) } },
    rpc: { credit_pending_balance_for_payout: { data: "already", error: null } },
  });
  const stripe = fakeStripe();
  const res = await applyWalletFirstPayout({ ...baseDeps, supabase: sb, stripe, creatorPayoutReady: true });

  assertEquals(collabEventTypes(sb).length, 0);       // !alreadyCredited gate skips all ledger writes
  assertEquals(sb.inserted.length, 0);
  assertEquals(stripe.calls.length, 0);               // nothing to flush
  assert(sb.updated.some((u: any) => u.table === "campaign_collaborations")); // finalize still runs
  assertEquals(res.status, 200);
  assertEquals(res.body.success, true);
});

// ───────────────────────── flush throws → swallowed (best-effort), still success ─────────────────────────

Deno.test("flush throws: swallowed best-effort, credit events written, finalize + success", async () => {
  const sb = fakeSupabase({ byTable: { creator_profiles: { select: readyCreator(80) } } });
  const stripe = fakeStripe(() => { throw new Error("stripe down"); });   // ambiguous → bump → throws up through flush
  const res = await applyWalletFirstPayout({ ...baseDeps, supabase: sb, stripe, creatorPayoutReady: true });

  assertEquals(collabEventTypes(sb), ["content_approved", "payment_release_initiated", "payment_released", "payout_pending_wallet"]);
  assertEquals(stripe.calls.length, 1);               // the failed attempt
  assertEquals(res.status, 200);                      // flush failure does NOT fail the payout (money safe in wallet)
  assertEquals(res.body.success, true);
});

// ───────────────────────── credit RPC error → throws, nothing moved ─────────────────────────

Deno.test("credit RPC error: throws, no ledger, no finalize", async () => {
  const sb = fakeSupabase({ rpc: { credit_pending_balance_for_payout: { data: null, error: { message: "db down" } } } });
  const stripe = fakeStripe();
  await assertRejects(
    () => applyWalletFirstPayout({ ...baseDeps, supabase: sb, stripe, creatorPayoutReady: false }),
    Error,
    "Failed to credit pending balance",
  );
  assertEquals(sb.inserted.length, 0);
  assertEquals(sb.updated.length, 0);
  assertEquals(stripe.calls.length, 0);
});

// ───────────────────────── finalize fails → 500 { needsRetry } ─────────────────────────

Deno.test("finalize fails: 500 with needsRetry (money already durably credited)", async () => {
  const sb = fakeSupabase({
    byTable: { campaign_collaborations: { update: { data: null, error: { message: "finalize boom" } } } },
  });
  const stripe = fakeStripe();
  const res = await applyWalletFirstPayout({ ...baseDeps, supabase: sb, stripe, stripeAccountId: null, creatorPayoutReady: false });

  assertEquals(res.status, 500);
  assertEquals(res.body.success, false);
  assertEquals(res.body.needsRetry, true);
  assertEquals(res.body.error, "finalize_failed");
});
