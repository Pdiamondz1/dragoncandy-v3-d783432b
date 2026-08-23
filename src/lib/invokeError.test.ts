import { describe, it, expect } from 'vitest';
import { codeFromInvokeError, messageFromInvokeError } from './invokeError';

/**
 * `supabase.functions.invoke` puts the server's body in `error.context` (a
 * Response) on a non-2xx and leaves `data` null. These tests pin the two things
 * that make that easy to get wrong: reading the body twice, and confusing the
 * machine code with the human sentence.
 */

const invokeError = (body: unknown, message = 'Edge Function returned a non-2xx status code') => ({
  name: 'FunctionsHttpError',
  message,
  context: new Response(JSON.stringify(body), { status: 403 }),
});

describe('invokeError helpers', () => {
  it('prefers the server sentence over the generic invoke message', async () => {
    const err = invokeError({ error: 'missing_scope', message: 'Analytics access was not granted' });
    expect(await messageFromInvokeError(err, 'fallback')).toBe('Analytics access was not granted');
  });

  it('returns the machine code, not the sentence', async () => {
    const err = invokeError({ error: 'missing_scope', message: 'Analytics access was not granted' });
    expect(await codeFromInvokeError(err, 'fallback')).toBe('missing_scope');
  });

  // The bug this exists to prevent: a Response body can be read ONCE. A caller
  // that wants the code (to branch) and the message (to display) would get the
  // code and then generic copy, which reads as the server saying nothing.
  it('can be read twice — both helpers see the body', async () => {
    const err = invokeError({ error: 'needs_reconnect', message: 'Reconnect the channel' });

    expect(await codeFromInvokeError(err, 'fallback')).toBe('needs_reconnect');
    expect(await messageFromInvokeError(err, 'fallback')).toBe('Reconnect the channel');
    // And a third time, in the other order.
    expect(await codeFromInvokeError(err, 'fallback')).toBe('needs_reconnect');
  });

  it('falls back to the code when the server sent no sentence', async () => {
    const err = invokeError({ error: 'save_failed' });
    expect(await messageFromInvokeError(err, 'fallback')).toBe('save_failed');
  });

  it.each([
    ['a non-JSON body', { name: 'FunctionsHttpError', message: 'boom', context: new Response('<html>') }],
    ['no context at all', { name: 'FunctionsFetchError', message: 'network died' }],
  ])('falls back for %s', async (_label, err) => {
    expect(await messageFromInvokeError(err, 'fallback')).toBe(
      (err as { message: string }).message,
    );
    expect(await codeFromInvokeError(err, 'fallback')).toBe('fallback');
  });
});
