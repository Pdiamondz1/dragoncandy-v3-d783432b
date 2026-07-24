// Cross-tick session pool — the keystone that lets the harness tick frequently / at scale
// without tripping Supabase's per-IP auth rate limit (429).
//
// Today every tick re-mints a per-bot session (magiclink → verify = TWO auth calls, one of
// them the rate-limited admin generate_link). This pool persists each bot's session to a
// gitignored JSON file and, when a token is near expiry, REFRESHES it (one call to the
// /token?grant_type=refresh_token endpoint) instead of re-minting. A still-fresh token is
// reused with no call at all.
//
// Pure token logic (deriveExpiresAt / isExpired / chooseRefreshOrMint) is unit-tested; the
// network calls (mintBotSession / refreshSession) are injectable so the pool's concurrency
// guard can be tested without a live DB. File I/O is a thin, atomic wrapper.
//
// SAFETY: refreshSession only ever POSTs a refresh token to a *.supabase.co host (so a bot's
// session never leaks to a foreign origin), and NOTHING here ever logs a token value.
//
// Conventional (gitignored) persistence path: `sim/.session-pool.json` — it holds live refresh
// tokens and must never be committed (see the repo .gitignore).

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { fetchWithRetry, mintBotSession, type BotSession, type RetryOptions } from "./session";

/** One bot's persisted session. `expiresAt` is an absolute epoch-ms deadline (not a duration). */
export interface PooledSession {
  access_token: string;
  refresh_token: string;
  expiresAt: number;
}

/** The only field the pure expiry helpers need — so a full PooledSession is accepted structurally. */
type ExpiryInfo = { expiresAt: number };

export type RefreshAction = "mint" | "refresh" | "reuse";

// ── Pure token logic ──────────────────────────────────────────────────────────────────────────────

/** Absolute expiry deadline (epoch ms) for a session minted/refreshed at `nowMs` with `expires_in` seconds. */
export function deriveExpiresAt(nowMs: number, expiresInSec: number): number {
  return nowMs + expiresInSec * 1000;
}

/** True once we are within `skewMs` of (or past) the deadline — refresh proactively, never on a dead token. */
export function isExpired(s: ExpiryInfo, nowMs: number, skewMs: number): boolean {
  return s.expiresAt - skewMs <= nowMs;
}

/** Decide what a bot needs: mint (no session), refresh (present but near/past expiry), or reuse (still fresh). */
export function chooseRefreshOrMint(
  existing: ExpiryInfo | undefined,
  nowMs: number,
  skewMs: number,
): { action: RefreshAction } {
  if (!existing) return { action: "mint" };
  return { action: isExpired(existing, nowMs, skewMs) ? "refresh" : "reuse" };
}

// ── Refresh call ────────────────────────────────────────────────────────────────────────────────

/** Guard the target host (never POST a refresh token to a foreign origin) and normalize the URL. Pure. */
function assertSupabaseTarget(url: string): string {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    throw new Error(`refreshSession: refusing non-supabase host: ${url}`);
  }
  return url.replace(/\/$/, "");
}

/**
 * Exchange a refresh token for a fresh session (ONE call), retrying 429/503 via the shared
 * fetchWithRetry. Mirrors mintBotSession's fetch + `.ok` fail-loud style. GoTrue rotates the
 * refresh token on success, so the returned `refresh_token` REPLACES the old one — the caller
 * must persist it (a re-used old token 400s "already used"). Never logs the token.
 */
export async function refreshSession(
  url: string,
  anonKey: string,
  refreshToken: string,
  retry: RetryOptions = {},
): Promise<BotSession> {
  const base = assertSupabaseTarget(url);
  const res = await fetchWithRetry(
    () =>
      fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }),
    retry,
  );
  if (!res.ok) {
    throw new Error(`refresh_token failed (${res.status})`);
  }
  const session = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!session.access_token || !session.refresh_token) {
    throw new Error("no session in refresh_token response");
  }
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
  };
}

// ── The pool ────────────────────────────────────────────────────────────────────────────────────

/** Mint a session for one bot email. Defaults to the real mintBotSession; injectable for tests. */
export type MintFn = (email: string) => Promise<BotSession>;
/** Refresh a session from a refresh token. Defaults to the real refreshSession; injectable for tests. */
export type RefreshFn = (refreshToken: string) => Promise<BotSession>;

export interface SessionPoolConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
  skewMs?: number; // refresh this far before the real expiry (default 60s)
  mint?: MintFn; // injectable — defaults to mintBotSession(url, serviceKey, email)
  refresh?: RefreshFn; // injectable — defaults to refreshSession(url, anonKey, refreshToken)
}

const DEFAULT_SKEW_MS = 60_000;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Runtime shape guard for a persisted entry (a hand-edited/corrupt file must not poison the pool). */
function isPooledSession(v: unknown): v is PooledSession {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.access_token === "string" &&
    typeof s.refresh_token === "string" &&
    typeof s.expiresAt === "number"
  );
}

export class SessionPool {
  private readonly filePath: string;
  private readonly skewMs: number;
  private readonly mint: MintFn;
  private readonly refresh: RefreshFn;
  private readonly sessions = new Map<string, PooledSession>();
  // Per-bot single-flight: one in-flight refresh/mint per email; concurrent callers share it.
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(filePath: string, config: SessionPoolConfig) {
    this.filePath = filePath;
    this.skewMs = config.skewMs ?? DEFAULT_SKEW_MS;
    const { url, anonKey, serviceKey } = config;
    this.mint = config.mint ?? ((email) => mintBotSession(url, serviceKey, email));
    this.refresh = config.refresh ?? ((refreshToken) => refreshSession(url, anonKey, refreshToken));
  }

  /** Load persisted sessions from disk. A missing file is fine (first run); a corrupt one is warned + skipped. */
  load(): void {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // no cache yet — expected
      console.warn(`[session-pool] could not read ${this.filePath}: ${errMsg(e)}`);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [email, s] of Object.entries(parsed)) {
        if (isPooledSession(s)) this.sessions.set(email, s);
      }
    } catch (e) {
      console.warn(`[session-pool] ignoring corrupt session file ${this.filePath}: ${errMsg(e)}`);
    }
  }

  /** Persist all sessions atomically (write a unique temp file, then rename over the target). */
  save(): void {
    const obj: Record<string, PooledSession> = {};
    for (const [email, s] of this.sessions) obj[email] = s;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    renameSync(tmp, this.filePath);
  }

  /**
   * Return a usable access token for `email` as of `nowMs`: reuse a fresh one, refresh a
   * near-expiry one (1 call), or mint when there is none (2 calls). Concurrent calls for the
   * SAME email collapse into a single underlying refresh/mint (single-flight) — critical
   * because GoTrue rotates + invalidates the refresh token on each refresh.
   */
  getToken(email: string, nowMs: number): Promise<string> {
    const inflight = this.inflight.get(email);
    if (inflight) return inflight;
    const p = this.resolveToken(email, nowMs).finally(() => {
      this.inflight.delete(email);
    });
    this.inflight.set(email, p);
    return p;
  }

  private async resolveToken(email: string, nowMs: number): Promise<string> {
    const existing = this.sessions.get(email);
    const { action } = chooseRefreshOrMint(existing, nowMs, this.skewMs);
    if (action === "reuse" && existing) return existing.access_token;
    const fresh =
      action === "refresh" && existing
        ? await this.refresh(existing.refresh_token)
        : await this.mint(email);
    const pooled: PooledSession = {
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expiresAt: deriveExpiresAt(nowMs, fresh.expires_in),
    };
    this.sessions.set(email, pooled);
    // Persistence is an optimization (skip a re-mint next tick), not part of auth: a disk hiccup
    // must NOT abort an action that already holds a valid token. Warn, keep the in-memory session.
    try {
      this.save();
    } catch (e) {
      console.warn(`[session-pool] could not persist ${this.filePath}: ${errMsg(e)}`);
    }
    return pooled.access_token;
  }
}
