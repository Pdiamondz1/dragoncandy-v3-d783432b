import { describe, it, expect } from "vitest";
import { poolIndex, facePath, logoPath, poolPublicUrl } from "./pool";

describe("poolIndex", () => {
  const id = "b0280bbd-4c11-4a77-98d0-4ef5b494badf";

  it("is deterministic for the same id and pool size", () => {
    expect(poolIndex(id, 1500)).toBe(poolIndex(id, 1500));
  });

  it("stays within [0, poolSize)", () => {
    for (const n of [1, 7, 223, 1500]) {
      const v = poolIndex(id, n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
    }
  });

  it("spreads ids across the pool (no degenerate clustering)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1500; i++) {
      seen.add(poolIndex(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, 1500));
    }
    // ~63% distinct is the birthday-collision floor for 1500 draws from 1500 slots.
    expect(seen.size).toBeGreaterThan(700);
  });

  it("throws on a non-positive pool size rather than returning NaN", () => {
    expect(() => poolIndex(id, 0)).toThrow(/poolSize/);
  });
});

describe("paths", () => {
  it("zero-pads to 4 digits under the durable prefixes", () => {
    expect(facePath(7)).toBe("synthetic/faces/0007.jpg");
    expect(logoPath(1499)).toBe("synthetic/logos/1499.png");
  });

  it("builds a public URL for the profile-assets bucket", () => {
    expect(poolPublicUrl("https://x.supabase.co", "synthetic/faces/0007.jpg")).toBe(
      "https://x.supabase.co/storage/v1/object/public/profile-assets/synthetic/faces/0007.jpg",
    );
  });
});
