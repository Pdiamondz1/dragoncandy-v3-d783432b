/**
 * Verifying Meta's `signed_request`.
 *
 * WHY THIS MATTERS MORE THAN THE REST OF THIS CONNECTOR. Every other Instagram
 * endpoint here runs behind `verify_jwt` and authenticates a DragonCandy user.
 * The two Meta callbacks — deauthorize, and data deletion — cannot: Meta POSTs
 * to them directly, with no session and no bearer we issued. **This signature IS
 * their entire authorization.** A weak check here means anyone on the internet
 * can delete another user's Instagram connection by naming their id.
 *
 * FORMAT. `signed_request` is `<signature>.<payload>`, both base64url. The
 * signature is HMAC-SHA256 of the payload **as the raw base64url string it
 * arrived as** — NOT of the decoded JSON, and not of a re-encoding of it. Decode
 * the payload to read it, but always sign the original substring: JSON
 * re-serialisation reorders keys and changes whitespace, and every verification
 * would fail for a reason that looks like a wrong secret.
 *
 * Three checks, in this order, and the order is deliberate:
 *   1. Shape — exactly one `.`, both halves non-empty.
 *   2. Signature — constant-time, before any field of the payload is trusted.
 *   3. `algorithm` — must be HMAC-SHA256. Checked AFTER the signature so a
 *      forged payload cannot steer the comparison, and checked at all because
 *      an unpinned algorithm field is how signature schemes get downgraded.
 */

export interface SignedRequestPayload {
  /** Instagram-scoped user id. The only field either callback acts on. */
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

function b64urlDecodeBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) =>
    c.charCodeAt(0),
  );
}

/**
 * Compare two byte arrays without leaking where they first differ.
 *
 * The length check short-circuits, which is fine — the length of an HMAC-SHA256
 * digest is not a secret. What must not leak is the position of the first
 * differing byte, because that turns forgery from guessing a 32-byte value into
 * guessing 32 one-byte values.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type VerifyResult =
  | { ok: true; payload: SignedRequestPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'bad_algorithm' | 'bad_payload' };

/**
 * Verify a `signed_request` against the app secret.
 *
 * Returns a RESULT rather than throwing, and the failure reasons are distinct,
 * because the callers log them: "we are being probed" and "our secret is wrong"
 * are the same HTTP response to Meta and completely different problems for us.
 * The reason never reaches the response body.
 */
export async function verifySignedRequest(
  signedRequest: string,
  appSecret: string,
): Promise<VerifyResult> {
  if (typeof signedRequest !== 'string') return { ok: false, reason: 'malformed' };

  const parts = signedRequest.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }
  const [encodedSig, encodedPayload] = parts;

  let sig: Uint8Array;
  try {
    sig = b64urlDecodeBytes(encodedSig);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  // Signed over the RAW base64url payload string — see the header.
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload)),
  );

  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: 'bad_signature' };

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecodeBytes(encodedPayload)));
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }

  // Only now, with the payload proven ours, is any field of it worth reading.
  if (String(payload?.algorithm ?? '').toUpperCase() !== 'HMAC-SHA256') {
    return { ok: false, reason: 'bad_algorithm' };
  }

  return { ok: true, payload };
}

/**
 * Pull the `signed_request` out of a Meta callback POST.
 *
 * Meta sends `application/x-www-form-urlencoded`, but has been known to send
 * JSON to some callback types, so both are accepted. Returns null rather than
 * throwing — an unparseable body is just an unauthorized request.
 */
export async function readSignedRequest(req: Request): Promise<string | null> {
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const value = body?.signed_request;
      return typeof value === 'string' ? value : null;
    }
    const form = await req.formData();
    const value = form.get('signed_request');
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}
