import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { messageFromInvokeError } from '@/lib/invokeError';

/**
 * Client for the `verify-phone` edge function — the first one in `src/`. The function
 * has been deployed since 2026-08-23 with no consumer, which is why no SMS round trip
 * has ever run.
 *
 * Two traps in its contract, both of which read as success if you skip the body:
 *
 * 1. `check` answers **HTTP 200 with `{ status: 'unmet' }`** for a wrong or expired
 *    code. A caller that branches on `error` alone treats a rejected code as a
 *    verified phone. Only `status === 'met'` means verified.
 * 2. On a non-2xx the server's `{ error }` body is in `error.context`, not in `data`
 *    — see `messageFromInvokeError`. The throttle's 429 carries the only text that
 *    tells a user how long to wait, so dropping it turns a precise message into
 *    "something went wrong".
 *
 * The function throttles sends per user and per IP and fails CLOSED, so a refusal here
 * is a real answer and must be shown, not retried.
 */

export type StartResult = { ok: true } | { ok: false; message: string };
export type CheckResult = { verified: boolean; message?: string };

const GENERIC_START = 'Could not send the code. Please try again.';
const GENERIC_CHECK = 'Could not check the code. Please try again.';

/** E.164, matching the edge function's own `isAllowedCountry` regex. */
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone.trim());
}

/**
 * Digits typed into a phone field are not E.164. This adds the country code the user
 * did not type, and does nothing when they did — it never rewrites an explicit `+`,
 * because guessing a country for a number that already names one is how a valid
 * international number becomes an invalid US one.
 */
export function toE164(input: string, defaultCountryCode = '+1'): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) return trimmed.replace(/[^\d+]/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  // "1 (201) 555-0134" is an ordinary way to write a US number, and blindly prefixing it
  // yields `+112015550134` — a shape `isE164` happily accepts and Twilio rejects, so the
  // code simply never arrives and nothing on screen explains why. Dropping the duplicate
  // country code is NANP-specific and is therefore gated on the NANP default: `1` is a
  // legitimate first digit of a subscriber number elsewhere, and stripping it there would
  // break numbers that are correct as typed.
  if (defaultCountryCode === '+1' && digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `${defaultCountryCode}${digits}`;
}

export function usePhoneVerification() {
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const start = useCallback(async (phone: string): Promise<StartResult> => {
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('verify-phone', {
        body: { action: 'start', phone },
      });
      if (error) return { ok: false, message: await messageFromInvokeError(error, GENERIC_START) };
      setCodeSent(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: await messageFromInvokeError(e, GENERIC_START) };
    } finally {
      setSending(false);
    }
  }, []);

  const check = useCallback(async (phone: string, code: string): Promise<CheckResult> => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-phone', {
        body: { action: 'check', phone, code },
      });
      if (error) return { verified: false, message: await messageFromInvokeError(error, GENERIC_CHECK) };
      // Trap 1: a rejected code arrives as a 200. `met` is the only success value.
      const body = data as { status?: string; detail?: string } | null;
      if (body?.status === 'met') return { verified: true };
      return { verified: false, message: body?.detail ?? GENERIC_CHECK };
    } catch (e) {
      return { verified: false, message: await messageFromInvokeError(e, GENERIC_CHECK) };
    } finally {
      setChecking(false);
    }
  }, []);

  return { start, check, sending, checking, codeSent, setCodeSent };
}
