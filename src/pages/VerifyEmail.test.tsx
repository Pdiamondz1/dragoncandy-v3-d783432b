// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

/**
 * `verify-email` writes `profiles.email_verified` in the database, but `AuthContext.profile`
 * still holds the row as it was loaded. Two readers of one fact, one fresh and one stale:
 * `AuthPage.checkProfileCompletion` re-reads the DB, sees true, and sends the user to their
 * dashboard — where `ProtectedRoute` reads the stale context, sees false, and sends them
 * back. A redirect loop only a hard reload breaks. Raised by the Codex second review of the
 * route gate.
 */
const mocks = vi.hoisted(() => ({
  refreshProfile: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
  navigate: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ refreshProfile: mocks.refreshProfile }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
// Presentational only, and both touch the document — mocked exactly as the wizard tests do.
vi.mock('@/components/SEO', () => ({ SEO: () => null }));
vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/landing/LandingButton', () => ({
  LandingButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [new URLSearchParams('token=tok_123'), vi.fn()],
  };
});

import VerifyEmail from './VerifyEmail';

describe('VerifyEmail', () => {
  beforeEach(() => {
    mocks.refreshProfile.mockClear().mockResolvedValue(undefined);
    mocks.invoke.mockClear().mockResolvedValue({ data: { success: true }, error: null });
    mocks.navigate.mockClear();
  });

  it('refreshes the auth context after a successful verification', async () => {
    render(<MemoryRouter><VerifyEmail /></MemoryRouter>);
    await waitFor(() => expect(mocks.refreshProfile).toHaveBeenCalled());
  });

  /**
   * Order is the whole point. Navigating first races the very update the destination is
   * about to be judged on, which is the loop this fixes.
   */
  it('refreshes BEFORE it navigates', async () => {
    const order: string[] = [];
    mocks.refreshProfile.mockImplementation(async () => { order.push('refresh'); });
    mocks.navigate.mockImplementation(() => { order.push('navigate'); });

    render(<MemoryRouter><VerifyEmail /></MemoryRouter>);
    await waitFor(() => expect(order).toContain('refresh'));
    if (order.includes('navigate')) expect(order.indexOf('refresh')).toBeLessThan(order.indexOf('navigate'));
  });

  /**
   * Verification really did succeed; a failed refresh must not turn that into an error
   * screen, because the next auth event reloads the profile anyway.
   */
  it('still reports success when the refresh fails', async () => {
    mocks.refreshProfile.mockRejectedValue(new Error('network'));
    render(<MemoryRouter><VerifyEmail /></MemoryRouter>);
    // getAllByText, not getByText: the success state renders the phrase twice (heading and
    // body), and `getByText` THROWS on multiple matches rather than passing — which read as
    // "the success state never rendered" when it had.
    await waitFor(() => expect(screen.getAllByText(/has been verified/i).length).toBeGreaterThan(0));
  });

  /** A failed verification must not refresh anything — there is nothing new to read. */
  it('does not refresh when verification did not succeed', async () => {
    mocks.invoke.mockResolvedValue({ data: { success: false }, error: null });
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { replace }, writable: true });
    render(<MemoryRouter><VerifyEmail /></MemoryRouter>);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(mocks.refreshProfile).not.toHaveBeenCalled();
  });
});
