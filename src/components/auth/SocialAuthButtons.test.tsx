// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: false,
  start: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: () => mocks.enabled,
}));

vi.mock('@/lib/socialAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/socialAuth')>();
  return { ...actual, startSocialSignIn: mocks.start };
});

import { SocialAuthButtons } from './SocialAuthButtons';
import { SOCIAL_PROVIDERS } from '@/lib/socialAuth';

describe('SocialAuthButtons', () => {
  beforeEach(() => {
    mocks.enabled = false;
    mocks.start.mockClear().mockResolvedValue({ ok: true });
  });

  /**
   * The providers are not configured in Supabase yet, so every button would
   * answer "Unsupported provider". `useFeatureFlag` fails safe to off — including
   * when the row does not exist — which is what makes "ship it dark" real rather
   * than a promise.
   */
  it('renders nothing at all while the flag is off', () => {
    const { container } = render(<SocialAuthButtons mode="signup" role={null} onError={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers every provider once the flag is on', () => {
    mocks.enabled = true;
    render(<SocialAuthButtons mode="signup" role={null} onError={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(SOCIAL_PROVIDERS.length);
    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up with apple/i })).toBeInTheDocument();
  });

  it('says "Log in" on the login screen and "Sign up" on signup', () => {
    mocks.enabled = true;
    const { rerender } = render(<SocialAuthButtons mode="login" role={null} onError={vi.fn()} />);
    expect(screen.getByRole('button', { name: /log in with google/i })).toBeInTheDocument();
    rerender(<SocialAuthButtons mode="signup" role={null} onError={vi.fn()} />);
    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument();
  });

  /** The role chosen before the redirect is what `claim_initial_role` applies after it. */
  it('carries the chosen role into the redirect', async () => {
    mocks.enabled = true;
    render(<SocialAuthButtons mode="signup" role="business_client" onError={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sign up with google/i }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('google', 'business_client'));
  });

  it('surfaces a failure to start instead of leaving a dead button', async () => {
    mocks.enabled = true;
    mocks.start.mockResolvedValue({ ok: false, message: 'Google sign-in is not available right now.' });
    const onError = vi.fn();
    render(<SocialAuthButtons mode="signup" role={null} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: /sign up with google/i }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Google sign-in is not available right now.'));
    // Re-enabled, so the user can try another provider.
    await waitFor(() => expect(screen.getByRole('button', { name: /sign up with apple/i })).toBeEnabled());
  });

  /**
   * A second provider pressed mid-redirect would start a competing OAuth flow and
   * overwrite the stashed role.
   */
  it('locks the other providers while one is starting', async () => {
    mocks.enabled = true;
    mocks.start.mockReturnValue(new Promise(() => undefined));
    render(<SocialAuthButtons mode="signup" role={null} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sign up with google/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /sign up with apple/i })).toBeDisabled());
  });
});
