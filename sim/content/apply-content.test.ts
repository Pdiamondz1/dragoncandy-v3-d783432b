import { describe, it, expect } from "vitest";
import { planPortfolios, readSyntheticCreatorIds } from "./apply-content";
import { buildFeedRows } from "./feed";

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

// Regression for the Codex round-2 finding: buildFeedRows picks creators by ARRAY POSITION and
// derives each post's deterministic id from that pick, so an unordered read would change every id
// on a rerun and the "idempotent" upsert would append a second set of posts.
describe("readSyntheticCreatorIds ordering", () => {
  function stubClient(rowOrder: string[]) {
    return {
      from: (table: string) => ({
        select: () => {
          if (table === "synthetic_users") {
            return {
              order: () => ({
                range: async (from: number) =>
                  from === 0 ? { data: rowOrder.map((user_id) => ({ user_id })), error: null } : { data: [], error: null },
              }),
            };
          }
          return { in: async () => ({ data: rowOrder.map((user_id) => ({ user_id })), error: null }) };
        },
      }),
    } as unknown as Parameters<typeof readSyntheticCreatorIds>[0];
  }

  it("returns the same order regardless of how the database returned the rows", async () => {
    const a = await readSyntheticCreatorIds(stubClient(["c-3", "c-1", "c-2"]));
    const b = await readSyntheticCreatorIds(stubClient(["c-2", "c-3", "c-1"]));
    expect(a).toEqual(b);
    expect(a).toEqual(["c-1", "c-2", "c-3"]);
  });

  it("keeps the derived feed ids stable across differently-ordered reads", async () => {
    const mk = (ids: string[]) =>
      buildFeedRows({
        creatorIds: ids,
        orgIds: ["o-1"],
        workPaths: ["synthetic/work/0000.jpg"],
        supabaseUrl: URL_,
        count: 10,
        nowMs: Date.parse("2026-07-27T12:00:00Z"),
      }).map((r) => r.id);

    const a = mk(await readSyntheticCreatorIds(stubClient(["c-3", "c-1", "c-2"])));
    const b = mk(await readSyntheticCreatorIds(stubClient(["c-1", "c-2", "c-3"])));
    expect(a).toEqual(b);
  });
});
