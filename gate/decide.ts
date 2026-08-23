/**
 * The gate's entire decision, as a pure function.
 *
 * Lives apart from `middleware.ts` so it can be unit-tested without a deploy.
 * That separation is not academic: the gate only runs in production, so a bug
 * here cannot be caught on a preview — the tests are the only pre-merge signal.
 *
 * Design notes that are load-bearing, not preferences:
 *
 *  - It fails CLOSED. Missing configuration challenges every request instead of
 *    passing traffic. A silently reopened site is not noticed for weeks; a
 *    locked-out one is noticed immediately, and `SITE_GATE_ENABLED` unlocks it.
 *  - Only the `?k=` branch returns a cookie. Framework-agnostic middleware
 *    continues by returning `undefined`, which has no response to carry a
 *    `Set-Cookie`. Basic credentials do not need one — browsers cache them per
 *    origin and realm and resend them automatically.
 *  - It never asks for a redirect to a gate page. A `401` makes the browser
 *    re-request the SAME url, preserving the `#access_token` fragment that
 *    Supabase password-reset links carry. A redirect would drop it.
 *
 * See docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md
 */

export const GATE_COOKIE_NAME = 'dc_gate';

const COOKIE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Paths served without the password. Every one is a static file that a crawler
 * or Apple may need to read, and NONE of them serves the SPA shell or a bundle
 * chunk — so allowlisting them leaks nothing.
 *
 * `/sitemap.xml` is deliberately absent: de-listing the site while publishing a
 * machine-readable index of every route defeats the point.
 */
const ALLOWED_EXACT = new Set([
  '/robots.txt',
  '/favicon.ico',
  '/apple-app-site-association',
]);
const ALLOWED_PREFIXES = ['/.well-known/'];

export type GateEnv = {
  vercelEnv?: string;
  enabled?: string;
  password?: string;
  bypassToken?: string;
  secret?: string;
};

export type GateDecision =
  | { kind: 'pass' }
  | { kind: 'challenge' }
  | { kind: 'redirect'; location: string; setCookie: string };

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison of two equal-length strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Compare two secrets without leaking their length or a prefix match.
 *
 * Both sides are HMAC'd first so the comparison always runs over two 64-char
 * hex digests. A direct `timingSafeEqual` on the raw values would return early
 * on a length mismatch and so leak the password's length.
 */
async function secretsMatch(signingSecret: string, given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    hmacHex(signingSecret, given),
    hmacHex(signingSecret, expected),
  ]);
  return timingSafeEqual(a, b);
}

async function mintCookie(secret: string, now: number): Promise<string> {
  const expiresAt = now + COOKIE_LIFETIME_MS;
  const signature = await hmacHex(secret, String(expiresAt));
  const maxAge = Math.floor(COOKIE_LIFETIME_MS / 1000);
  return `${GATE_COOKIE_NAME}=${expiresAt}.${signature}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function cookieIsValid(secret: string, value: string, now: number): Promise<boolean> {
  const parts = value.split('.');
  if (parts.length !== 2) return false;
  const [rawExpiry, signature] = parts;
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  return timingSafeEqual(await hmacHex(secret, rawExpiry), signature);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

/** The password half of an `Authorization: Basic` header, or null if absent/unparseable. */
function readBasicPassword(header: string | null): string | null {
  if (!header) return null;
  const prefix = 'Basic ';
  if (!header.startsWith(prefix)) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice(prefix.length).trim());
  } catch {
    return null;
  }
  const separator = decoded.indexOf(':');
  if (separator === -1) return null;
  return decoded.slice(separator + 1);
}

function isAllowlisted(pathname: string): boolean {
  if (ALLOWED_EXACT.has(pathname)) return true;
  return ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function decide(
  request: Request,
  env: GateEnv,
  now: number = Date.now(),
): Promise<GateDecision> {
  // Preview deployments carry Vercel's own SSO protection already; gating them
  // again would break the e2e smoke suite for nothing.
  if (env.vercelEnv !== 'production') return { kind: 'pass' };
  if (env.enabled !== '1') return { kind: 'pass' };

  const url = new URL(request.url);
  if (isAllowlisted(url.pathname)) return { kind: 'pass' };

  const { password, bypassToken, secret } = env;
  if (!secret || !password) return { kind: 'challenge' };

  const supplied = url.searchParams.get('k');
  if (supplied !== null && bypassToken && (await secretsMatch(secret, supplied, bypassToken))) {
    url.searchParams.delete('k');
    const query = url.searchParams.toString();
    return {
      kind: 'redirect',
      location: query ? `${url.pathname}?${query}` : url.pathname,
      setCookie: await mintCookie(secret, now),
    };
  }

  const cookie = readCookie(request.headers.get('cookie'), GATE_COOKIE_NAME);
  if (cookie && (await cookieIsValid(secret, cookie, now))) return { kind: 'pass' };

  const given = readBasicPassword(request.headers.get('authorization'));
  if (given !== null && (await secretsMatch(secret, given, password))) return { kind: 'pass' };

  return { kind: 'challenge' };
}
