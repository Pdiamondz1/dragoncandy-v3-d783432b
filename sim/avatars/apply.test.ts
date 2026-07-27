import { describe, it, expect } from "vitest";
import { chunkIds, planAssignments, type ProfileRow } from "./apply";

const URL_ = "https://x.supabase.co";
const POOLS = { faces: 1500, logos: 509 };

describe("chunkIds", () => {
  it("chunks at 100 by default", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const c = chunkIds(ids);
    expect(c).toHaveLength(3);
    expect(c[0]).toHaveLength(100);
    expect(c[2]).toHaveLength(50);
  });

  it("returns no chunks for an empty list", () => {
    expect(chunkIds([])).toEqual([]);
  });

  // The reason this constant exists: an unbounded .in() serialises every id into the URL, and
  // PostgREST echoes the URI back in Content-Location, overflowing undici's 16 KB header limit.
  // See docs/wiki/concepts/supabase-in-filter-header-overflow.md.
  it("keeps a built PostgREST URL under undici's 16 KB header limit", () => {
    const uuids = Array.from(
      { length: 1500 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    for (const batch of chunkIds(uuids)) {
      const url = `${URL_}/rest/v1/creator_profiles?user_id=in.(${batch.map((u) => `"${u}"`).join(",")})`;
      expect(url.length).toBeLessThan(16_000);
    }
  });
});

describe("planAssignments", () => {
  const rows: ProfileRow[] = [
    { userId: "u1", kind: "creator", name: null },
    { userId: "u2", kind: "business", name: "Joe's Pizza" },
  ];

  it("routes creators to faces and businesses to logos", () => {
    const out = planAssignments(rows, POOLS, URL_);
    expect(out.find((a) => a.userId === "u1")!.url).toMatch(/synthetic\/faces\/\d{4}\.jpg$/);
    expect(out.find((a) => a.userId === "u2")!.url).toMatch(/synthetic\/logos\/\d{4}\.png$/);
  });

  it("is idempotent — same input, same URLs", () => {
    expect(planAssignments(rows, POOLS, URL_)).toEqual(planAssignments(rows, POOLS, URL_));
  });

  it("never derives the pool index from the name", () => {
    const a = planAssignments([{ userId: "u2", kind: "business", name: "Joe's Pizza" }], POOLS, URL_);
    const b = planAssignments([{ userId: "u2", kind: "business", name: "Totally Different" }], POOLS, URL_);
    expect(a[0].url).toBe(b[0].url);
  });

  it("carries monogram text for businesses only", () => {
    const out = planAssignments(rows, POOLS, URL_);
    expect(out.find((a) => a.userId === "u2")!.monogram).toBe("JP");
    expect(out.find((a) => a.userId === "u1")!.monogram).toBeUndefined();
  });

  it("throws rather than silently assigning when a pool is empty", () => {
    expect(() => planAssignments(rows, { faces: 0, logos: 509 }, URL_)).toThrow(/poolSize/);
  });
});
