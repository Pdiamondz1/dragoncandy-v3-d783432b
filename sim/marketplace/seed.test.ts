import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runMarketplaceSeed,
  assertMarketplaceCohortCap,
  assertMarketplaceCohortFresh,
  MARKETPLACE_MAX_BUSINESSES,
  MARKETPLACE_MAX_CREATORS,
  type SeedSteps,
  type SeedOpts,
} from "./seed";

const B1 = { userId: "b1", email: "botmk_b_1_1@synthetic.dragoncandy.test", role: "business_client" as const, personaKey: null, cohort: "marketplace" };
const C1 = { userId: "c1", email: "botmk_c_1_1@synthetic.dragoncandy.test", role: "content_creator" as const, personaKey: null, cohort: "marketplace" };

function fakeSteps(overrides: Partial<SeedSteps> = {}): SeedSteps {
  return {
    readExistingEmails: vi.fn(async () => new Set<string>()),
    mintCohort: vi.fn(async () => [B1, C1]),
    readCohortRefs: vi.fn(async () => ({ businesses: [B1], creators: [C1] })),
    completeProfiles: vi.fn(async () => 2),
    setupBusinesses: vi.fn(async () => 1),
    publishCampaigns: vi.fn(async () => [{ campaignId: "cam1", ownerId: "b1" }]),
    runCollaborations: vi.fn(async () => 1),
    seedMessaging: vi.fn(async () => 1),
    seedDragonFeed: vi.fn(async () => 1),
    promoteMultiLocation: vi.fn(async () => 1),
    seedCgc: vi.fn(async () => 1),
    ...overrides,
  };
}
const opts: SeedOpts = { businesses: 1, creators: 1, seed: 1, multiLocation: false, cgc: false };

describe("runMarketplaceSeed orchestration", () => {
  it("runs the core phases in order and skips follow-ons when flags are off", async () => {
    const steps = fakeSteps();
    const report = await runMarketplaceSeed(steps, opts);
    expect(steps.mintCohort).toHaveBeenCalled();
    expect(steps.readCohortRefs).toHaveBeenCalled();
    expect(steps.completeProfiles).toHaveBeenCalledWith([B1], [C1]); // before setupBusinesses/campaigns
    expect(steps.setupBusinesses).toHaveBeenCalledWith([B1]); // FULL cohort, not just minted
    expect(steps.publishCampaigns).toHaveBeenCalled();
    expect(steps.runCollaborations).toHaveBeenCalled();
    expect(steps.seedMessaging).toHaveBeenCalled();
    expect(steps.seedDragonFeed).toHaveBeenCalled();
    expect(steps.promoteMultiLocation).not.toHaveBeenCalled();
    expect(steps.seedCgc).not.toHaveBeenCalled();
    expect(report.collaborations).toBe(1);
  });

  it("runs the follow-ons when flags are on", async () => {
    const steps = fakeSteps();
    await runMarketplaceSeed(steps, { ...opts, multiLocation: true, cgc: true });
    expect(steps.promoteMultiLocation).toHaveBeenCalled();
    expect(steps.seedCgc).toHaveBeenCalled();
  });

  it("is resumable: a fully-present cohort mints nothing but still seeds the full cohort", async () => {
    const steps = fakeSteps({
      readExistingEmails: vi.fn(async () => new Set([B1.email, C1.email])),
      mintCohort: vi.fn(async (personas: { email: string }[]) => {
        expect(personas).toHaveLength(0); // mintCohort receives ONLY the missing personas
        return [];
      }),
    });
    const report = await runMarketplaceSeed(steps, opts);
    expect(report.skipped).toBe(2);
    expect(steps.readCohortRefs).toHaveBeenCalled();
    expect(steps.publishCampaigns).toHaveBeenCalledWith([B1]); // downstream still runs on the full cohort
  });
});

describe("assertMarketplaceCohortCap (Codex P1 — prevents a fat-fingered mass-mint on prod)", () => {
  it("accepts the target ~100/300 cohort", () => {
    expect(() => assertMarketplaceCohortCap(100, 300)).not.toThrow();
  });

  it("accepts values right at the cap", () => {
    expect(() => assertMarketplaceCohortCap(MARKETPLACE_MAX_BUSINESSES, MARKETPLACE_MAX_CREATORS)).not.toThrow();
  });

  it("rejects a fat-fingered over-cap value (e.g. 1000/3000)", () => {
    expect(() => assertMarketplaceCohortCap(1000, 3000)).toThrow(/cohort cap exceeded/);
  });

  it("rejects businesses alone exceeding the cap", () => {
    expect(() => assertMarketplaceCohortCap(MARKETPLACE_MAX_BUSINESSES + 1, 0)).toThrow(/cohort cap exceeded/);
  });

  it("rejects creators alone exceeding the cap", () => {
    expect(() => assertMarketplaceCohortCap(0, MARKETPLACE_MAX_CREATORS + 1)).toThrow(/cohort cap exceeded/);
  });

  it("rejects negative counts", () => {
    expect(() => assertMarketplaceCohortCap(-1, 300)).toThrow(/non-negative integers/);
    expect(() => assertMarketplaceCohortCap(100, -1)).toThrow(/non-negative integers/);
  });

  it("rejects non-integer counts", () => {
    expect(() => assertMarketplaceCohortCap(100.5, 300)).toThrow(/non-negative integers/);
    expect(() => assertMarketplaceCohortCap(100, NaN)).toThrow(/non-negative integers/);
  });
});

describe("assertMarketplaceCohortFresh (Codex P2 — one-shot guard against duplicate persistent data)", () => {
  /** Minimal fake client: from().select().like().limit() resolves to {data,error}. */
  function fakeClient(
    result: { data: unknown; error: { message: string } | null },
    onQuery?: (table: string, col: string, pattern: string) => void,
  ): SupabaseClient {
    return {
      from: (table: string) => ({
        select: (_col: string) => ({
          like: (likeCol: string, pattern: string) => {
            onQuery?.(table, likeCol, pattern);
            return { limit: () => Promise.resolve(result) };
          },
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it("resolves when no botmk_ cohort exists on prod", async () => {
    const svc = fakeClient({ data: [], error: null });
    await expect(assertMarketplaceCohortFresh(svc)).resolves.toBeUndefined();
  });

  it("queries profiles by the botmk_ email pattern", async () => {
    let seen: { table: string; col: string; pattern: string } | null = null;
    const svc = fakeClient({ data: [], error: null }, (table, col, pattern) => {
      seen = { table, col, pattern };
    });
    await assertMarketplaceCohortFresh(svc);
    expect(seen).toEqual({ table: "profiles", col: "email", pattern: "botmk\\_%@synthetic.dragoncandy.test" });
  });

  it("throws when a botmk_ cohort already exists (a prior run was not purged)", async () => {
    const svc = fakeClient({ data: [{ id: "u1" }], error: null });
    await expect(assertMarketplaceCohortFresh(svc)).rejects.toThrow(/already exists on prod/);
  });

  it("fails loud when the pre-flight query errors", async () => {
    const svc = fakeClient({ data: null, error: { message: "boom" } });
    await expect(assertMarketplaceCohortFresh(svc)).rejects.toThrow(/freshness pre-flight failed: boom/);
  });
});
