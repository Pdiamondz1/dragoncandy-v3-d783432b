import { describe, it, expect } from "vitest";
import { planPortfolios } from "./apply-content";

const URL_ = "https://x.supabase.co";
const paths = Array.from({ length: 1800 }, (_, i) => `synthetic/work/${String(i).padStart(4, "0")}.jpg`);

describe("planPortfolios", () => {
  it("gives each creator 3 distinct public URLs", () => {
    const out = planPortfolios(["u1", "u2"], paths, URL_);
    expect(out).toHaveLength(2);
    for (const p of out) {
      expect(p.urls).toHaveLength(3);
      expect(new Set(p.urls).size).toBe(3);
      for (const u of p.urls) expect(u).toMatch(/\/profile-assets\/synthetic\/work\/\d{4}\.jpg$/);
    }
  });

  it("is idempotent", () => {
    expect(planPortfolios(["u1"], paths, URL_)).toEqual(planPortfolios(["u1"], paths, URL_));
  });

  it("only ever emits URLs for pool objects that exist", () => {
    const sparse = ["synthetic/work/0000.jpg", "synthetic/work/0002.jpg", "synthetic/work/0009.jpg"];
    for (const p of planPortfolios(["u1", "u2", "u3"], sparse, URL_)) {
      for (const u of p.urls) expect(sparse.some((s) => u.endsWith(s))).toBe(true);
    }
  });

  it("returns nothing when the pool is empty rather than writing empty portfolios", () => {
    expect(planPortfolios(["u1"], [], URL_)).toEqual([]);
  });

  it("carries the creator id through unchanged", () => {
    expect(planPortfolios(["u1", "u2"], paths, URL_).map((p) => p.userId)).toEqual(["u1", "u2"]);
  });
});
