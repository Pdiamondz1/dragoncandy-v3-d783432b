import { describe, it, expect } from "vitest";
import { portfolioIndices } from "./portfolio";

const UID = "b0280bbd-4c11-4a77-98d0-4ef5b494badf";

describe("portfolioIndices", () => {
  it("returns exactly 3 indices by default", () => {
    expect(portfolioIndices(UID, 1800)).toHaveLength(3);
  });

  it("is deterministic", () => {
    expect(portfolioIndices(UID, 1800)).toEqual(portfolioIndices(UID, 1800));
  });

  it("returns distinct indices in range", () => {
    const out = portfolioIndices(UID, 1800);
    expect(new Set(out).size).toBe(3);
    for (const i of out) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(1800);
    }
  });

  it("never picks adjacent indices — a profile must not show three near-identical shots", () => {
    for (let n = 0; n < 200; n++) {
      const out = portfolioIndices(`user-${n}`, 1800).sort((a, b) => a - b);
      expect(out[1] - out[0]).toBeGreaterThan(1);
      expect(out[2] - out[1]).toBeGreaterThan(1);
    }
  });

  it("spreads across the pool rather than clustering", () => {
    const seen = new Set<number>();
    for (let n = 0; n < 1500; n++) portfolioIndices(`user-${n}`, 1800).forEach((i) => seen.add(i));
    expect(seen.size).toBeGreaterThan(1200); // 4,500 draws over 1,800 slots
  });

  it("degrades safely when the pool is smaller than the requested count", () => {
    expect(portfolioIndices(UID, 2)).toHaveLength(2);
    expect(portfolioIndices(UID, 1)).toEqual([0]);
  });

  // Regression for the Codex round-4 finding: on a small pool the odd stride can share a factor
  // with poolSize (3 over 6 revisits after two picks), so a documented `--limit 6` smoke pool
  // handed back 2 samples instead of 3.
  it("always returns min(count, poolSize) distinct samples, including small smoke pools", () => {
    for (let poolSize = 1; poolSize <= 24; poolSize++) {
      for (const uid of ["u1", "u2", "u3", "u4", "u5"]) {
        const out = portfolioIndices(uid, poolSize);
        expect(out).toHaveLength(Math.min(3, poolSize));
        expect(new Set(out).size).toBe(out.length);
        for (const i of out) expect(i).toBeLessThan(poolSize);
      }
    }
  });

  it("throws on a non-positive pool size", () => {
    expect(() => portfolioIndices(UID, 0)).toThrow(/poolSize/);
  });

  it("does not derive the selection from anything but the id", () => {
    expect(portfolioIndices("same-id", 1800)).toEqual(portfolioIndices("same-id", 1800));
    expect(portfolioIndices("other-id", 1800)).not.toEqual(portfolioIndices("same-id", 1800));
  });
});
