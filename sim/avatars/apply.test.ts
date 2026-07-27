import { describe, it, expect, vi } from "vitest";
import {
  chunkIds,
  paginate,
  planAssignments,
  stripPlaceholderPortfolio,
  PAGE,
  type ProfileRow,
} from "./apply";

const URL_ = "https://x.supabase.co";
const POOLS = {
  facePaths: Array.from({ length: 1500 }, (_, i) => `synthetic/faces/${String(i).padStart(4, "0")}.jpg`),
};

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

// Regression for the Codex round-2 finding. MEASURED, not assumed: an unbounded PostgREST select
// on this project returns exactly 1000 rows, while the registry holds 2,025 — so an unpaged read
// would have left ~1,025 synthetic profiles with no image and no error.
describe("paginate", () => {
  it("keeps requesting until a short page comes back", async () => {
    const total = 2025;
    const fetchPage = vi.fn(async (from: number, to: number) =>
      Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => `id-${from + i}`),
    );
    const all = await paginate(fetchPage, PAGE);
    expect(all).toHaveLength(total);
    expect(new Set(all).size).toBe(total); // no duplicates across page boundaries
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("stops after one call when the first page is short", async () => {
    const fetchPage = vi.fn(async () => ["only"]);
    expect(await paginate(fetchPage, PAGE)).toEqual(["only"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("returns empty without looping when there are no rows", async () => {
    const fetchPage = vi.fn(async () => []);
    expect(await paginate(fetchPage, PAGE)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("requests inclusive ranges that tile without gaps", async () => {
    const seen: Array<[number, number]> = [];
    await paginate(async (from, to) => {
      seen.push([from, to]);
      return from === 0 ? Array.from({ length: 10 }, (_, i) => i) : [];
    }, 10);
    expect(seen).toEqual([
      [0, 9],
      [10, 19],
    ]);
  });
});

// Regression for the Codex round-4 finding: apply must remove the placeholder it is replacing,
// and nothing else.
describe("stripPlaceholderPortfolio", () => {
  const uid = "b0280bbd-4c11-4a77-98d0-4ef5b494badf";
  const placeholder = `https://x.supabase.co/storage/v1/object/public/profile-assets/${uid}/avatar.jpg`;
  const real = "https://x.supabase.co/storage/v1/object/public/creator-portfolios/reel-1.mp4";

  it("removes only the per-user placeholder entry", () => {
    expect(stripPlaceholderPortfolio([placeholder, real], uid)).toEqual([real]);
  });

  it("returns null (no write) when there is no placeholder to remove", () => {
    expect(stripPlaceholderPortfolio([real], uid)).toBeNull();
  });

  it("returns null for an empty or missing portfolio", () => {
    expect(stripPlaceholderPortfolio([], uid)).toBeNull();
    expect(stripPlaceholderPortfolio(null, uid)).toBeNull();
    expect(stripPlaceholderPortfolio(undefined, uid)).toBeNull();
  });

  it("never strips another user's placeholder", () => {
    const other = "https://x.supabase.co/storage/v1/object/public/profile-assets/OTHER/avatar.jpg";
    expect(stripPlaceholderPortfolio([other], uid)).toBeNull();
  });

  it("yields an empty array when the placeholder was the only entry", () => {
    expect(stripPlaceholderPortfolio([placeholder], uid)).toEqual([]);
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
    expect(out.find((a) => a.userId === "u2")!.url).toMatch(/synthetic\/logos\/[0-9a-f]{8}\.png$/);
  });

  it("is idempotent — same input, same URLs", () => {
    expect(planAssignments(rows, POOLS, URL_)).toEqual(planAssignments(rows, POOLS, URL_));
  });

  // The ethical rule is about FACES: never infer a person's appearance from their name.
  it("never derives a creator's face from anything but the id", () => {
    const a = planAssignments([{ userId: "u1", kind: "creator", name: "Aiko Tanaka" }], POOLS, URL_);
    const b = planAssignments([{ userId: "u1", kind: "creator", name: "John Smith" }], POOLS, URL_);
    expect(a[0].url).toBe(b[0].url);
  });

  // A lettermark is the opposite case: the name IS the image, so the path must follow it.
  it("content-addresses a business logo from its monogram, so two names never share a tile", () => {
    const joe = planAssignments([{ userId: "u2", kind: "business", name: "Joe's Pizza" }], POOLS, URL_);
    const mt = planAssignments([{ userId: "u2", kind: "business", name: "Mountain Tap" }], POOLS, URL_);
    expect(joe[0].url).not.toBe(mt[0].url);
  });

  // Regression for the Codex finding: slot-indexed logo paths collided, so a business could be
  // handed a tile carrying ANOTHER business's initials.
  it("gives every distinct monogram a distinct object path across a realistic cohort", () => {
    const many: ProfileRow[] = Array.from({ length: 509 }, (_, i) => ({
      userId: `biz-${i}`,
      kind: "business",
      name: `Alpha${i} Bravo${i}`,
    }));
    const out = planAssignments(many, POOLS, URL_);
    const byPath = new Map<string, string>();
    for (const a of out) {
      const prev = byPath.get(a.objectPath!);
      if (prev !== undefined) expect(prev).toBe(a.monogram); // sharing is only ever identical art
      byPath.set(a.objectPath!, a.monogram!);
    }
  });

  it("carries monogram text and palette for businesses only", () => {
    const out = planAssignments(rows, POOLS, URL_);
    expect(out.find((a) => a.userId === "u2")!.monogram).toBe("JP");
    expect(out.find((a) => a.userId === "u2")!.palette).toBeDefined();
    expect(out.find((a) => a.userId === "u1")!.monogram).toBeUndefined();
  });

  it("throws rather than silently assigning when the face pool is empty", () => {
    expect(() => planAssignments(rows, { facePaths: [] }, URL_)).toThrow(/face pool is empty/);
  });

  // Regression: a refusal leaves a gap in the pool, and a count-based pool size would hand out a
  // URL for an object that was never generated.
  it("only ever assigns a path that actually exists in the pool", () => {
    const sparse = { facePaths: ["synthetic/faces/0000.jpg", "synthetic/faces/0002.jpg"] };
    const out = planAssignments(
      Array.from({ length: 50 }, (_, i) => ({ userId: `c-${i}`, kind: "creator" as const, name: null })),
      sparse,
      URL_,
    );
    for (const a of out) {
      expect(sparse.facePaths.some((p) => a.url.endsWith(p))).toBe(true);
    }
  });
});
