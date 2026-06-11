// Shared Google Workspace helpers (GW PR 1) — used by google-workspace-proxy
// and (from GW PR 4) donny-chat's Workspace tools, so the OAuth/token/Drive
// logic exists exactly once.
//
// Scope model: drive.file only (non-sensitive). The app sees only files it
// created — the hub is the "DragonCandy AIOS" folder it bootstraps per account.
// Tokens NEVER leave the backend; callers receive data, links, or typed errors.
// Spec: docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md

// deno-lint-ignore-file no-explicit-any

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

// openid + email are required for the id_token that carries the account
// identity (email/hd); both are non-sensitive OIDC scopes.
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.file",
];
export const DC_FOLDER_NAME = "DragonCandy AIOS";

export class GoogleWorkspaceError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new GoogleWorkspaceError("not_configured", `${name} is not configured`, 503);
  return v;
}

// ---------------------------------------------------------------------------
// HMAC-signed OAuth state: tamper resistance + TTL + user binding. (Replay is
// covered by Google's single-redemption authorization codes — spec §3.A.)
// ---------------------------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env("GOOGLE_OAUTH_STATE_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export interface OAuthState {
  user_id: string;
  host: string;
  nonce: string;
  iat: number;
}

export async function signState(payload: OAuthState): Promise<string> {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), body));
  return `${b64url(body)}.${b64url(sig)}`;
}

const STATE_TTL_MS = 10 * 60 * 1000;

export async function verifyState(state: string, expectedUserId: string): Promise<OAuthState> {
  const dot = state.lastIndexOf(".");
  if (dot < 0) throw new GoogleWorkspaceError("bad_state", "Malformed state");
  const body = b64urlDecode(state.slice(0, dot));
  const sig = b64urlDecode(state.slice(dot + 1));
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), sig as BufferSource, body as BufferSource);
  if (!ok) throw new GoogleWorkspaceError("bad_state", "State signature mismatch", 403);
  const payload = JSON.parse(new TextDecoder().decode(body)) as OAuthState;
  if (Date.now() - payload.iat > STATE_TTL_MS) {
    throw new GoogleWorkspaceError("state_expired", "State expired — restart the connect flow", 403);
  }
  if (payload.user_id !== expectedUserId) {
    throw new GoogleWorkspaceError("bad_state", "State does not belong to this user", 403);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// OAuth: consent URL, code exchange, refresh, revoke
// ---------------------------------------------------------------------------

const REDIRECT_HOSTS = new Set(["internal.dragoncandy.io", "dragoncandy.io"]);

export function redirectUriFor(host: string): string {
  if (!REDIRECT_HOSTS.has(host)) {
    throw new GoogleWorkspaceError("bad_host", `Host ${host} is not a registered OAuth origin`, 403);
  }
  return `https://${host}/internal/workspace/callback`;
}

export function buildAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // guarantees a refresh_token on every connect
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error("[google-workspace] code exchange failed:", resp.status, body.slice(0, 300));
    throw new GoogleWorkspaceError("exchange_failed", "Google rejected the authorization code", 400);
  }
  return resp.json();
}

/** Parse the (already server-trusted) id_token payload for email/hd. */
export function parseIdToken(idToken: string): { email?: string; hd?: string } {
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(idToken.split(".")[1])));
    return { email: payload.email, hd: payload.hd };
  } catch {
    return {};
  }
}

/** Revoke a token at Google. Returns true on confirmed revocation. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const resp = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!resp.ok) {
      console.error("[google-workspace] revoke failed:", resp.status, (await resp.text()).slice(0, 200));
    }
    return resp.ok;
  } catch (err) {
    console.error("[google-workspace] revoke errored:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Token loading with inline refresh. Failure to refresh (revoked at Google)
// marks the row needs_reconnect and surfaces a typed error.
// ---------------------------------------------------------------------------

export interface GoogleAccount {
  id: string;
  user_id: string;
  google_email: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  dc_folder_id: string | null;
  status: string;
}

export async function getValidAccessToken(
  supabaseAdmin: any,
  userId: string
): Promise<{ token: string; account: GoogleAccount }> {
  const { data: account, error } = await supabaseAdmin
    .from("google_workspace_accounts")
    .select("id, user_id, google_email, refresh_token, access_token, access_token_expires_at, dc_folder_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!account || account.status === "revoked") {
    throw new GoogleWorkspaceError("not_connected", "No Google connection — connect at /internal/workspace", 409);
  }
  if (account.status === "needs_reconnect") {
    throw new GoogleWorkspaceError("needs_reconnect", "Google connection needs to be re-linked", 409);
  }

  const expiresAt = account.access_token_expires_at ? Date.parse(account.access_token_expires_at) : 0;
  if (account.access_token && expiresAt - Date.now() > 60_000) {
    return { token: account.access_token, account };
  }

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: account.refresh_token,
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error("[google-workspace] refresh failed:", resp.status, body.slice(0, 200));
    await supabaseAdmin
      .from("google_workspace_accounts")
      .update({ status: "needs_reconnect" })
      .eq("id", account.id);
    throw new GoogleWorkspaceError("needs_reconnect", "Google connection expired — re-link at /internal/workspace", 409);
  }
  const fresh = (await resp.json()) as TokenResponse;
  await supabaseAdmin
    .from("google_workspace_accounts")
    .update({
      access_token: fresh.access_token,
      access_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
    })
    .eq("id", account.id);
  return { token: fresh.access_token, account };
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

export async function driveRequest(token: string, url: string, init: RequestInit = {}): Promise<any> {
  const resp = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error("[google-workspace] Drive API error:", resp.status, body.slice(0, 300));
    throw new GoogleWorkspaceError("google_api_error", `Google API error (${resp.status})`, 502);
  }
  return resp.status === 204 ? null : resp.json();
}

/** Find or create the per-account "DragonCandy AIOS" folder (drive.file sees only app files). */
export async function findOrCreateDcFolder(token: string): Promise<string> {
  const q = encodeURIComponent(
    `name = '${DC_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const found = await driveRequest(token, `${DRIVE_FILES_URL}?q=${q}&fields=files(id)`);
  if (found.files?.length) return found.files[0].id;

  const created = await driveRequest(token, DRIVE_FILES_URL, {
    method: "POST",
    body: JSON.stringify({ name: DC_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  return created.id;
}
