import { describe, it, expect, vi, afterEach } from "vitest";
import { parseArgs, main, nonZeroResiduals, makeBotFor } from "./run";
import type { BotRef } from "./types";

describe("parseArgs", () => {
  it("parses a full command line", () => {
    expect(parseArgs(["tick", "--n", "25", "--cohort", "x", "--seed", "3"])).toEqual({
      command: "tick", n: 25, cohort: "x", seed: 3, active: 25, creatorSplit: 0.65,
      ramp: "50/1500/2.5", holdMs: 15000, runLabel: "load",
    });
  });
  it("applies defaults", () => {
    expect(parseArgs(["dry-run"])).toEqual({
      command: "dry-run", n: 25, cohort: "phase1", seed: 1, active: 25, creatorSplit: 0.65,
      ramp: "50/1500/2.5", holdMs: 15000, runLabel: "load",
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
    });
  });
  it("parses the load flags (--ramp / --hold-ms / --run-label)", () => {
    expect(parseArgs(["load", "--ramp", "50,200,500", "--hold-ms", "8000", "--run-label", "micro"])).toEqual({
      command: "load", n: 25, cohort: "phase1", seed: 1, active: 25, creatorSplit: 0.65,
      ramp: "50,200,500", holdMs: 8000, runLabel: "micro",
    });
  });
  it("falls back to defaults on non-numeric --active/--creator-split", () => {
    const a = parseArgs(["bulk-seed", "--active", "abc", "--creator-split", "xyz"]);
    expect(a.active).toBe(25);
    expect(a.creatorSplit).toBe(0.65);
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
