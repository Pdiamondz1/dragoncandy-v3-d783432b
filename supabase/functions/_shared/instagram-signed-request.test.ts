import { describe, it, expect } from 'vitest';
import { verifySignedRequest } from './instagram-signed-request.ts';

/**
 * This is the entire authorization for the two Meta callbacks — they run without
 * `verify_jwt` and Meta POSTs to them with no bearer we issued. So these tests
 * are not about shaping data; they are about whether a stranger can delete
 * someone's Instagram connection by naming their id.
 *
 * Every negative case below is a real forgery attempt in miniature. The
 * positive case exists mostly to prove the negatives could have passed — a
 * verifier that rejects everything looks identical to a correct one.
 */

const SECRET = 'test-app-secret-do-not-use';

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sign(payloadJson: string, secret = SECRET): Promise<string> {
  const encodedPayload = b64url(new TextEncoder().encode(payloadJson));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload)),
  );
  return `${b64url(sig)}.${encodedPayload}`;
}

const goodPayload = JSON.stringify({
  user_id: '17841400000000000',
  algorithm: 'HMAC-SHA256',
  issued_at: 1787500000,
});

describe('verifySignedRequest', () => {
  it('accepts a genuine request and returns the payload', async () => {
    const result = await verifySignedRequest(await sign(goodPayload), SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.user_id).toBe('17841400000000000');
  });

  it('rejects a request signed with a different secret', async () => {
    // The forgery that matters: an attacker who knows the format but not the
    // secret. If this passes, anyone can deauthorize anyone.
    const forged = await sign(goodPayload, 'not-the-app-secret');
    expect(await verifySignedRequest(forged, SECRET)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a payload edited after signing', async () => {
    // Take a genuine signature and swap the payload for one naming a different
    // account — the exact move that would let someone delete a stranger's row.
    const genuine = await sign(goodPayload);
    const [sig] = genuine.split('.');
    const attackerPayload = b64url(
      new TextEncoder().encode(
        JSON.stringify({ user_id: '999', algorithm: 'HMAC-SHA256', issued_at: 1 }),
      ),
    );
    expect(await verifySignedRequest(`${sig}.${attackerPayload}`, SECRET)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects an unsigned algorithm downgrade', async () => {
    // `algorithm: none` correctly signed. The signature check passes because the
    // attacker would need the secret to get here at all — so this is defence
    // against a FUTURE weakening (a second accepted algorithm), not against an
    // outsider. Pinned so adding one is a deliberate act.
    const payload = JSON.stringify({ user_id: '1', algorithm: 'none' });
    expect(await verifySignedRequest(await sign(payload), SECRET)).toEqual({
      ok: false,
      reason: 'bad_algorithm',
    });
  });

  it('accepts the algorithm case-insensitively', async () => {
    const payload = JSON.stringify({ user_id: '1', algorithm: 'hmac-sha256' });
    expect((await verifySignedRequest(await sign(payload), SECRET)).ok).toBe(true);
  });

  it('rejects malformed input without throwing', async () => {
    for (const bad of ['', '.', 'nodot', 'a.b.c', '.payload', 'sig.']) {
      const result = await verifySignedRequest(bad, SECRET);
      expect(result.ok, `input ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('rejects a valid signature over a non-JSON payload', async () => {
    const result = await verifySignedRequest(await sign('not json at all'), SECRET);
    expect(result).toEqual({ ok: false, reason: 'bad_payload' });
  });

  it('rejects a truncated signature of the right prefix', async () => {
    // A length-only comparison, or a prefix match, would let this through.
    const genuine = await sign(goodPayload);
    const [sig, payload] = genuine.split('.');
    const truncated = sig.slice(0, sig.length - 4);
    expect((await verifySignedRequest(`${truncated}.${payload}`, SECRET)).ok).toBe(false);
  });
});
