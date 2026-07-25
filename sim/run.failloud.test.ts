import { describe, it, expect, vi, beforeEach } from "vitest";

// Drive cmdMint/cmdTick/cmdMarketplacePurge down their fail-loud branches with NO network and NO
// SIM_* env by mocking the boundary modules. Kept in its own file so run.test.ts's dry-run test can
// keep proving the dry-run path constructs no client (vi.mock is per-file).
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("./clients", () => ({
  serviceClient: () => ({ __fake: true, rpc: rpcMock }),
  botClient: () => ({ __fake: true }),
}));
vi.mock("./env", () => ({
  assertRuntimeBootSafety: vi.fn(async () => {}),
  readKillSwitch: vi.fn(async () => true),
}));
vi.mock("./mint", () => ({
  mintBot: vi.fn(async () => {}),
  readCohort: vi.fn(async () => ({ bots: [], crews: [], campaigns: [], applications: [], collaborations: [] })),
  readSessionCapableBots: vi.fn(async () => []),
  readActiveLoadCohort: vi.fn(async () => []),
}));

import { main } from "./run";
import { mintBot, readCohort } from "./mint";
import type { BotRef } from "./types";

const EMPTY = { bots: [], crews: [], campaigns: [], applications: [], collaborations: [] };
const FAKE_BOT: BotRef = { userId: "u", email: "bot@synthetic.dragoncandy.test", role: "content_creator", personaKey: null, cohort: "phase1" };

describe("fail-loud harness contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(readCohort).mockResolvedValue(EMPTY);
    vi.mocked(mintBot).mockResolvedValue(FAKE_BOT);
  });

  it("tick THROWS on an empty cohort — a scheduled tick must not report green doing nothing", async () => {
    await expect(main(["tick"])).rejects.toThrow(/no synthetic cohort/);
  });

  it("mint THROWS when any bot fails to mint — a partial cohort must not report green", async () => {
    vi.mocked(mintBot).mockRejectedValue(new Error("email already exists"));
    await expect(main(["mint", "--n", "3"])).rejects.toThrow(/cohort incomplete/);
  });

  it("mint RESOLVES when every bot mints", async () => {
    await expect(main(["mint", "--n", "3"])).resolves.toBeUndefined();
    expect(vi.mocked(mintBot)).toHaveBeenCalledTimes(3);
  });
});

describe("marketplace-purge (botmk-scoped teardown — mirrors cmdPurge's residual contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("THROWS when purge_synthetic_marketplace_cohort reports a non-zero residual", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { deleted_users: 3, residual_profiles: 0, residual_organizations: 1, residual_storage: 0 },
      error: null,
    });
    await expect(main(["marketplace-purge"])).rejects.toThrow(/non-zero residuals/);
    expect(rpcMock).toHaveBeenCalledWith("purge_synthetic_marketplace_cohort");
  });

  it("RESOLVES cleanly when every residual_* is zero", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        deleted_users: 3,
        residual_profiles: 0,
        residual_organizations: 0,
        residual_org_units: 0,
        residual_promotions: 0,
        residual_storage: 0,
      },
      error: null,
    });
    await expect(main(["marketplace-purge"])).resolves.toBeUndefined();
  });

  it("THROWS when the RPC itself errors", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "function not found" } });
    await expect(main(["marketplace-purge"])).rejects.toThrow(/marketplace purge failed/);
  });
});
