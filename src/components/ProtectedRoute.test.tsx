// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * `ProtectedRoute` wraps 79 routes and checked only "is there a session". The single
 * `VerifiedRoute` was the only guard that checked verification, so an unverified account
 * with a live session could reach dashboards, campaigns and messaging — prevented in
 * practice only by `AuthForm` signing the user out at signup, i.e. a UX step doing security
 * work. These tests pin the boundary as a ROUTE gate, so it survives that sign-out being
 * removed.
 */
const auth = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.state }));

import { ProtectedRoute } from './ProtectedRoute';

const CONFIRMED = { email_confirmed_at: '2026-08-11T19:03:57Z' };

function renderAt(state: Record<string, unknown>) {
  auth.state = state;
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<ProtectedRoute><div>DASHBOARD</div></ProtectedRoute>} />
        <Route path="/auth" element={<div>AUTH PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('admits a verified account', () => {
    renderAt({ isAuthenticated: true, loading: false, profile: { email_verified: true }, user: CONFIRMED });
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  /** The hole this closes: a live session whose email was never proven. */
  it('turns an unverified account away from a protected route', () => {
    renderAt({ isAuthenticated: true, loading: false, profile: { email_verified: false }, user: CONFIRMED });
    expect(screen.queryByText('DASHBOARD')).toBeNull();
    expect(screen.getByText('AUTH PAGE')).toBeInTheDocument();
  });

  it('still turns away a session-less visitor', () => {
    renderAt({ isAuthenticated: false, loading: false, profile: null, user: null });
    expect(screen.getByText('AUTH PAGE')).toBeInTheDocument();
  });

  /**
   * An internal-only account has no consumer profile row BY DESIGN, so judging it on
   * `email_verified` would bar the team from the app on a column that is never set.
   */
  it('lets a DragonCandy team account through', () => {
    renderAt({
      isAuthenticated: true, loading: false, profile: null,
      user: { ...CONFIRMED, user_metadata: { account_scope: 'internal' } },
    });
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  /**
   * ISOLATES THE EXEMPTION. The case above passes even with `isInternalOnly` removed from
   * the gate, because a null profile falls back to `email_confirmed_at` and that is set —
   * so it proves nothing about the exemption. A forced control showed exactly that: dropping
   * `!isInternalOnly` failed ZERO tests. Here the team account has NO auth confirmation
   * either, so `emailNotVerified` is genuinely true and only the exemption lets it through.
   */
  it('lets a team account through even when nothing has confirmed its email', () => {
    renderAt({
      isAuthenticated: true, loading: false, profile: null,
      user: { user_metadata: { account_scope: 'internal' } },
    });
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  /** Bouncing mid-resolution would flicker every authenticated route on every load. */
  it('does not bounce while auth is still resolving', () => {
    renderAt({ isAuthenticated: true, loading: true, profile: null, user: null });
    expect(screen.queryByText('AUTH PAGE')).toBeNull();
  });
});
