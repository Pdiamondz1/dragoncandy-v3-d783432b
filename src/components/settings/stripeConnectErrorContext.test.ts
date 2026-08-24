import { describe, it, expect } from 'vitest';

/**
 * Reproduces the shape that made "Connect Stripe Account" fail silently.
 *
 * `supabase-js` puts a `Response` on `err.context` when the edge function ANSWERED, and
 * a plain `TypeError` there when the request never completed (network down, or CORS
 * refusing the origin — which is exactly what staging does, still serving the
 * pre-migration `Access-Control-Allow-Origin: https://dragoncandy.io`).
 *
 * The original code did `await context.json().catch(() => null)`. Against a TypeError
 * that is a SYNCHRONOUS throw — `context.json` is undefined — and a throw raised inside
 * a catch block is not caught by a `.catch()` chained onto the very call that threw. So
 * the rejection escaped the handler and the `toast.error` on the next line never ran:
 * the button reset itself and told the user nothing.
 *
 * These tests exercise the extracted shape rather than the component, because the
 * component needs a Stripe-connected React tree to reach the handler at all, and the
 * defect is entirely in this three-line decision.
 */

/** Mirrors the guarded logic in StripeConnectSetup's handleConnect catch block. */
async function readServerMessage(err: unknown): Promise<string | null> {
  const context = (err as { context?: unknown })?.context;
  const serverMsg =
    context && typeof (context as Response).json === 'function'
      ? await (context as Response).json().catch(() => null)
      : null;
  return serverMsg?.error ?? null;
}

/** What the ORIGINAL code did — kept so the bug is demonstrable, not just described. */
async function readServerMessageUnguarded(err: unknown): Promise<string | null> {
  const context = (err as { context?: Response })?.context;
  const serverMsg = context ? await context.json().catch(() => null) : null;
  return serverMsg?.error ?? null;
}

describe('Stripe connect error context', () => {
  const networkFailure = { context: new TypeError('Failed to fetch') };
  const answered = { context: { json: async () => ({ error: 'Stripe key missing' }) } };

  it('the unguarded version throws on a network failure — the original bug', async () => {
    await expect(readServerMessageUnguarded(networkFailure)).rejects.toThrow(/is not a function/);
  });

  it('the guarded version returns null instead of throwing, so the toast still fires', async () => {
    await expect(readServerMessage(networkFailure)).resolves.toBeNull();
  });

  it('still reads the server message when the function actually answered', async () => {
    await expect(readServerMessage(answered)).resolves.toBe('Stripe key missing');
  });

  it('survives a Response whose body is not JSON', async () => {
    const bad = { context: { json: async () => { throw new SyntaxError('not json'); } } };
    await expect(readServerMessage(bad)).resolves.toBeNull();
  });
});
