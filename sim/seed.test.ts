import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  planSeed,
  generateActiveCohort,
  activeEmail,
  assertActiveNamespaceFree,
  isDepthPoolEmail,
} from "./seed";

describe("planSeed", () => {
  it("caps active at activeMax and gives depth the remainder", () => {
    expect(planSeed(200, 25)).toEqual({ depthCount: 175, activeCount: 25 });
  });

  it("activeCount = min(activeMax, n): when n < activeMax everything is active, depth is 0", () => {
    expect(planSeed(10, 25)).toEqual({ depthCount: 0, activeCount: 10 });
  });

  it("activeCount never exceeds activeMax", () => {
    for (const [n, cap] of [[200, 25], [1000, 50], [5, 25], [0, 25]] as const) {
      expect(planSeed(n, cap).activeCount).toBeLessThanOrEqual(cap);
    }
  });

  it("depthCount + activeCount === n (accounts for the whole population)", () => {
    for (const [n, cap] of [[200, 25], [1000, 50], [5, 25], [25, 25]] as const) {
      const { depthCount, activeCount } = planSeed(n, cap);
      expect(depthCount + activeCount).toBe(n);
    }
  });

  it("clamps nonsensical negatives to zero (never a negative count)", () => {
    expect(planSeed(-5, 25)).toEqual({ depthCount: 0, activeCount: 0 });
    expect(planSeed(10, -3)).toEqual({ depthCount: 10, activeCount: 0 });
  });
});

describe("generateActiveCohort", () => {
  it("emits the distinct botla<seed>_<i> namespace (never the live bot### scheme)", () => {
    const cohort = generateActiveCohort(5, { creators: 0.6 }, 7, "load");
    expect(cohort).toHaveLength(5);
    for (const p of cohort) {
      expect(p.email).toMatch(/^botla7_\d+@synthetic\.dragoncandy\.test$/);
      // Never the bare index-based scheme the live daily cohort already occupies.
      expect(p.email).not.toMatch(/^bot\d+@synthetic\.dragoncandy\.test$/);
    }
    expect(cohort.map((p) => p.email)).toEqual([
      "botla7_1@synthetic.dragoncandy.test",
      "botla7_2@synthetic.dragoncandy.test",
      "botla7_3@synthetic.dragoncandy.test",
      "botla7_4@synthetic.dragoncandy.test",
      "botla7_5@synthetic.dragoncandy.test",
    ]);
  });

  it("stays under the synthetic domain (assertSyntheticEmail / handle_new_user LIKE still fire)", () => {
    for (const p of generateActiveCohort(8, { creators: 0.5 }, 1, "load")) {
      expect(p.email.endsWith("@synthetic.dragoncandy.test")).toBe(true);
    }
  });

  it("carries generateCohort's role/persona split (only the email is remapped)", () => {
    const cohort = generateActiveCohort(10, { creators: 0.6 }, 3, "load");
    expect(cohort.filter((p) => p.role === "content_creator")).toHaveLength(6);
    expect(cohort.filter((p) => p.role === "business_client")).toHaveLength(4);
    expect(cohort.every((p) => p.cohort === "load")).toBe(true);
  });

  it("is deterministic for a given seed (same args → deep-equal)", () => {
    expect(generateActiveCohort(6, { creators: 0.5 }, 2, "load")).toEqual(
      generateActiveCohort(6, { creators: 0.5 }, 2, "load"),
    );
  });

  it("emits unique emails across the cohort", () => {
    const cohort = generateActiveCohort(25, { creators: 0.65 }, 9, "load");
    expect(new Set(cohort.map((p) => p.email)).size).toBe(25);
  });

  it("distinct seeds yield distinct namespaces (no cross-seed collision)", () => {
    const a = generateActiveCohort(3, { creators: 0.5 }, 1, "load").map((p) => p.email);
    const b = generateActiveCohort(3, { creators: 0.5 }, 2, "load").map((p) => p.email);
    expect(a.some((e) => b.includes(e))).toBe(false);
  });
});

describe("isDepthPoolEmail (keeps the inert depth pool out of the load driver)", () => {
  it("matches only the botseed_ depth namespace", () => {
    expect(isDepthPoolEmail("botseed_load_3@synthetic.dragoncandy.test")).toBe(true);
    expect(isDepthPoolEmail("botseed_phase1_42@synthetic.dragoncandy.test")).toBe(true);
  });
  it("does NOT match the session-capable cohorts (live bot0## + active botla…)", () => {
    expect(isDepthPoolEmail("bot001@synthetic.dragoncandy.test")).toBe(false);
    expect(isDepthPoolEmail("bot025@synthetic.dragoncandy.test")).toBe(false);
    expect(isDepthPoolEmail("botla7_1@synthetic.dragoncandy.test")).toBe(false);
  });
  it("classifies every generated active-cohort email as session-capable", () => {
    for (const p of generateActiveCohort(10, { creators: 0.6 }, 3, "load")) {
      expect(isDepthPoolEmail(p.email)).toBe(false);
    }
  });
});

describe("activeEmail", () => {
  it("is 1-based and under the synthetic domain", () => {
    expect(activeEmail(7, 0)).toBe("botla7_1@synthetic.dragoncandy.test");
    expect(activeEmail(3, 4)).toBe("botla3_5@synthetic.dragoncandy.test");
  });
});

describe("assertActiveNamespaceFree (the pre-flight that prevents a half-seeded prod cohort)", () => {
  const active = generateActiveCohort(2, { creators: 0.5 }, 1, "load");
  const emails = active.map((p) => p.email);

  /** Minimal fake client: from().select().in() resolves to {data,error}; records the query it saw. */
  function fakeClient(
    result: { data: unknown; error: { message: string } | null },
    onQuery?: (table: string, col: string, vals: unknown) => void,
  ): SupabaseClient {
    return {
      from: (table: string) => ({
        select: () => ({
          in: (col: string, vals: unknown) => {
            onQuery?.(table, col, vals);
            return Promise.resolve(result);
          },
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it("short-circuits on an empty cohort (never queries)", async () => {
    let queried = false;
    const svc = fakeClient({ data: [], error: null }, () => {
      queried = true;
    });
    await expect(assertActiveNamespaceFree(svc, [])).resolves.toBeUndefined();
    expect(queried).toBe(false);
  });

  it("queries profiles.email by the cohort emails and resolves when none exist", async () => {
    let seen: { table: string; col: string; vals: unknown } | null = null;
    const svc = fakeClient({ data: [], error: null }, (table, col, vals) => {
      seen = { table, col, vals };
    });
    await expect(assertActiveNamespaceFree(svc, active)).resolves.toBeUndefined();
    expect(seen).toEqual({ table: "profiles", col: "email", vals: emails });
  });

  it("fails loud when the pre-flight query errors", async () => {
    const svc = fakeClient({ data: null, error: { message: "boom" } });
    await expect(assertActiveNamespaceFree(svc, active)).rejects.toThrow(/pre-flight query failed: boom/);
  });

  it("fails loud when the active namespace is already present (a prior run was not purged)", async () => {
    const svc = fakeClient({ data: [{ email: "botla1_1@synthetic.dragoncandy.test" }], error: null });
    await expect(assertActiveNamespaceFree(svc, active)).rejects.toThrow(/already present on prod/);
  });
});
