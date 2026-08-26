import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LandingButton } from '@/components/landing/LandingButton';
import { CODE_LENGTH, isWellFormedCode, normalizeVerificationCode } from '@/lib/verificationCode';

/**
 * The screen a user sees between signing up and being let in.
 *
 * WHAT IT REPLACES. Signing up used to end with `supabase.auth.signOut()`: the tab that
 * did the work was thrown away, and the only way forward was to open a mail client, click
 * a link, land on a THIRD page, and log in again. On a phone, where mail is a different
 * app, that is a round trip most people do not complete. The session now survives, and the
 * code in the email is entered here, on the page they are already standing on.
 *
 * BOTH ROUTES STAY OPEN, and that is deliberate rather than generous. The emailed link is
 * the only thing that works if this tab is closed, if the code is mistyped past its
 * budget, or if the mail is read on a different device — so the panel polls for it. A user
 * who clicks the link on their phone finds this tab has already moved on.
 *
 * The poll is the only way this tab can learn about the link: the write happens in another
 * browser, on another device, against a row this page holds no subscription to. Four
 * seconds is chosen for a screen someone is actively watching; it stops on unmount and on
 * success, so it cannot outlive the moment it serves.
 */

const POLL_INTERVAL_MS = 4000;

interface EmailVerificationPanelProps {
  /** Runs once verification is confirmed, by either route. */
  onVerified: () => void;
  /** Sends a fresh email. The panel owns none of the cooldown logic. */
  onResend: () => void;
  resendCooldown: number;
  /** Signs out and returns to the login form. */
  onDismiss: () => void;
}

export const EmailVerificationPanel = ({
  onVerified,
  onResend,
  resendCooldown,
  onDismiss,
}: EmailVerificationPanelProps) => {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  /**
   * `onVerified` reaches the poll through a ref. Naming it as an effect dependency would
   * tear down and restart the interval on every parent render — a timer that resets before
   * it ever fires is a timer that never fires, and the emailed-link route would silently
   * stop working while looking implemented.
   */
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  /** Guards against the poll and a code submission both reporting the same success. */
  const settled = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const check = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('email_verified')
        .eq('id', user.id)
        .maybeSingle();
      // A failed read is not a verdict. Staying put and asking again is correct; treating
      // an error as "not verified" would be the same claim, and treating it as verified
      // would let a network blip past the gate.
      if (error || cancelled || settled.current) return;
      if (data?.email_verified === true) {
        settled.current = true;
        onVerifiedRef.current();
      }
    };

    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeVerificationCode(code);
    if (!isWellFormedCode(normalized)) {
      setMessage(`Enter the ${CODE_LENGTH}-digit code from your email.`);
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('verify-email', {
        body: { code: normalized },
      });

      /**
       * A non-2xx from an edge function arrives as `error` with the BODY discarded, so the
       * server's own wording — including how many attempts are left — is unreachable from
       * there. The failure detail is read off `data` when the function chose to answer 200,
       * and otherwise falls back to a message that is true for every failing case rather
       * than guessing which one it was.
       */
      const payload = (data ?? {}) as { success?: boolean; message?: string; remaining?: number };

      if (!error && payload.success) {
        settled.current = true;
        onVerified();
        return;
      }

      const detail = await readFunctionError(error);
      setRemaining(detail?.remaining ?? payload.remaining ?? null);
      setMessage(
        detail?.message ??
          payload.message ??
          'That code is not right. Check your email and try again.',
      );
    } catch {
      setMessage('Could not check that code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 max-w-sm md:max-w-md mx-auto w-full rounded-2xl border-2 border-landing-line bg-white p-6 text-center space-y-4">
      <div className="space-y-1">
        <h2 className="font-sans text-base font-bold text-landing-ink">Check your email</h2>
        <p className="text-sm text-landing-ink-soft">
          We sent a {CODE_LENGTH}-digit code
          {user?.email ? <> to <span className="font-semibold text-landing-ink">{user.email}</span></> : null}.
          Enter it below to continue.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="verification-code" className="sr-only">
          Verification code
        </label>
        <input
          id="verification-code"
          value={code}
          onChange={(e) => setCode(normalizeVerificationCode(e.target.value).slice(0, CODE_LENGTH))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={CODE_LENGTH}
          placeholder="000000"
          aria-describedby={message ? 'verification-code-message' : undefined}
          className="w-full rounded-xl border border-landing-line bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-landing-ink placeholder:text-landing-ink-soft/30 focus:border-landing-mint focus:outline-none focus:ring-2 focus:ring-landing-mint/40"
        />

        <LandingButton type="submit" variant="pink" className="w-full" disabled={submitting}>
          {submitting ? 'Checking…' : 'Verify email'}
        </LandingButton>
      </form>

      {message && (
        <p id="verification-code-message" className="text-sm text-red-600" aria-live="polite">
          {message}
          {typeof remaining === 'number' && remaining > 0 && (
            <> {remaining} {remaining === 1 ? 'try' : 'tries'} left.</>
          )}
        </p>
      )}

      <p className="text-xs text-landing-ink-soft">
        Or open the link in the email — this page will notice.
      </p>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onResend}
          disabled={resendCooldown > 0}
          className="text-sm font-semibold text-landing-pink hover:text-landing-pink disabled:text-landing-ink-soft/40 transition-colors"
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Send a new email'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="block mx-auto text-xs text-landing-ink-soft hover:text-landing-ink transition-colors"
        >
          Back to login
        </button>
      </div>
    </div>
  );
};

/**
 * Recovers the server's message from a `FunctionsHttpError`, whose `context` is the raw
 * `Response`. Without this the user is told "That code is not right" when the real answer
 * was "you are out of tries, use the link" — the one case where the remedy differs.
 */
async function readFunctionError(
  error: unknown,
): Promise<{ message?: string; remaining?: number } | null> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    return await ctx.json();
  } catch {
    return null;
  }
}
