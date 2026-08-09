// Shared Google Workspace helpers (GW PR 1) — used by google-workspace-proxy
// and (from GW PR 4) donny-chat's Workspace tools, so the OAuth/token/Drive
// logic exists exactly once.
//
// Scope model: drive.file only (non-sensitive). The app sees only files it
// created — the hub is the "DragonCandy AIOS" folder it bootstraps per account.
// Tokens NEVER leave the backend; callers receive data, links, or typed errors.
// Spec: docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md

// deno-lint-ignore-file no-explicit-any

import { pickExportMode, capText, EXPORT_CAP } from "./drive-export.ts";

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

// Hostnames (not origins) whose /internal/workspace/callback is a registered
// Google OAuth redirect URI. Every entry here MUST also be listed verbatim in
// the Google Cloud console credential, or the exchange fails redirect_uri_mismatch
// — the two sides are changed together, never one at a time.
//
// `www` is included because it genuinely serves the app: https://www.dragoncandy.io
// returns 200, NOT a redirect to the apex (measured 2026-08-09 — the Vercel
// cutover runbook describes a www→apex redirect that is not actually live). The
// caller sends `window.location.hostname`, so a founder who reaches
// /internal/workspace on www would otherwise fail `bad_host` before ever seeing
// Google consent. That was already broken on .io; listing www fixes it rather
// than depending on a redirect that does not exist.
const REDIRECT_HOSTS = new Set([
  "dragoncandy.com",
  "www.dragoncandy.com",
  "internal.dragoncandy.com",
  "dragoncandy.io",
  "www.dragoncandy.io",
  "internal.dragoncandy.io",
]);

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

export type RevokeOutcome = "revoked" | "already_invalid" | "failed";

/**
 * Revoke a token at Google. Per Google's OAuth docs: 200 = revoked; 400 means
 * the token is invalid/already revoked — nothing live remains at Google, so
 * callers may treat it as terminal success. Anything else (network, 5xx) is a
 * transient failure worth retrying.
 */
export async function revokeToken(token: string): Promise<RevokeOutcome> {
  try {
    const resp = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (resp.ok) return "revoked";
    const body = (await resp.text()).slice(0, 200);
    console.error("[google-workspace] revoke non-OK:", resp.status, body);
    return resp.status === 400 ? "already_invalid" : "failed";
  } catch (err) {
    console.error("[google-workspace] revoke errored:", err instanceof Error ? err.message : err);
    return "failed";
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

/** Resolve the account's DragonCandy folder id, bootstrapping + persisting it if missing. */
export async function ensureDcFolder(
  supabaseAdmin: any,
  account: GoogleAccount,
  token: string
): Promise<string> {
  if (account.dc_folder_id) return account.dc_folder_id;
  const folderId = await findOrCreateDcFolder(token);
  await supabaseAdmin
    .from("google_workspace_accounts")
    .update({ dc_folder_id: folderId })
    .eq("id", account.id);
  return folderId;
}

/** Token + DragonCandy-folder context shared by every Drive action. */
export async function driveCtx(
  supabaseAdmin: any,
  userId: string
): Promise<{ token: string; account: GoogleAccount; folderId: string }> {
  const { token, account } = await getValidAccessToken(supabaseAdmin, userId);
  return { token, account, folderId: await ensureDcFolder(supabaseAdmin, account, token) };
}

const FILE_FIELDS = "id,name,mimeType,modifiedTime,webViewLink,webContentLink";

/** Google-native file kinds creatable from the hub. */
const GOOGLE_FILE_KINDS: Record<string, string> = {
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
};

/** Validate a creatable file kind and return its Google mimeType. */
export function assertFileKind(kind: unknown): string {
  const mimeType = typeof kind === "string" ? GOOGLE_FILE_KINDS[kind] : undefined;
  if (!mimeType) {
    throw new GoogleWorkspaceError("bad_kind", "kind must be doc, sheet, or slides");
  }
  return mimeType;
}

const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,100}$/;

export function assertDriveFileId(fileId: unknown): string {
  if (typeof fileId !== "string" || !DRIVE_FILE_ID.test(fileId)) {
    throw new GoogleWorkspaceError("bad_file_id", "Invalid file id");
  }
  return fileId;
}

export function assertFileName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > 200) {
    throw new GoogleWorkspaceError("bad_name", "File name must be 1–200 characters");
  }
  return trimmed;
}

export async function listDcFiles(token: string, folderId: string): Promise<any[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: "modifiedTime desc",
    pageSize: "100",
    fields: `files(${FILE_FIELDS})`,
  });
  const data = await driveRequest(token, `${DRIVE_FILES_URL}?${params}`);
  return data.files ?? [];
}

const DRIVE_EXPORT_URL = "https://www.googleapis.com/drive/v3/files";

/** Read a response body as text, stopping once EXPORT_CAP chars are buffered. */
async function readCappedText(resp: Response): Promise<{ text: string; truncated: boolean }> {
  if (!resp.body) return capText(await resp.text()); // fallback: no stream available
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length >= EXPORT_CAP) { truncated = true; break; }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { text: text.slice(0, EXPORT_CAP), truncated };
}

/**
 * Read the text of a file that lives in the caller's DragonCandy AIOS folder.
 * Guards on parent === folderId (defense in depth over drive.file). Google Docs
 * come back as markdown, Sheets as CSV, plain/markdown uploads as raw text;
 * everything else is rejected. Output is capped (see EXPORT_CAP).
 *
 * KNOWN LIMITATION: the guard checks DIRECT parentage only — a file nested in a
 * sub-folder of the AIOS folder would be rejected. That's acceptable today (the
 * hub creates files at the folder root); a future "files in subfolders" case
 * would need a recursive ancestor walk.
 */
export async function readDcFile(
  token: string,
  folderId: string,
  fileId: string,
): Promise<{ name: string; mimeType: string; text: string; truncated: boolean }> {
  // 1. Metadata — name, mimeType, and parents for the folder guard.
  const meta = await driveRequest(
    token,
    `${DRIVE_EXPORT_URL}/${fileId}?fields=id,name,mimeType,parents`,
  );
  if (!Array.isArray(meta.parents) || !meta.parents.includes(folderId)) {
    throw new GoogleWorkspaceError("forbidden_file", "File is not in the DragonCandy AIOS folder", 403);
  }
  const strat = pickExportMode(meta.mimeType);
  if (strat.mode === "unsupported") {
    throw new GoogleWorkspaceError("unsupported_type", `Cannot read ${meta.mimeType} as text`, 400);
  }
  // 2. Export/media returns text (NOT json) — do a raw fetch, not driveRequest.
  const url =
    strat.mode === "export"
      ? `${DRIVE_EXPORT_URL}/${fileId}/export?mimeType=${encodeURIComponent(strat.exportMime)}`
      : `${DRIVE_EXPORT_URL}/${fileId}?alt=media`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    console.error("[google-workspace] read export failed:", resp.status, (await resp.text()).slice(0, 200));
    throw new GoogleWorkspaceError("google_api_error", `Could not read file (${resp.status})`, 502);
  }
  const { text, truncated } = await readCappedText(resp);
  return { name: meta.name, mimeType: meta.mimeType, text, truncated };
}

export async function createGoogleFile(
  token: string,
  folderId: string,
  mimeType: string,
  name: string
): Promise<any> {
  return driveRequest(token, `${DRIVE_FILES_URL}?fields=${FILE_FIELDS}`, {
    method: "POST",
    body: JSON.stringify({ name, mimeType, parents: [folderId] }),
  });
}

export async function renameDriveFile(token: string, fileId: string, name: string): Promise<any> {
  return driveRequest(token, `${DRIVE_FILES_URL}/${fileId}?fields=${FILE_FIELDS}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function trashDriveFile(token: string, fileId: string): Promise<void> {
  await driveRequest(token, `${DRIVE_FILES_URL}/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true }),
  });
}

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

/**
 * Export markdown as a Google Doc in the DragonCandy folder. Drive converts
 * text/markdown natively when the target mimeType is a Google Doc. When
 * `existingDocId` is given the doc is overwritten in place (idempotent weekly
 * exports); a stale/trashed id falls back to creating a fresh doc.
 */
export async function exportMarkdownToDoc(
  token: string,
  folderId: string,
  title: string,
  markdown: string,
  existingDocId?: string
): Promise<any> {
  const upload = async (docId?: string) => {
    const metadata = docId
      ? { name: title }
      : { name: title, mimeType: "application/vnd.google-apps.document", parents: [folderId] };
    const boundary = `dc-export-${crypto.randomUUID()}`;
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: text/markdown; charset=UTF-8",
      "",
      markdown,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const url = `${DRIVE_UPLOAD_URL}${docId ? `/${docId}` : ""}?uploadType=multipart&fields=${FILE_FIELDS}`;
    return fetch(url, {
      method: docId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
  };

  let resp = await upload(existingDocId);
  if (existingDocId && resp.status === 404) resp = await upload(); // stale doc id → fresh doc
  if (!resp.ok) {
    const body = await resp.text();
    console.error("[google-workspace] doc export failed:", resp.status, body.slice(0, 300));
    throw new GoogleWorkspaceError("google_api_error", `Doc export failed (${resp.status})`, 502);
  }
  return resp.json();
}

/**
 * Start a Drive resumable-upload session server-side and return the session
 * URL. The URL is a short-lived (~1 week) pre-authorized capability scoped to
 * creating this one file in the caller's own folder — handing it to the
 * caller's browser lets bytes stream directly to Google, avoiding the edge
 * function body limit without ever exposing an access token.
 */
export async function initResumableUpload(
  token: string,
  folderId: string,
  name: string,
  mimeType: string
): Promise<string> {
  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": mimeType,
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    }
  );
  const sessionUrl = resp.headers.get("Location");
  if (!resp.ok || !sessionUrl) {
    const body = await resp.text();
    console.error("[google-workspace] upload_init failed:", resp.status, body.slice(0, 300));
    throw new GoogleWorkspaceError("google_api_error", `Could not start upload (${resp.status})`, 502);
  }
  return sessionUrl;
}

// ---------------------------------------------------------------------------
// Metrics → Sheet. The canonical "DragonCandy Metrics" spreadsheet lives in the
// designated export account's DragonCandy folder. drive.file covers the Sheets
// API for app-created files, so no extra scope is needed.
// ---------------------------------------------------------------------------

const METRICS_SHEET_NAME = "DragonCandy Metrics";
const sheetValuesUrl = (id: string, range: string) =>
  `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`;

/** Fixed column order — keep STABLE; the sheet appends a row per run over time. */
export const METRIC_COLUMNS: { key: string; label: string }[] = [
  { key: "captured_at", label: "Date" },
  { key: "users_total", label: "Users" },
  { key: "creators", label: "Creators" },
  { key: "restaurants", label: "Restaurants" },
  { key: "brands", label: "Brands" },
  { key: "campaigns_total", label: "Campaigns" },
  { key: "dragonshare_posts", label: "DragonShare posts" },
  { key: "dragonshare_boosts", label: "DragonShare boosts" },
  { key: "promotions_total", label: "Promotions" },
  { key: "social_connections", label: "Social connections" },
  { key: "revenue_fee_cents_total", label: "Platform fees total (¢)" },
  { key: "revenue_fee_cents_mtd", label: "Platform fees MTD (¢)" },
];

async function findOrCreateMetricsSheet(
  token: string,
  folderId: string,
  header: string[]
): Promise<{ id: string; link?: string; created: boolean }> {
  const q = encodeURIComponent(
    `name = '${METRICS_SHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed = false`
  );
  const found = await driveRequest(token, `${DRIVE_FILES_URL}?q=${q}&fields=files(id,webViewLink)`);
  if (found.files?.length) {
    return { id: found.files[0].id, link: found.files[0].webViewLink, created: false };
  }
  const created = await driveRequest(token, `${DRIVE_FILES_URL}?fields=id,webViewLink`, {
    method: "POST",
    body: JSON.stringify({
      name: METRICS_SHEET_NAME,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    }),
  });
  await driveRequest(token, `${sheetValuesUrl(created.id, "A1")}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [header] }),
  });
  return { id: created.id, link: created.webViewLink, created: true };
}

/** Append one metrics snapshot row, creating the sheet (with header) if absent. */
export async function appendMetricsSnapshot(
  token: string,
  folderId: string,
  snapshot: Record<string, unknown>
): Promise<{ link?: string; created: boolean }> {
  const header = METRIC_COLUMNS.map((c) => c.label);
  const row = METRIC_COLUMNS.map((c) => snapshot[c.key] ?? "");
  const sheet = await findOrCreateMetricsSheet(token, folderId, header);
  await driveRequest(
    token,
    `${sheetValuesUrl(sheet.id, "A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) }
  );
  return { link: sheet.link, created: sheet.created };
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
