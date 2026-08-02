// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const auth = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.current }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), message: vi.fn() } }));
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

import { VerifiedRoute } from './VerifiedRoute';

function setAuth(partial: any) {
  auth.current = {
    loading: false,
    isAuthenticated: true,
    profile: { id: 'u1', email: 'a@b.c', role: 'business_client', email_verified: true },
    user: {
      id: 'u1',
      email: 'a@b.c',
      email_confirmed_at: '2026-06-26T11:17:44Z',
      user_metadata: {},
    },
    ...partial,
  };
}

const renderGate = () =>
  render(<VerifiedRoute><div data-testid="child">setup</div></VerifiedRoute>);

describe('VerifiedRoute', () => {
  beforeEach(() => setAuth({}));

  it('renders onboarding for a verified user with a profile', () => {
    const { queryByTestId } = renderGate();
    expect(queryByTestId('child')).toBeTruthy();
  });

  it('redirects an unauthenticated visitor to /auth', () => {
    setAuth({ isAuthenticated: false, profile: null, user: null });
    expect(renderGate().queryByTestId('redirect')?.getAttribute('data-to')).toBe('/auth');
  });

  it('still blocks a genuinely unverified email (profile exists, flag false)', () => {
    setAuth({ profile: { id: 'u1', role: 'business_client', email_verified: false } });
    const { queryByTestId } = renderGate();
    expect(queryByTestId('child')).toBeNull();
    expect(queryByTestId('redirect')?.getAttribute('data-to')).toBe('/auth?mode=login');
  });

  // Regression: a user with NO profiles row was treated as "email not verified"
  // and bounced to /auth, which sent them straight back here — an infinite loop
  // under a notice they could not act on. Onboarding is where they belong.
  it('lets a profile-less user reach onboarding instead of looping to /auth', () => {
    setAuth({ profile: null });
    const { queryByTestId } = renderGate();
    expect(queryByTestId('child')).toBeTruthy();
    expect(queryByTestId('redirect')).toBeNull();
  });

  // AuthContext fabricates a profile from user metadata when the row is missing;
  // that object has no email_verified, which must not read as "unverified".
  it('lets a verified user through on a metadata-fabricated profile (no email_verified key)', () => {
    setAuth({ profile: { id: 'u1', email: 'a@b.c', role: 'business_client', full_name: 'A' } });
    const { queryByTestId } = renderGate();
    expect(queryByTestId('child')).toBeTruthy();
    expect(queryByTestId('redirect')).toBeNull();
  });

  it('still blocks a metadata-fabricated profile when auth itself is unconfirmed', () => {
    setAuth({
      profile: { id: 'u1', email: 'a@b.c', role: 'business_client' },
      user: { id: 'u1', email: 'a@b.c', email_confirmed_at: null, user_metadata: { role: 'business_client' } },
    });
    expect(renderGate().queryByTestId('redirect')?.getAttribute('data-to')).toBe('/auth?mode=login');
  });

  // Letting "no row" read as verified would hand an unconfirmed account a way to
  // provision itself through onboarding; ProtectedRoute does not re-check later.
  it('blocks a profile-less user whose auth email is unconfirmed', () => {
    setAuth({
      profile: null,
      user: { id: 'u1', email: 'a@b.c', email_confirmed_at: null, user_metadata: {} },
    });
    const { queryByTestId } = renderGate();
    expect(queryByTestId('child')).toBeNull();
    expect(queryByTestId('redirect')?.getAttribute('data-to')).toBe('/auth?mode=login');
  });

  // Internal-only AIOS accounts (account_scope='internal') get no consumer
  // profile by design; they belong on the internal dashboard, not in onboarding.
  it('sends an internal-only account to /internal', () => {
    setAuth({
      profile: null,
      user: {
        id: 'u1',
        email_confirmed_at: '2026-06-26T11:17:44Z',
        user_metadata: { account_scope: 'internal' },
      },
    });
    const { queryByTestId } = renderGate();
    expect(queryByTestId('child')).toBeNull();
    expect(queryByTestId('redirect')?.getAttribute('data-to')).toBe('/internal');
  });

  it('shows the spinner while auth is still loading', () => {
    setAuth({ loading: true, profile: null });
    const { queryByTestId } = renderGate();
    expect(queryByTestId('child')).toBeNull();
    expect(queryByTestId('redirect')).toBeNull();
  });
});
