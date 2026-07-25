import { describe, it, expect, vi, afterEach } from "vitest";
import { parseArgs, main, nonZeroResiduals, makeBotFor, planLoad, cmdLoad, seedContent, cmdMarketplaceSeed, type CmdLoadDeps, type RpcCaller, type CmdMarketplaceSeedDeps } from "./run";
import type { BotRef } from "./types";
import type { RunLoadDeps, LoadResult } from "./load/driver";
import { DAU_ACTIONS, DAU_READ_ACTIONS, WRITE_ACTION_NAMES } from "./load/actions-mix";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("parseArgs", () => {
  it("parses a full command line", () => {
    expect(parseArgs(["tick", "--n", "25", "--cohort", "x", "--seed", "3"])).toEqual({
      command: "tick", n: 25, cohort: "x", seed: 3, active: 25, creatorSplit: 0.65,
      ramp: "50/1500/2.5", holdMs: 15000, runLabel: "load",
      shard: 0, shards: 1, concurrency: 0, soakMs: 0,
      withContent: false, campaigns: 50, posts: 200,
      businesses: 100, creators: 300, multiLocation: false, cgc: false,
    });
  });
  it("applies defaults", () => {
    expect(parseArgs(["dry-run"])).toEqual({
      command: "dry-run", n: 25, cohort: "phase1", seed: 1, active: 25, creatorSplit: 0.65,
      ramp: "50/1500/2.5", holdMs: 15000, runLabel: "load",
      shard: 0, shards: 1, concurrency: 0, soakMs: 0,
      withContent: false, campaigns: 50, posts: 200,
      businesses: 100, creators: 300, multiLocation: false, cgc: false,
    });
  });
  it("throws on an unknown or missing command", () => {
    expect(() => parseArgs(["bogus"])).toThrow();
    expect(() => parseArgs([])).toThrow();
  });
  it("falls back to defaults on non-numeric --n/--seed", () => {
    const a = parseArgs(["mint", "--n", "abc", "--seed", "xyz"]);
    expect(a.n).toBe(25);
    expect(a.seed).toBe(1);
  });
  it("parses the bulk-seed flags (--active / --creator-split)", () => {
    expect(parseArgs(["bulk-seed", "--n", "200", "--active", "30", "--creator-split", "0.5"])).toEqual({
      command: "bulk-seed", n: 200, cohort: "phase1", seed: 1, active: 30, creatorSplit: 0.5,
      ramp: "50/1500/2.5", holdMs: 15000, runLabel: "load",
      shard: 0, shards: 1, concurrency: 0, soakMs: 0,
      withContent: false, campaigns: 50, posts: 200,
      businesses: 100, creators: 300, multiLocation: false, cgc: false,
    });
  });
  it("parses the load flags (--ramp / --hold-ms / --run-label)", () => {
    expect(parseArgs(["load", "--ramp", "50,200,500", "--hold-ms", "8000", "--run-label", "micro"])).toEqual({
      command: "load", n: 25, cohort: "phase1", seed: 1, active: 25, creatorSplit: 0.65,
      ramp: "50,200,500", holdMs: 8000, runLabel: "micro",
      shard: 0, shards: 1, concurrency: 0, soakMs: 0,
      withContent: false, campaigns: 50, posts: 200,
      businesses: 100, creators: 300, multiLocation: false, cgc: false,
    });
  });
  it("parses the content flags (--with-content / --campaigns / --posts)", () => {
    expect(
      parseArgs(["bulk-seed", "--with-content", "--campaigns", "40", "--posts", "120"]),
    ).toMatchObject({ command: "bulk-seed", withContent: true, campaigns: 40, posts: 120 });
  });
  it("defaults the content flags (withContent false / campaigns 50 / posts 200) when absent", () => {
    expect(parseArgs(["bulk-seed"])).toMatchObject({ withContent: false, campaigns: 50, posts: 200 });
  });
  it("falls back to defaults on non-numeric --campaigns/--posts", () => {
    const a = parseArgs(["bulk-seed", "--with-content", "--campaigns", "abc", "--posts", "xyz"]);
    expect(a.campaigns).toBe(50);
    expect(a.posts).toBe(200);
  });
  it("falls back to defaults on non-numeric --active/--creator-split", () => {
    const a = parseArgs(["bulk-seed", "--active", "abc", "--creator-split", "xyz"]);
    expect(a.active).toBe(25);
    expect(a.creatorSplit).toBe(0.65);
  });
  it("parses the matrix flags (--shard / --shards / --concurrency / --soak-ms)", () => {
    expect(
      parseArgs(["load", "--shard", "2", "--shards", "5", "--concurrency", "200", "--soak-ms", "1800000"]),
    ).toMatchObject({ command: "load", shard: 2, shards: 5, concurrency: 200, soakMs: 1_800_000 });
  });
  it("defaults the matrix flags (shard 0 / shards 1 / concurrency 0 / soak-ms 0) when absent", () => {
    expect(parseArgs(["load"])).toMatchObject({ shard: 0, shards: 1, concurrency: 0, soakMs: 0 });
  });
});

describe("nonZeroResiduals (purge teardown assertion)", () => {
  it("returns [] when every residual is zero", () => {
    expect(nonZeroResiduals({ purged_users: 5, residual_synthetic_users: 0, residual_orgs: 0 })).toEqual([]);
  });
  it("flags any non-zero residual, ignoring non-residual keys", () => {
    expect(
      nonZeroResiduals({ purged_users: 3, residual_orgs: 2, residual_cost_ledger: 0, note: "x" }),
    ).toEqual([["residual_orgs", 2]]);
  });
});

describe("seedContent (bulk-seed --with-content content-seed step)", () => {
  const rpcResult = (data: unknown, error: { message: string } | null = null) =>
    vi.fn(async () => ({ data, error }));

  it("returns null and calls NO rpc when --with-content is off", async () => {
    const rpc = rpcResult({ campaigns: 3, posts: 9 });
    const svc = { rpc } as unknown as RpcCaller;
    const out = await seedContent(svc, { withContent: false, campaigns: 40, posts: 120, creatorSplit: 0.5 });
    expect(out).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls seed_synthetic_content with the flag values and returns the summary when on", async () => {
    const rpc = rpcResult({ org: "o", owner: "u", avatars: 5, campaigns: 40, posts: 120 });
    const svc = { rpc } as unknown as RpcCaller;
    const out = await seedContent(svc, { withContent: true, campaigns: 40, posts: 120, creatorSplit: 0.5 });
    expect(rpc).toHaveBeenCalledWith("seed_synthetic_content", {
      p_campaigns: 40,
      p_posts: 120,
      p_creator_split: 0.5,
    });
    expect(out).toEqual({ campaigns: 40, posts: 120 });
  });

  it("throws (fail-loud) when the rpc returns an error", async () => {
    const rpc = rpcResult(null, { message: "boom" });
    const svc = { rpc } as unknown as RpcCaller;
    await expect(
      seedContent(svc, { withContent: true, campaigns: 40, posts: 120, creatorSplit: 0.5 }),
    ).rejects.toThrow(/seed_synthetic_content failed: boom/);
  });
});

describe("makeBotFor (soak-safe: rebuild the bot client only when the pooled token rotates)", () => {
  afterEach(() => vi.unstubAllEnvs());

  const bot: BotRef = {
    userId: "u1",
    email: "botla1_1@synthetic.dragoncandy.test",
    role: "content_creator",
    personaKey: null,
    cohort: null,
  };

  it("reuses the client while the token is unchanged and rebuilds it on rotation", async () => {
    // botClient() constructs a real (offline) supabase client — it only needs these two env vars.
    vi.stubEnv("SIM_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("SIM_SUPABASE_ANON_KEY", "anon-test");

    let token = "token-A";
    let calls = 0;
    // Injected token-getter (default is the real SessionPool) — simulates the pool's reuse→refresh.
    const botFor = makeBotFor([bot], async () => {
      calls += 1;
      return token;
    });

    const c1 = await botFor("u1");
    const c2 = await botFor("u1");
    expect(c2).toBe(c1); // same token → SAME client (0 rebuilds within a fresh window)

    token = "token-B"; // a mid-soak refresh rotated the token
    const c3 = await botFor("u1");
    expect(c3).not.toBe(c1); // rotated token → NEW client bound to the fresh JWT

    expect(calls).toBe(3); // getToken consulted on EVERY call (never a permanent client cache)
  });

  it("throws for a userId that is not in the cohort", async () => {
    const botFor = makeBotFor([bot], async () => "tok");
    await expect(botFor("nope")).rejects.toThrow(/not in the cohort/);
  });
});

describe("planLoad (matrix soak vs single-runner ramp decision)", () => {
  it("matrix mode (shards>1): a single fixed-C step held for soakMs", () => {
    expect(planLoad(parseArgs(["load", "--shards", "4", "--concurrency", "200", "--soak-ms", "600000"]))).toEqual({
      matrix: true,
      ramp: [200],
      holdMs: 600000,
    });
  });
  it("single-runner mode (shards<=1): parseRamp + holdMs (unchanged)", () => {
    expect(planLoad(parseArgs(["load", "--ramp", "50,200", "--hold-ms", "9000"]))).toEqual({
      matrix: false,
      ramp: [50, 200],
      holdMs: 9000,
    });
  });
  it("floors matrix concurrency at 1 (never a degenerate 0-concurrency ramp)", () => {
    expect(planLoad(parseArgs(["load", "--shards", "2"])).ramp).toEqual([1]);
  });
});

describe("cmdLoad — matrix/soak mode wiring (injected deps, no live DB)", () => {
  const oneBot: BotRef[] = [
    { userId: "u1", email: "botla1_1@synthetic.dragoncandy.test", role: "content_creator", personaKey: null, cohort: null },
  ];
  const emptyResult: LoadResult = {
    steps: [], breakages: [], breakageCount: 0, stoppedAtKnee: false, kneeConcurrency: null, stoppedByKillSwitch: false,
  };

  function harness() {
    const rpc = vi.fn(async () => ({ error: null }));
    const svc = { rpc } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const calls = { active: null as [number, number] | null, session: false, killReads: 0, runLoad: null as RunLoadDeps | null };
    const deps: CmdLoadDeps = {
      serviceClient: () => svc,
      bootGate: async () => {},
      readActiveLoadCohort: async (_svc, shard, shards) => {
        calls.active = [shard, shards];
        return oneBot;
      },
      readSessionCapableBots: async () => {
        calls.session = true;
        return oneBot;
      },
      makeBotFor: () => async () => ({}) as unknown as import("@supabase/supabase-js").SupabaseClient,
      runLoad: async (rl) => {
        calls.runLoad = rl;
        return emptyResult;
      },
      readKillSwitch: async () => {
        calls.killReads += 1;
        return true;
      },
    };
    return { rpc, calls, deps };
  }

  it("shards>1: selects readActiveLoadCohort, single-step soak ramp, kill-switch isEnabled, stamps notes.shard", async () => {
    const { rpc, calls, deps } = harness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const args = parseArgs(["load", "--shards", "3", "--shard", "1", "--concurrency", "200", "--soak-ms", "1800000", "--run-label", "matrix-x"]);
    await cmdLoad(args, deps);

    expect(calls.active).toEqual([1, 3]); // shard slice, not the live cohort
    expect(calls.session).toBe(false);
    expect(calls.runLoad?.rampSteps).toEqual([200]); // single fixed-C step
    expect(calls.runLoad?.holdMs).toBe(1_800_000); // held for the soak
    expect(typeof calls.runLoad?.isEnabled).toBe("function"); // kill-switch re-check injected
    await expect(calls.runLoad?.isEnabled?.()).resolves.toBe(true);
    expect(calls.killReads).toBe(1);
    // Matrix drives the ISOLATED botla slice → the FULL mix incl. writes is safe (teardown-cleaned).
    expect(calls.runLoad?.actions).toBe(DAU_ACTIONS);
    expect(calls.runLoad?.actions?.some((a) => WRITE_ACTION_NAMES.includes(a.name))).toBe(true);

    // Every snapshot is stamped with this shard's index (the aggregation RPC groups on notes.shard).
    await calls.runLoad?.captureSnapshot("matrix-x", 0, { concurrency: 200 });
    expect(rpc).toHaveBeenCalledWith(
      "capture_sim_load_snapshot",
      expect.objectContaining({ p_notes: expect.objectContaining({ shard: 1, concurrency: 200 }) }),
    );
    warn.mockRestore();
  });

  it("shards<=1: single-runner path unchanged (readSessionCapableBots, parseRamp, no isEnabled, no shard stamp)", async () => {
    const { rpc, calls, deps } = harness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const args = parseArgs(["load", "--ramp", "50,200", "--hold-ms", "9000"]);
    await cmdLoad(args, deps);

    expect(calls.session).toBe(true);
    expect(calls.active).toBeNull();
    expect(calls.runLoad?.rampSteps).toEqual([50, 200]);
    expect(calls.runLoad?.holdMs).toBe(9000);
    expect(calls.runLoad?.isEnabled).toBeUndefined();
    // Single-runner drives the LIVE bot0## cohort → READS ONLY (the scoped teardown spares bot0##, so
    // write residue would leak). Writes run only in matrix mode.
    expect(calls.runLoad?.actions).toBe(DAU_READ_ACTIONS);
    expect(calls.runLoad?.actions?.some((a) => WRITE_ACTION_NAMES.includes(a.name))).toBe(false);

    await calls.runLoad?.captureSnapshot("load", 0, { concurrency: 50 });
    expect(rpc).toHaveBeenCalledWith(
      "capture_sim_load_snapshot",
      expect.objectContaining({ p_notes: { concurrency: 50 } }), // exactly — no shard key
    );
    warn.mockRestore();
  });
});

describe("main dry-run", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints a plan with ZERO network — never constructs a client (no SIM_* env needed)", async () => {
    // If dry-run touched serviceClient(), it would throw 'Missing required env var'.
    // It resolving here (with no SIM_* set) proves it makes no client and no writes.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(main(["dry-run", "--n", "6"])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

function mpHarness() {
  const calls: Record<string, unknown> = {};
  const svc = {} as SupabaseClient;
  const deps: CmdMarketplaceSeedDeps = {
    serviceClient: () => svc,
    bootGate: vi.fn(async () => { calls.booted = true; }),
    buildSteps: vi.fn(() => ({}) as never),
    runSeed: vi.fn(async () => { calls.ran = true; return { minted: 2, skipped: 0, campaigns: 1, collaborations: 1, messages: 1, posts: 1, units: 0, cgcSubmissions: 0 }; }),
  };
  return { deps, calls };
}

describe("cmdMarketplaceSeed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("boot-gates BEFORE seeding and passes parsed opts through", async () => {
    const { deps, calls } = mpHarness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const args = parseArgs(["marketplace-seed", "--businesses", "3", "--creators", "9", "--multi-location", "--cgc"]);
    await cmdMarketplaceSeed(args, deps);
    expect(calls.booted).toBe(true);
    expect(calls.ran).toBe(true);
    expect(deps.runSeed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businesses: 3, creators: 9, multiLocation: true, cgc: true }), expect.anything());
    warn.mockRestore();
  });

  it("parseArgs defaults: 100 businesses / 300 creators, follow-ons off", () => {
    const a = parseArgs(["marketplace-seed"]);
    expect(a.businesses).toBe(100);
    expect(a.creators).toBe(300);
    expect(a.multiLocation).toBe(false);
    expect(a.cgc).toBe(false);
  });
});
