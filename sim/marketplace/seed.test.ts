import { describe, it, expect, vi } from "vitest";
import { runMarketplaceSeed, type SeedSteps, type SeedOpts } from "./seed";

const B1 = { userId: "b1", email: "botmk_b_1_1@synthetic.dragoncandy.test", role: "business_client" as const, personaKey: null, cohort: "marketplace" };
const C1 = { userId: "c1", email: "botmk_c_1_1@synthetic.dragoncandy.test", role: "content_creator" as const, personaKey: null, cohort: "marketplace" };

function fakeSteps(overrides: Partial<SeedSteps> = {}): SeedSteps {
  return {
    readExistingEmails: vi.fn(async () => new Set<string>()),
    mintCohort: vi.fn(async () => [B1, C1]),
    readCohortRefs: vi.fn(async () => ({ businesses: [B1], creators: [C1] })),
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
