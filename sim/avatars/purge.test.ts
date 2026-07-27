import { describe, it, expect } from "vitest";
import { parseAvatarArgs, estimateSpendUsd, POOL_PREFIXES, DEFAULT_WORK_COUNT } from "./purge";

describe("parseAvatarArgs", () => {
  it("defaults count to 1500, dry-run off, no limit", () => {
    expect(parseAvatarArgs([])).toEqual({ count: 1500, dryRun: false, limit: null });
  });

  it("parses --count, --limit and --dry-run", () => {
    expect(parseAvatarArgs(["--count", "20", "--limit", "5", "--dry-run"])).toEqual({
      count: 20,
      dryRun: true,
      limit: 5,
    });
  });

  it("rejects a non-numeric count rather than silently defaulting", () => {
    expect(() => parseAvatarArgs(["--count", "abc"])).toThrow(/count/);
  });

  it("rejects a negative or zero count", () => {
    expect(() => parseAvatarArgs(["--count", "0"])).toThrow(/count/);
  });

  // Regression for the Codex round-8 finding: a trailing --count silently became the full paid run.
  it("rejects a numeric flag given without a value instead of defaulting", () => {
    expect(() => parseAvatarArgs(["avatars-generate", "--count"])).toThrow(/without a value/);
    expect(() => parseAvatarArgs(["--limit"])).toThrow(/without a value/);
  });

  it("rejects a numeric flag immediately followed by another flag", () => {
    expect(() => parseAvatarArgs(["--count", "--dry-run"])).toThrow(/without a value/);
  });

  it("still treats an absent flag as the default", () => {
    expect(parseAvatarArgs(["--dry-run"])).toEqual({ count: 1500, dryRun: true, limit: null });
  });

  // Regression: content-generate reused the 1,500 face default, so a bare dry-run under-estimated
  // the 1,800-image work pool it would actually build.
  it("accepts a caller-supplied default so each pool estimates its own size", () => {
    expect(parseAvatarArgs(["--dry-run"], DEFAULT_WORK_COUNT).count).toBe(1800);
    expect(parseAvatarArgs(["--count", "20"], DEFAULT_WORK_COUNT).count).toBe(20);
  });

  it("applies --limit as the effective ceiling on count", () => {
    const a = parseAvatarArgs(["--count", "1500", "--limit", "5"]);
    expect(Math.min(a.count, a.limit ?? a.count)).toBe(5);
  });
});

describe("estimateSpendUsd", () => {
  it("prices the pool at the low-quality per-image rate", () => {
    expect(estimateSpendUsd(1500)).toBeCloseTo(16.5, 2);
  });

  it("is zero for an empty run", () => {
    expect(estimateSpendUsd(0)).toBe(0);
  });
});

describe("POOL_PREFIXES", () => {
  it("targets only the durable synthetic prefixes — never a per-user folder", () => {
    expect(POOL_PREFIXES).toEqual(["synthetic/faces", "synthetic/logos"]);
    for (const p of POOL_PREFIXES) expect(p.startsWith("synthetic/")).toBe(true);
  });
});
