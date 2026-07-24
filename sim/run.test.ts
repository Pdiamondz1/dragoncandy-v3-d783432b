import { describe, it, expect, vi, afterEach } from "vitest";
import { parseArgs, main, nonZeroResiduals } from "./run";

describe("parseArgs", () => {
  it("parses a full command line", () => {
    expect(parseArgs(["tick", "--n", "25", "--cohort", "x", "--seed", "3"])).toEqual({
      command: "tick", n: 25, cohort: "x", seed: 3, active: 25, creatorSplit: 0.65,
    });
  });
  it("applies defaults", () => {
    expect(parseArgs(["dry-run"])).toEqual({
      command: "dry-run", n: 25, cohort: "phase1", seed: 1, active: 25, creatorSplit: 0.65,
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
