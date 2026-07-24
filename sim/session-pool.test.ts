import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isExpired, chooseRefreshOrMint, deriveExpiresAt, SessionPool } from "./session-pool";

describe("deriveExpiresAt", () => {
  it("is now + expires_in seconds (ms)", () => {
    expect(deriveExpiresAt(1000, 3600)).toBe(1000 + 3600 * 1000);
  });
});
describe("isExpired", () => {
  it("treats a token inside the skew window as expired", () => {
    expect(isExpired({ expiresAt: 1_000_000 }, 940_000, 60_000)).toBe(true);
    expect(isExpired({ expiresAt: 1_000_000 }, 930_000, 60_000)).toBe(false);
  });
});
describe("chooseRefreshOrMint", () => {
  it("mints when absent, refreshes when present+expired, reuses when fresh", () => {
    expect(chooseRefreshOrMint(undefined, 0, 60_000).action).toBe("mint");
    expect(chooseRefreshOrMint({ expiresAt: 100 }, 100_000, 60_000).action).toBe("refresh");
    expect(chooseRefreshOrMint({ expiresAt: 10_000_000 }, 100_000, 60_000).action).toBe("reuse");
  });
});

describe("SessionPool single-flight", () => {
  it("collapses two concurrent getToken(email) for one bot into exactly ONE mint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sim-session-pool-"));
    const file = join(dir, ".session-pool.json");
    let mints = 0;
    let refreshes = 0;
    const pool = new SessionPool(file, {
      url: "https://zocahiffooqdybdhguqv.supabase.co",
      anonKey: "anon-key",
      serviceKey: "service-key",
      // Injected mint/refresh — no network; count invocations. Hold the flight open so
      // both getToken calls overlap (this is what the single-flight guard must survive:
      // GoTrue rotates the refresh token per refresh, so a double-refresh 400s "already used").
      mint: async () => {
        mints += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { access_token: "acc-1", refresh_token: "ref-1", expires_in: 3600 };
      },
      refresh: async () => {
        refreshes += 1;
        return { access_token: "acc-2", refresh_token: "ref-2", expires_in: 3600 };
      },
    });
    const email = "bot001@synthetic.dragoncandy.test";
    const [t1, t2] = await Promise.all([pool.getToken(email, 0), pool.getToken(email, 0)]);
    try {
      expect(t1).toBe("acc-1");
      expect(t2).toBe("acc-1");
      expect(mints).toBe(1); // ← the keystone: ONE underlying call, not two
      expect(refreshes).toBe(0);
      // After the flight settles the session is cached → a third call reuses it (no new call).
      expect(await pool.getToken(email, 0)).toBe("acc-1");
      expect(mints).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
