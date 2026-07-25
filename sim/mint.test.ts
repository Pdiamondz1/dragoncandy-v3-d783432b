import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertSyntheticEmail,
  personaToCreateUser,
  readSessionCapableBots,
  sliceActiveCohort,
  readActiveLoadCohort,
} from "./mint";
import type { Persona } from "./personas";

const biz: Persona = {
  email: "bot009@synthetic.dragoncandy.test",
  fullName: "Carmine's Hoboken",
  role: "business_client",
  personaKey: "hoboken_restaurant",
  cohort: "phase1",
};
const creator: Persona = {
  email: "bot001@synthetic.dragoncandy.test",
  fullName: "Zoe Kim",
  role: "content_creator",
  personaKey: "nyc_genz_creator",
  cohort: "phase1",
};

describe("assertSyntheticEmail", () => {
  it("accepts a @synthetic.dragoncandy.test address", () => {
    expect(() => assertSyntheticEmail(creator.email)).not.toThrow();
  });
  it("throws on any other domain", () => {
    expect(() => assertSyntheticEmail("someone@dragoncandy.io")).toThrow();
  });
  it("throws on a look-alike subdomain suffix (no smuggling)", () => {
    expect(() => assertSyntheticEmail("x@synthetic.dragoncandy.test.evil.com")).toThrow();
  });
});

describe("personaToCreateUser", () => {
  it("maps a business persona to role business_client + full_name, no account_type key", () => {
    const u = personaToCreateUser(biz);
    // role is the load-bearing field: handle_new_user derives account_type from it.
    expect(u.user_metadata).toEqual({ role: "business_client", full_name: "Carmine's Hoboken" });
    expect(u.email_confirm).toBe(true);
    expect(u.email).toBe(biz.email);
  });
  it("maps a creator persona to role content_creator", () => {
    expect(personaToCreateUser(creator).user_metadata.role).toBe("content_creator");
  });
  it("refuses to build a create-user payload for a non-synthetic email", () => {
    expect(() => personaToCreateUser({ ...creator, email: "x@dragoncandy.io" })).toThrow();
  });
});

describe("readSessionCapableBots (load drives only bots that can hold a JWT)", () => {
  /** Fake client for the from().select().like().not().not() → {data,error} chain the loader uses.
   *  `not` returns the builder itself (chainable any number of times) and the builder is thenable,
   *  so it resolves however many `.not()` calls the implementation makes. */
  function fakeClient(result: {
    data: unknown;
    error: { message: string } | null;
  }): SupabaseClient {
    const builder = {
      select: () => builder,
      like: () => builder,
      not: () => builder,
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return { from: () => builder } as unknown as SupabaseClient;
  }

  it("maps id/email/role to bot refs and, as a belt-and-suspenders guard, drops any depth-pool row", async () => {
    // Includes a botseed_ row as if the DB .not-like filter had been bypassed — the client guard must drop it.
    const svc = fakeClient({
      data: [
        { id: "u1", email: "bot001@synthetic.dragoncandy.test", role: "content_creator" },
        { id: "u2", email: "botla7_1@synthetic.dragoncandy.test", role: "business_client" },
        { id: "u3", email: "botseed_load_1@synthetic.dragoncandy.test", role: "content_creator" },
      ],
      error: null,
    });
    const bots = await readSessionCapableBots(svc);
    expect(bots.map((b) => b.userId)).toEqual(["u1", "u2"]); // u3 (depth pool) filtered out
    expect(bots[0]).toMatchObject({ userId: "u1", email: "bot001@synthetic.dragoncandy.test", role: "content_creator" });
    expect(bots[1].role).toBe("business_client");
  });

  it("fails loud when the query errors", async () => {
    const svc = fakeClient({ data: null, error: { message: "boom" } });
    await expect(readSessionCapableBots(svc)).rejects.toThrow(/readSessionCapableBots: boom/);
  });

  it("returns an empty list (not a throw) when no session-capable bots exist", async () => {
    const svc = fakeClient({ data: [], error: null });
    await expect(readSessionCapableBots(svc)).resolves.toEqual([]);
  });
});

// ── Matrix shard slice (Phase 1, Task 1.1) ──────────────────────────────────────────────
// Each runner shard drives a DISJOINT 25-bot slice of the botla… active cohort, from its own
// egress IP. The slice MUST be deterministic and botla-only: PostgREST returns unspecified
// order, so independent runners would otherwise get different orderings → OVERLAPPING slices
// (same bot on two IPs → per-IP 429 + non-distinct users), the exact failure the ORDER BY guards.
type SliceRow = { id: string; email: string; role: string };
const rangeN = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
/** botla… active cohort rows (session-capable, one per shard slot). */
const activeRows = (n: number): SliceRow[] =>
  rangeN(n).map((i) => ({ id: `u${i}`, email: `botla1_${i + 1}@synthetic.dragoncandy.test`, role: "content_creator" }));
/** bot0## live daily-tick cohort rows — must be EXCLUDED from every matrix slice. */
const liveRows = (n: number): SliceRow[] =>
  rangeN(n).map((i) => ({ id: `live${i}`, email: `bot0${i + 1}@synthetic.dragoncandy.test`, role: "content_creator" }));

describe("sliceActiveCohort (botla-only, ORDER BY email, disjoint 25-bot slices)", () => {
  it("excludes bot0##, returns disjoint 25-bot slices, order-independent", () => {
    // Reverse the input (a non-trivial order) to prove the internal sort makes the slice stable.
    const rows = [...activeRows(50), ...liveRows(25)].reverse();
    const s0 = sliceActiveCohort(rows, 0, 2);
    const s1 = sliceActiveCohort(rows, 1, 2);
    expect(s0).toHaveLength(25);
    expect(s1).toHaveLength(25);
    expect(s0.every((b) => b.email.startsWith("botla"))).toBe(true); // no bot0## leaked in
    const ids0 = new Set(s0.map((b) => b.userId));
    expect(s1.some((b) => ids0.has(b.userId))).toBe(false); // disjoint slices
    // order-independent: the un-reversed input yields the identical slice
    expect(sliceActiveCohort([...activeRows(50), ...liveRows(25)], 0, 2)).toEqual(s0);
  });

  it("returns BotRef shape with personaKey:null + cohort:null (types.ts BotRef)", () => {
    const [b] = sliceActiveCohort(activeRows(1), 0, 1);
    expect(b).toMatchObject({ userId: "u0", role: "content_creator", personaKey: null, cohort: null });
  });

  it("returns [] for an out-of-range shard index (shard >= shards)", () => {
    expect(sliceActiveCohort(activeRows(50), 2, 2)).toEqual([]); // shards=2 → valid shards are 0,1
    expect(sliceActiveCohort(activeRows(50), -1, 2)).toEqual([]);
  });
});

describe("readSessionCapableBots excludes the persistent marketplace cohort", () => {
  /** Fake the profiles query chain: .from().select().like().not("like botseed").not("like botmk") */
  function fakeAdmin(rows: { id: string; email: string; role: string }[], captured: string[][]): SupabaseClient {
    const builder = {
      select: () => builder,
      like: () => builder,
      not: (_col: string, _op: string, pattern: string) => {
        captured.push([pattern]);
        return builder;
      },
      then: (resolve: (r: { data: typeof rows; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return { from: () => builder } as unknown as SupabaseClient;
  }

  it("drops botmk_ rows (and botseed_) while keeping bot0## + botla…", async () => {
    const captured: string[][] = [];
    const rows = [
      { id: "1", email: "bot001@synthetic.dragoncandy.test", role: "business_client" },
      { id: "2", email: "botla1_1@synthetic.dragoncandy.test", role: "content_creator" },
      { id: "3", email: "botmk_b_1_1@synthetic.dragoncandy.test", role: "business_client" },
      { id: "4", email: "botmk_c_1_1@synthetic.dragoncandy.test", role: "content_creator" },
    ];
    const bots = await readSessionCapableBots(fakeAdmin(rows, captured));
    const emails = bots.map((b) => b.email);
    expect(emails).toEqual(["bot001@synthetic.dragoncandy.test", "botla1_1@synthetic.dragoncandy.test"]);
    // Both DB-level exclusions were applied (botseed_% and botmk_%).
    expect(captured.some((c) => c[0].startsWith("botseed_"))).toBe(true);
    expect(captured.some((c) => c[0].startsWith("botmk_"))).toBe(true);
  });
});

describe("readActiveLoadCohort (DB wrapper: botla… filter + ORDER BY email + shard slice)", () => {
  /** Fake client for the from().select().like().order() → {data,error} chain the reader uses. */
  function fakeClient(result: { data: unknown; error: { message: string } | null }): SupabaseClient {
    const terminal = Promise.resolve(result);
    const orderNode = { order: () => terminal };
    const likeNode = { like: () => orderNode };
    const selectNode = { select: () => likeNode };
    return { from: () => selectNode } as unknown as SupabaseClient;
  }

  it("returns this shard's disjoint slice from the DB rows", async () => {
    const svc = fakeClient({ data: [...activeRows(50)], error: null });
    const s0 = await readActiveLoadCohort(svc, 0, 2);
    const s1 = await readActiveLoadCohort(svc, 1, 2);
    expect(s0).toHaveLength(25);
    expect(s1).toHaveLength(25);
    const ids0 = new Set(s0.map((b) => b.userId));
    expect(s1.some((b) => ids0.has(b.userId))).toBe(false);
  });

  it("fails loud when the query errors", async () => {
    const svc = fakeClient({ data: null, error: { message: "boom" } });
    await expect(readActiveLoadCohort(svc, 0, 1)).rejects.toThrow(/readActiveLoadCohort: boom/);
  });
});
