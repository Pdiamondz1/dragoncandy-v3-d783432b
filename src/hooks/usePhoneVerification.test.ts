// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { usePhoneVerification, isE164, toE164 } from './usePhoneVerification';

beforeEach(() => invoke.mockReset());

describe('toE164', () => {
  it('adds the country code the user did not type', () => {
    expect(toE164('(201) 555-0134')).toBe('+12015550134');
  });

  // The one that matters: a number that already names its country must not be
  // rewritten into a US number.
  it('never rewrites an explicit country code', () => {
    expect(toE164('+44 20 7946 0958')).toBe('+442079460958');
    expect(toE164('+44 20 7946 0958', '+1')).toBe('+442079460958');
  });

  it('returns empty for no digits, rather than a bare country code', () => {
    expect(toE164('')).toBe('');
    expect(toE164('  ')).toBe('');
  });
});

describe('isE164', () => {
  it.each([['+12015550134', true], ['2015550134', false], ['+02015550134', false], ['+1', false]])(
    '%s -> %s', (input, expected) => expect(isE164(input as string)).toBe(expected));
});

describe('check', () => {
  // Trap 1. A wrong code is HTTP 200. Branching on `error` alone would call this verified.
  it('treats a 200 with status "unmet" as NOT verified', async () => {
    invoke.mockResolvedValue({ data: { status: 'unmet', detail: "That code didn't work." }, error: null });
    const { result } = renderHook(() => usePhoneVerification());
    let out;
    await act(async () => { out = await result.current.check('+12015550134', '000000'); });
    expect(out).toEqual({ verified: false, message: "That code didn't work." });
  });

  it('treats a 200 with status "met" as verified', async () => {
    invoke.mockResolvedValue({ data: { status: 'met' }, error: null });
    const { result } = renderHook(() => usePhoneVerification());
    let out;
    await act(async () => { out = await result.current.check('+12015550134', '123456'); });
    expect(out).toEqual({ verified: true });
  });

  it('does not read success from a missing status', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => usePhoneVerification());
    let out;
    await act(async () => { out = await result.current.check('+12015550134', '123456'); });
    expect(out).toMatchObject({ verified: false });
  });
});

describe('start', () => {
  // Trap 2. The throttle's 429 body is the only text saying how long to wait, and it
  // lives in error.context — `data` is null on a non-2xx.
  it('surfaces the server message from a non-2xx body', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        context: { status: 429, clone: () => ({ json: async () => ({ error: 'Please wait a moment before requesting another code' }) }) },
      },
    });
    const { result } = renderHook(() => usePhoneVerification());
    let out;
    await act(async () => { out = await result.current.start('+12015550134'); });
    expect(out).toEqual({ ok: false, message: 'Please wait a moment before requesting another code' });
  });

  it('reports success and arms the code entry', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    const { result } = renderHook(() => usePhoneVerification());
    expect(result.current.codeSent).toBe(false);
    let out;
    await act(async () => { out = await result.current.start('+12015550134'); });
    expect(out).toEqual({ ok: true });
    expect(result.current.codeSent).toBe(true);
  });

  it('does not arm code entry when the send failed', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: { status: 502, clone: () => ({ json: async () => ({ error: 'Could not send verification code.' }) }) } } });
    const { result } = renderHook(() => usePhoneVerification());
    await act(async () => { await result.current.start('+12015550134'); });
    expect(result.current.codeSent).toBe(false);
  });
});
