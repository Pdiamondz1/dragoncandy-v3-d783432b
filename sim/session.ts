// Per-bot session minting — the direct-API adapter's key. Mirrors staging-login.mjs:
// admin generate_link (magiclink) → /auth/v1/verify → a real { access_token, refresh_token },
// with no password anywhere. The token is then handed to botClient() so writes apply RLS
// as the bot.
//
// SAFETY: assertSessionMintTarget refuses to mint a session for any non-synthetic email
// (never impersonate a real user) and only talks to a *.supabase.co host (so the service
// key + minted tokens never leak to a foreign origin).

import { assertSyntheticEmail } from "./mint";

export interface BotSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Validate the target; returns the normalized base URL (no trailing slash). Pure. */
export function assertSessionMintTarget(url: string | undefined, email: string): string {
  if (!url) throw new Error("mintBotSession requires SIM_SUPABASE_URL");
  assertSyntheticEmail(email); // never mint a session for a real user
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    throw new Error(`mintBotSession: refusing non-supabase host: ${url}`);
  }
  return url.replace(/\/$/, "");
}

// ── 429 resilience ──────────────────────────────────────────────────────────────────────────────
// Minting a per-bot session is two auth calls (generate_link + verify). At scale these can hit
// Supabase's per-IP auth rate limit (429) — the N=25 run surfaced it. Retry with exponential backoff
// (honoring Retry-After) so a transient/borderline limit doesn't red-fail the unattended daily cron.
// A sustained hard-window exhaustion still fails loud after the retries — by design (the real fix for
// high frequency is cross-tick session reuse; see sim/README).

const RETRYABLE_STATUS = new Set([429, 503]);

export interface RetryOptions {
  retries?: number; // extra attempts after the first (default 4)
  baseDelayMs?: number; // default 500
  maxDelayMs?: number; // default 8000
  sleep?: (ms: number) => Promise<void>; // injectable for tests
}

/** Parse a Retry-After header (delta-seconds form) to ms; null if absent/unparseable. Pure. */
export function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null;
  const secs = Number(header.trim());
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : null;
}

/** Deterministic exponential backoff for a 0-based attempt, capped at maxDelayMs. Pure. */
export function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
}

/**
 * Run a fetch, retrying on 429/503 with backoff (honoring Retry-After) up to `retries` times. Returns
 * the final Response — the caller still checks `.ok`, so an exhausted-retry 429 fails loud exactly as
 * before, just after trying. Non-retryable statuses (incl. success) return immediately.
 */
export async function fetchWithRetry(
  doFetch: () => Promise<Response>,
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let attempt = 0;
  for (;;) {
    const res = await doFetch();
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= retries) return res;
    const wait =
      parseRetryAfter(res.headers.get("retry-after")) ?? backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
    await res.body?.cancel().catch(() => {}); // discard the throwaway body before retrying
    await sleep(wait);
    attempt += 1;
  }
}

/** Mint a real session for one synthetic bot (magiclink → verify). Service-role key required. */
export async function mintBotSession(
  url: string | undefined,
  serviceKey: string,
  email: string,
  retry: RetryOptions = {},
): Promise<BotSession> {
  const base = assertSessionMintTarget(url, email);

  const genRes = await fetchWithRetry(
    () =>
      fetch(`${base}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "magiclink", email }),
      }),
    retry,
  );
  if (!genRes.ok) {
    throw new Error(`generate_link failed (${genRes.status}) for ${email}`);
  }
  const link = (await genRes.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  if (!tokenHash) throw new Error(`no hashed_token in generate_link response for ${email}`);

  const verifyRes = await fetchWithRetry(
    () =>
      fetch(`${base}/auth/v1/verify`, {
        method: "POST",
        headers: { apikey: serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
      }),
    retry,
  );
  if (!verifyRes.ok) {
    throw new Error(`verify failed (${verifyRes.status}) for ${email}`);
  }
  const session = (await verifyRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!session.access_token || !session.refresh_token) {
    throw new Error(`no session in verify response for ${email}`);
  }
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
  };
}
