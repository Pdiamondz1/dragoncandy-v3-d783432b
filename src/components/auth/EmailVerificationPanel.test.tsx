// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The panel is the screen that replaced `signOut()` at the end of signup. Two independent
 * routes must reach the same outcome — a code typed here, and the emailed link opened on
 * some other device — so both are exercised, each with a control proving the assertion
 * could have failed.
 */
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  emailVerified: false as boolean,
  readError: null as { message: string } | null,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'joey@example.com' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: mocks.readError ? null : { email_verified: mocks.emailVerified },
            error: mocks.readError,
          }),
        }),
      }),
    }),
  },
}));

import { EmailVerificationPanel } from './EmailVerificationPanel';

const noop = () => {};

function renderPanel(overrides: Partial<Parameters<typeof EmailVerificationPanel>[0]> = {}) {
  const onVerified = overrides.onVerified ?? vi.fn();
  const utils = render(
    <EmailVerificationPanel
      onVerified={onVerified}
      onResend={overrides.onResend ?? noop}
      resendCooldown={overrides.resendCooldown ?? 0}
      onDismiss={overrides.onDismiss ?? noop}
    />,
  );
  return { ...utils, onVerified };
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
  mocks.emailVerified = false;
  mocks.readError = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('code entry', () => {
  it('names the address the code went to, so a typo in the email is visible here', () => {
    renderPanel();
    expect(screen.getByText('joey@example.com')).toBeInTheDocument();
  });

  /**
   * A malformed code cannot match anything, so spending an attempt on it would burn the
   * honest user's budget rather than the attacker's. The control below proves this test
   * is about MALFORMED input and not about the button being broken.
   */
  it('does not spend a server attempt on a short code', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));
    // Queried on the error's own wording, not on "6-digit code" — that phrase also
    // appears in the panel's description, and a two-match query throws for the wrong
    // reason while looking like a real failure.
    await waitFor(() => expect(screen.getByText(/Enter the 6-digit code/i)).toBeInTheDocument());
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('CONTROL: a well-formed code does reach the server', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke).toHaveBeenCalledWith('verify-email', { body: { code: '123456' } });
  });

  it('strips the spaces a phone keyboard inserts rather than rejecting them', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('verify-email', { body: { code: '123456' } }));
  });

  it('reports success to the parent', async () => {
    const { onVerified } = renderPanel();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });

  /**
   * A non-2xx from an edge function arrives as `error` with the body discarded, so without
   * `readFunctionError` the user is told "that code is not right" when the real answer was
   * "you are out of tries, use the link" — the one case where the remedy differs.
   */
  it("recovers the server's own wording from a non-2xx response", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        context: {
          json: async () => ({
            success: false,
            reason: 'too_many_attempts',
            message: 'Too many incorrect codes. Use the verification link in your email instead.',
          }),
        },
      },
    });
    const { onVerified } = renderPanel();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));
    await waitFor(() => expect(screen.getByText(/use the verification link/i)).toBeInTheDocument());
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('shows how many tries are left when the server says', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: { json: async () => ({ success: false, reason: 'mismatch', message: 'That code is not right.', remaining: 3 }) },
      },
    });
    renderPanel();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));
    await waitFor(() => expect(screen.getByText(/3 tries left/i)).toBeInTheDocument());
  });
});

describe('the emailed-link route', () => {
  /**
   * The link is opened in a different browser, on a different device. Nothing notifies
   * this tab, so the poll is the ONLY way it can learn — and a poll that silently stopped
   * would leave the feature looking implemented while never working.
   */
  it('advances when the profile flips verified elsewhere', async () => {
    vi.useFakeTimers();
    const onVerified = vi.fn();
    renderPanel({ onVerified });

    mocks.emailVerified = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });

    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: stays put while the profile is still unverified', async () => {
    vi.useFakeTimers();
    const onVerified = vi.fn();
    renderPanel({ onVerified });

    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });

    expect(onVerified).not.toHaveBeenCalled();
  });

  /**
   * A failed read is not a verdict. Treating an error as "verified" would let a network
   * blip past the gate; the panel must simply ask again.
   */
  it('does not treat a failed read as verification', async () => {
    vi.useFakeTimers();
    mocks.readError = { message: 'network' };
    const onVerified = vi.fn();
    renderPanel({ onVerified });

    await act(async () => { await vi.advanceTimersByTimeAsync(12000); });

    expect(onVerified).not.toHaveBeenCalled();
  });

  /**
   * The regression this pins is subtle and silent: naming `onVerified` as an effect
   * dependency tears down and restarts the interval on every parent render, so a timer
   * that resets faster than it fires NEVER fires. The parent re-renders on a cooldown tick
   * once a second, which is exactly that shape.
   */
  it('keeps polling across parent re-renders that change the callback identity', async () => {
    vi.useFakeTimers();
    const onVerified = vi.fn();
    const { rerender } = renderPanel({ onVerified: () => onVerified() });
    mocks.emailVerified = true;

    /**
     * Re-render once a SECOND while the poll runs every FOUR, and keep doing it past the
     * point the poll should have fired. That ordering is the whole test: an effect that
     * named `onVerified` as a dependency restarts on every render, and a four-second timer
     * restarted every second never fires at all — silently, with the feature looking
     * implemented.
     *
     * An earlier version of this test stopped re-rendering after three seconds, so the
     * final restarted interval survived long enough to fire and the test passed against
     * the exact bug it exists to catch. A forced control is what caught that.
     */
    for (let i = 0; i < 8; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      rerender(
        <EmailVerificationPanel
          onVerified={() => onVerified()}
          onResend={noop}
          resendCooldown={8 - i}
          onDismiss={noop}
        />,
      );
    }

    expect(onVerified).toHaveBeenCalled();
  });
});

describe('the way out', () => {
  it('offers a resend and reports its cooldown', () => {
    const onResend = vi.fn();
    renderPanel({ onResend, resendCooldown: 12 });
    expect(screen.getByRole('button', { name: /resend in 12s/i })).toBeDisabled();
  });

  it('lets the user leave', () => {
    const onDismiss = vi.fn();
    renderPanel({ onDismiss });
    fireEvent.click(screen.getByRole('button', { name: /back to login/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
