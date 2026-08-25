/**
 * Upload a file to a Google **shared drive** as a service account, with no dependencies.
 *
 * This exists to retire a dated hazard: rclone's default config borrows *rclone's own*
 * shared OAuth client ID, which Google is retiring and which "will stop working during
 * 2026" — announced only as a one-line `NOTICE` that any `grep -v` in a script removes
 * forever. rclone itself is fine; the borrowed credential is not.
 *
 * A service account is the better end state for a second reason, which is the one that
 * will actually matter: it is **headless**. No browser consent, no user token to
 * re-approve, so the same command runs in CI and on a new engineer's machine on day one.
 * Installing a binary and completing an OAuth round trip is a poor first task for someone
 * whose job that week is to publish a deck.
 *
 * ## It does NOT need domain-wide delegation
 *
 * The Workspace signature installer uses DWD because it must act *as* each user, writing
 * into mailboxes it does not own. This does not: a service account can be added as a
 * **member of a shared drive** like any other principal, and files it creates are owned by
 * the drive rather than by the account. That is narrower and considerably safer — no
 * ability to impersonate anyone — so do not copy the signature script's setup here.
 *
 * Failing to add it as a member is the single most likely setup mistake, and Drive reports
 * it as a bare **404 on the folder**, which reads like a wrong ID. `describeSetup()` exists
 * to turn that into a sentence naming the account to add.
 *
 * ## No dependencies, deliberately
 *
 * Minting the token is an RS256 JWT signed with `node:crypto` and one form POST. Adding
 * `googleapis` for this would pull a large tree in to do what forty lines already do, and
 * this file is small enough to read end to end before trusting it with a credential.
 */
import { createSign } from 'node:crypto';

/** Only the two fields we use. A real key file has many more; they are ignored. */
export interface ServiceAccountKey {
  readonly client_email: string;
  readonly private_key: string;
}

export interface UploadResult {
  readonly id: string;
  readonly md5: string;
  readonly size: number;
}

/** Full read/write. Drive has no narrower scope that can write into an existing folder. */
const SCOPE = 'https://www.googleapis.com/auth/drive';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

/** Injected so the tests can drive this without a network or a real key. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Where the key comes from, in precedence order.
 *
 * `_JSON` first because CI has a secret store and no filesystem to put a file on; the
 * explicit path second; the conventional path last, so a local machine needs no
 * configuration at all. All three are gitignored or out of the tree.
 */
export type KeySource =
  | { kind: 'json'; raw: string; from: string }
  | { kind: 'path'; path: string; from: string }
  | { kind: 'none' };

export const DEFAULT_KEY_PATH = '.drive-service-account.json';

export function resolveKeySource(
  env: Record<string, string | undefined>,
  fileExists: (path: string) => boolean,
): KeySource {
  const inline = env.GOOGLE_DRIVE_SA_KEY_JSON;
  if (inline && inline.trim() !== '') {
    return { kind: 'json', raw: inline, from: 'GOOGLE_DRIVE_SA_KEY_JSON' };
  }
  const path = env.GOOGLE_DRIVE_SA_KEY;
  if (path && path.trim() !== '') {
    return { kind: 'path', path, from: 'GOOGLE_DRIVE_SA_KEY' };
  }
  if (fileExists(DEFAULT_KEY_PATH)) {
    return { kind: 'path', path: DEFAULT_KEY_PATH, from: DEFAULT_KEY_PATH };
  }
  return { kind: 'none' };
}

/**
 * Parse and validate, with a message that says what to fix.
 *
 * Throws rather than returning null on purpose: a key that is *present but broken* must
 * never silently fall back to another transport. That would turn a misconfigured secret
 * into a green run, which is the shape of failure this repo keeps writing down.
 */
export function parseServiceAccountKey(raw: string, from: string): ServiceAccountKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${from} is not valid JSON. Expected a Google service-account key file.`);
  }
  const key = parsed as Partial<ServiceAccountKey> & { type?: string };
  if (typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
    throw new Error(
      `${from} is missing client_email or private_key. ` +
        'Download the JSON key from Google Cloud Console → IAM → Service Accounts → Keys.',
    );
  }
  if (!key.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      `${from} has a private_key that is not a PEM block. If it came from an environment ` +
        'variable, check that literal \\n sequences were converted to real newlines.',
    );
  }
  return { client_email: key.client_email, private_key: key.private_key };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface JwtClaims {
  readonly iss: string;
  readonly scope: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
}

/** Google rejects a lifetime over an hour; 3600 exactly is the documented maximum. */
export function buildJwtClaims(clientEmail: string, nowMs: number): JwtClaims {
  const iat = Math.floor(nowMs / 1000);
  return { iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 };
}

export function signJwt(key: ServiceAccountKey, claims: JwtClaims): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  let signature: Buffer;
  try {
    signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(key.private_key);
  } catch (cause) {
    // `parseServiceAccountKey` only checks for the PEM *header*, so a key with the right
    // wrapper and a damaged body reaches here — and OpenSSL reports it as
    // `DECODER routines::unsupported` over an ASN.1 stack, which says nothing about what to
    // do. Found by running the control rather than by reading the code: the guard written
    // to prevent exactly this message did not cover the truncated-body case.
    throw new Error(
      'The private key could not be used to sign. It is PEM-shaped but not a usable key — ' +
        'usually a truncated paste or a key that lost characters passing through an ' +
        'environment variable. Re-download the JSON key rather than editing it.',
      { cause },
    );
  }
  return `${header}.${payload}.${base64url(signature)}`;
}

export async function getAccessToken(
  key: ServiceAccountKey,
  fetchImpl: FetchLike,
  nowMs: number,
): Promise<string> {
  const assertion = signJwt(key, buildJwtClaims(key.client_email, nowMs));
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `Token request failed (${res.status}). ${body}\n` +
        'A 400 with "invalid_grant" here usually means the key was revoked or the clock is skewed.',
    );
  }
  const token = (JSON.parse(body) as { access_token?: string }).access_token;
  if (!token) throw new Error(`Token response carried no access_token: ${body}`);
  return token;
}

/** The sentence to print when Drive answers 404 — by far the likeliest setup mistake. */
export function describeSetup(clientEmail: string, driveName = 'the shared drive'): string {
  return (
    `Drive cannot see that folder. The usual cause is that the service account is not a member ` +
    `of ${driveName}.\n\n  Add ${clientEmail} as a Content manager:\n` +
    `  Drive → the shared drive → Manage members → paste that address.\n\n` +
    'It needs no domain-wide delegation — membership is the whole grant.'
  );
}

interface UploadOptions {
  readonly key: ServiceAccountKey;
  readonly driveId: string;
  readonly folderId: string;
  readonly name: string;
  readonly bytes: Buffer;
  readonly mimeType: string;
  readonly fetchImpl?: FetchLike;
  readonly nowMs?: number;
}

const SHARED_DRIVE_PARAMS = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

/**
 * Find an existing file of this name in the folder, so a re-upload REPLACES it.
 *
 * Without this Drive happily stores two files with identical names in one folder, and the
 * deck would accumulate a copy per upload with no way for a reader to tell which is
 * current. Drive keeps version history on the replacement, which is the better place for
 * the older copies.
 */
async function findExisting(
  token: string,
  opts: UploadOptions,
  fetchImpl: FetchLike,
): Promise<string | null> {
  const q = `name = '${opts.name.replace(/'/g, "\\'")}' and '${opts.folderId}' in parents and trashed = false`;
  const url =
    `${API}/files?q=${encodeURIComponent(q)}&${SHARED_DRIVE_PARAMS}` +
    `&corpora=drive&driveId=${opts.driveId}&fields=${encodeURIComponent('files(id,name)')}`;
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await res.text();
  if (res.status === 404) throw new Error(describeSetup(opts.key.client_email));
  if (!res.ok) throw new Error(`Drive list failed (${res.status}). ${body}`);
  const files = (JSON.parse(body) as { files?: Array<{ id: string }> }).files ?? [];
  return files.length > 0 ? files[0].id : null;
}

/**
 * Resumable rather than multipart.
 *
 * Simple and multipart uploads are capped at 5 MB, and the deck is already 4. That is not
 * a margin, it is a countdown — a slide or two more and a working command starts failing
 * on size. Resumable costs one extra round trip and has no ceiling worth thinking about.
 */
export async function uploadToDrive(opts: UploadOptions): Promise<UploadResult> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const nowMs = opts.nowMs ?? Date.now();
  const token = await getAccessToken(opts.key, fetchImpl, nowMs);
  const existingId = await findExisting(token, opts, fetchImpl);

  const metadata = existingId
    ? { name: opts.name }
    : { name: opts.name, parents: [opts.folderId] };

  const initUrl = existingId
    ? `${UPLOAD_API}/files/${existingId}?uploadType=resumable&${SHARED_DRIVE_PARAMS}`
    : `${UPLOAD_API}/files?uploadType=resumable&${SHARED_DRIVE_PARAMS}`;

  const init = await fetchImpl(initUrl, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': opts.mimeType,
      'X-Upload-Content-Length': String(opts.bytes.length),
    },
    body: JSON.stringify(metadata),
  });
  if (init.status === 404) throw new Error(describeSetup(opts.key.client_email));
  if (!init.ok) throw new Error(`Upload init failed (${init.status}). ${await init.text()}`);

  const location = init.headers.get('location');
  if (!location) throw new Error('Upload init returned no Location header to send bytes to.');

  const put = await fetchImpl(location, {
    method: 'PUT',
    headers: { 'content-type': opts.mimeType, 'content-length': String(opts.bytes.length) },
    body: new Uint8Array(opts.bytes),
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}). ${await put.text()}`);

  const uploaded = JSON.parse(await put.text()) as { id?: string };
  if (!uploaded.id) throw new Error('Upload succeeded but returned no file id.');

  // Read the stored object back. The upload response is Drive describing what it believes
  // it did; this is Drive describing what it holds. Those are different claims, and this
  // project has been caught by the difference before.
  const verifyUrl =
    `${API}/files/${uploaded.id}?${SHARED_DRIVE_PARAMS}` +
    `&fields=${encodeURIComponent('id,size,md5Checksum')}`;
  const check = await fetchImpl(verifyUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!check.ok) throw new Error(`Post-upload read failed (${check.status}). ${await check.text()}`);
  const stored = JSON.parse(await check.text()) as {
    id: string;
    size?: string;
    md5Checksum?: string;
  };
  if (!stored.md5Checksum) {
    throw new Error('Drive reported no md5Checksum, so the upload cannot be verified.');
  }
  return { id: stored.id, md5: stored.md5Checksum, size: Number(stored.size ?? 0) };
}
