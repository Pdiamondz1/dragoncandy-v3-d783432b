import { describe, it, expect, vi, beforeEach } from "vitest";

// Drive cmdMint/cmdTick down their fail-loud branches with NO network and NO SIM_* env by mocking
// the boundary modules. Kept in its own file so run.test.ts's dry-run test can keep proving the
// dry-run path constructs no client (vi.mock is per-file).
vi.mock("./clients", () => ({
  serviceClient: () => ({ __fake: true }),
  botClient: () => ({ __fake: true }),
}));
vi.mock("./env", () => ({
  assertRuntimeBootSafety: vi.fn(async () => {}),
}));
vi.mock("./mint", () => ({
  mintBot: vi.fn(async () => {}),
  readCohort: vi.fn(async () => ({ bots: [], crews: [], campaigns: [], applications: [], collaborations: [] })),
}));

import { main } from "./run";
import { mintBot, readCohort } from "./mint";
import type { BotRef } from "./types";

const EMPTY = { bots: [], crews: [], campaigns: [], applications: [], collaborations: [] };
const FAKE_BOT: BotRef = { userId: "u", email: "bot@synthetic.dragoncandy.test", role: "content_creator", personaKey: null, cohort: "phase1" };

describe("fail-loud harness contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
