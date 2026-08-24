/**
 * HMAC-signed OAuth state, shared by the per-user platform connectors.
 *
 * WHY THIS EXISTS AS A MODULE. `google-workspace.ts` and `youtube.ts` each carry
 * their own copy of this logic. Instagram would have been the third, and three
 * copies of a security-critical signature routine is how one of them quietly
 * stops matching the others — CLAUDE.md's rule is to extract past two.
 *
 * `youtube.ts` is deliberately NOT migrated to this module in the same change
 * that introduces it. That connector went live and was exercised end to end
 * against real Google credentials hours before this was written; swapping its
 * state implementation inside a new-feature PR would mean a reviewer cannot tell
 * a behaviour change from a feature. The swap is a follow-up whose entire diff is
 * the swap. Until then this file and `youtube.ts` hold equivalent logic on
 * purpose, and that is a debt with a name rather than an accident.
 *
 * WHAT THE STATE IS FOR, and the part that is easy to get wrong: a signature
 * proves the state is one WE minted. It does NOT prove that the browser
 * completing consent is the browser that started the flow. Without that second
 * proof every one of these connectors is open to OAuth account-linking CSRF —
 * an attacker starts a connect, gets an authorize URL carrying a state naming
 * THEIR user id, sends it to a victim, and the victim's consent stores the
 * VICTIM's tokens against the ATTACKER's account.
 *
 * So `verifyState` REQUIRES the caller's authenticated user id and checks the
 * state names it. That id can only come from a real JWT on the exchange request,
 * which is only possible because these flows redirect to a page inside the app
 * rather than straight to an edge function.
 *
 * The `purpose` tag stops a state minted for one flow being replayed against
 * another. Two flows signing with different secrets are already separated, but
 * the tag costs nothing and means a shared secret would not be a vulnerability.
 */

export class OAuthStateError extends Error {
  constructor(public code: string, message: string, public status = 403) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

export function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) =>
    c.charCodeAt(0),
  );
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  purpose: string;
  user_id: string;
  /** Where to send the browser afterwards. A PATH, never a URL — see safeReturnPath. */
  return_path: string;
  /**
   * WHICH deployment the flow started from.
   *
   * Optional so a state minted before this field existed still verifies; an
   * absent value must degrade to the caller's default origin rather than to
   * `undefined`.
   */
  return_origin?: string;
  nonce: string;
  iat: number;
}

/**
 * The signing key.
 *
 * Taken as a raw secret STRING rather than an env var name, so this module never
 * reads the environment and a caller cannot accidentally sign with a secret
 * belonging to a different flow by passing the wrong name.
 */
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signState(
  secret: string,
  purpose: string,
  input: Omit<OAuthState, 'purpose' | 'nonce' | 'iat'>,
): Promise<string> {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const payload: OAuthState = {
    ...input,
    purpose,
    nonce: b64url(nonceBytes),
    iat: Date.now(),
  };
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), body));
  return `${b64url(body)}.${b64url(sig)}`;
}

export async function verifyState(
  secret: string,
  purpose: string,
  state: string,
  expectedUserId: string,
): Promise<OAuthState> {
  const dot = state.lastIndexOf('.');
  if (dot < 0) throw new OAuthStateError('bad_state', 'Malformed state');

  let body: Uint8Array;
  let sig: Uint8Array;
  try {
    body = b64urlDecode(state.slice(0, dot));
    sig = b64urlDecode(state.slice(dot + 1));
  } catch {
    throw new OAuthStateError('bad_state', 'State is not valid base64url');
  }

  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    sig as BufferSource,
    body as BufferSource,
  );
  if (!ok) throw new OAuthStateError('bad_state', 'State signature mismatch');

  let payload: OAuthState;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new OAuthStateError('bad_state', 'State payload is not JSON');
  }

  // Checked before anything else is trusted: a validly-signed state from a
  // sibling flow must not authorize this one.
  if (payload.purpose !== purpose) {
    throw new OAuthStateError('bad_state', 'State was not minted for this flow');
  }

  // THE user binding. Anyone can be handed an authorize URL; only the account
  // that started the flow may finish it. Without this the account-linking CSRF
  // described at the top is open, and no amount of signing closes it.
  if (payload.user_id !== expectedUserId) {
    throw new OAuthStateError('bad_state', 'State does not belong to this user');
  }

  if (Date.now() - payload.iat > STATE_TTL_MS) {
    throw new OAuthStateError('state_expired', 'State expired — restart the connect flow');
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Return targets
// ---------------------------------------------------------------------------

/**
 * Reduce a claimed origin to one we are willing to run an OAuth flow on.
 *
 * Exact string match against the allow-list — no prefix or suffix comparison,
 * which is how `https://dragoncandy.com.evil.test` gets accepted by code that
 * looks correct. Anything unrecognised becomes `fallback`, so the failure mode is
 * "sent to production", never "sent to an attacker".
 */
export function safeReturnOrigin(
  value: unknown,
  allowed: readonly string[],
  fallback: string,
): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

/**
 * Reduce a caller-supplied return target to a same-origin path.
 *
 * A callback finishes by redirecting the browser somewhere, which is the classic
 * open-redirect sink: a phishing link that starts on our real domain, passes
 * through the provider's real consent screen and lands on an attacker's page
 * carries far more credibility than a bare link.
 *
 * The state is signed, so a value in it is already ours — this is the second
 * gate, not the first. Same technique as `safeLink` in `_shared/emailLinks.ts`
 * (#442): **discard the host rather than validate it.** Parse relative to a
 * sentinel and keep only pathname + search. One rule covers absolute URLs,
 * protocol-relative `//evil.com`, backslash variants, userinfo tricks,
 * `javascript:`/`data:` schemes and encoded traversal at once, because none of
 * them survive being re-anchored.
 */
export function safeReturnPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value) return fallback;

  let parsed: URL;
  try {
    // The base is a sentinel, not a real origin: it exists only so a relative
    // input parses. Nothing about it is trusted or compared.
    parsed = new URL(value, 'https://return-path.invalid');
  } catch {
    return fallback;
  }

  // Scheme first. A relative input inherits `https:` from the sentinel, so
  // anything else here means the caller supplied its own scheme — and the only
  // ones worth honouring are the web's.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return fallback;

  // The host is DISCARDED, not checked. `https://evil.com/x` and `//evil.com/x`
  // both reduce to `/x`, which the callback then anchors to our own origin — so
  // the attacker chooses a path on our site, which is not an attack.
  const path = `${parsed.pathname}${parsed.search}`;

  return path.startsWith('/') ? path : fallback;
}
