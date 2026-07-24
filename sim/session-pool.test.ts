import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BotSession } from "./session";
import { isExpired, chooseRefreshOrMint, deriveExpiresAt, SessionPool, type PooledSession } from "./session-pool";

const SUPABASE_URL = "https://zocahiffooqdybdhguqv.supabase.co";
const BOT = "bot001@synthetic.dragoncandy.test";

/** A disposable tmp dir + session-file path, auto-cleaned by the returned dispose(). */
function tmpSessionFile(): { file: string; dispose: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "sim-session-pool-"));
  return { file: join(dir, ".session-pool.json"), dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

function readPersisted(file: string): Record<string, PooledSession> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, PooledSession>;
}

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
    const { file, dispose } = tmpSessionFile();
    let mints = 0;
    let refreshes = 0;
    const pool = new SessionPool(file, {
      url: SUPABASE_URL,
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
    const [t1, t2] = await Promise.all([pool.getToken(BOT, 0), pool.getToken(BOT, 0)]);
    try {
      expect(t1).toBe("acc-1");
      expect(t2).toBe("acc-1");
      expect(mints).toBe(1); // ← the keystone: ONE underlying call, not two
      expect(refreshes).toBe(0);
      // After the flight settles the session is cached → a third call reuses it (no new call).
      expect(await pool.getToken(BOT, 0)).toBe("acc-1");
      expect(mints).toBe(1);
    } finally {
      dispose();
    }
  });
});

describe("SessionPool refresh transition", () => {
  it("refreshes (never re-mints) a near-expiry session and ROTATES the stored refresh token", async () => {
    const { file, dispose } = tmpSessionFile();
    const skewMs = 60_000;
    let mints = 0;
    let refreshes = 0;
    let refreshedWith: string | undefined;
    const pool = new SessionPool(file, {
      url: SUPABASE_URL,
      anonKey: "anon-key",
      serviceKey: "service-key",
      skewMs,
      mint: async (): Promise<BotSession> => {
        mints += 1;
        return { access_token: "acc-mint", refresh_token: "ref-mint", expires_in: 3600 };
      },
      refresh: async (refreshToken): Promise<BotSession> => {
        refreshes += 1;
        refreshedWith = refreshToken; // must be the PRIOR stored token
        return { access_token: "acc-refreshed", refresh_token: "ref-rotated", expires_in: 3600 };
      },
    });
    try {
      // Tick 1 at t=0 mints; expiresAt = 3_600_000.
      expect(await pool.getToken(BOT, 0)).toBe("acc-mint");
      expect(mints).toBe(1);
      // Tick 2 at t inside the skew window (past expiresAt - skewMs = 3_540_000) → REFRESH path.
      const t2 = 3_599_000;
      expect(chooseRefreshOrMint({ expiresAt: 3_600_000 }, t2, skewMs).action).toBe("refresh"); // sanity
      expect(await pool.getToken(BOT, t2)).toBe("acc-refreshed");
      expect(refreshes).toBe(1);
      expect(mints).toBe(1); // no second mint
      expect(refreshedWith).toBe("ref-mint"); // refresh consumed the prior token
      // The rotated refresh token + new access token + new expiry were PERSISTED (re-using the
      // old refresh token next tick would 400 "already used").
      const persisted = readPersisted(file);
      expect(persisted[BOT].refresh_token).toBe("ref-rotated");
      expect(persisted[BOT].access_token).toBe("acc-refreshed");
      expect(persisted[BOT].expiresAt).toBe(deriveExpiresAt(t2, 3600));
    } finally {
      dispose();
    }
  });
});

describe("SessionPool cross-tick persistence", () => {
  it("loads a persisted session in a fresh pool and REUSES a still-fresh token (0 mint, 0 refresh)", async () => {
    const { file, dispose } = tmpSessionFile();
    const makeCfg = (c: { mints: number; refreshes: number }) => ({
      url: SUPABASE_URL,
      anonKey: "anon-key",
      serviceKey: "service-key",
      mint: async (): Promise<BotSession> => {
        c.mints += 1;
        return { access_token: "acc-mint", refresh_token: "ref-mint", expires_in: 3600 };
      },
      refresh: async (): Promise<BotSession> => {
        c.refreshes += 1;
        return { access_token: "acc-refreshed", refresh_token: "ref-rotated", expires_in: 3600 };
      },
    });
    try {
      // Tick 1 — pool A mints + save()s to the file.
      const a = { mints: 0, refreshes: 0 };
      const poolA = new SessionPool(file, makeCfg(a));
      poolA.load(); // no file yet — tolerated
      expect(await poolA.getToken(BOT, 0)).toBe("acc-mint");
      expect(a.mints).toBe(1);
      // Tick 2 — a SEPARATE pool over the SAME path. load() rehydrates; token still fresh → reuse.
      const b = { mints: 0, refreshes: 0 };
      const poolB = new SessionPool(file, makeCfg(b));
      poolB.load();
      expect(await poolB.getToken(BOT, 1000)).toBe("acc-mint"); // t=1s, far inside the 1h token
      expect(b.mints).toBe(0);
      expect(b.refreshes).toBe(0);
    } finally {
      dispose();
    }
  });
});
