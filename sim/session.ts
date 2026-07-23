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

/** Mint a real session for one synthetic bot (magiclink → verify). Service-role key required. */
export async function mintBotSession(
  url: string | undefined,
  serviceKey: string,
  email: string,
): Promise<BotSession> {
  const base = assertSessionMintTarget(url, email);

  const genRes = await fetch(`${base}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!genRes.ok) {
    throw new Error(`generate_link failed (${genRes.status}) for ${email}`);
  }
  const link = (await genRes.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  if (!tokenHash) throw new Error(`no hashed_token in generate_link response for ${email}`);

  const verifyRes = await fetch(`${base}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
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
