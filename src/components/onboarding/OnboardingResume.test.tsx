// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Returning from Stripe is a FULL page navigation off-site and back, so the wizard
 * remounts with every field at its initial value and `currentIndex` at 0.
 *
 * Two separate failures come from that, and only the first is cosmetic:
 *   1. the user lands on slide 1 instead of the payments slide they left, and
 *   2. the creator write is `upsert(..., { onConflict: 'user_id' })` with NO
 *      `ignoreDuplicates`, so pressing Continue on that blank slide 1 overwrites their
 *      own name, bio and skills with empty strings.
 *
 * (2) is why returning to `/profile/setup` could not ship on its own — it would have
 * turned "onboarding ends early" into "onboarding destroys your profile". Raised as a P1
 * by the Codex second review.
 */
const mocks = vi.hoisted(() => ({
  row: {
    creator_name: 'Joey Smalls',
    bio: 'I shoot food.',
    skills: ['graphic_design'],
    avatar_url: null,
    allow_portfolio_in_feed: true,
    is_completed: true,
  } as Record<string, unknown> | null,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'c@example.com', email_confirmed_at: null, user_metadata: { role: 'content_creator' } },
    refreshProfile: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAutoDetect', () => ({
  useAutoDetect: () => ({ loading: false, city: '', country: '', timezone: '' }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.row, error: null }) }) }),
    }),
  },
}));
vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/settings/StripeConnectSetup', () => ({
  StripeConnectSetup: () => <div data-testid="connect" />,
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnboardingWizard } from './OnboardingWizard';

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingWizard />
    </QueryClientProvider>,
  );
}

function setSearch(search: string) {
  window.history.replaceState({}, '', `/profile/setup${search}`);
}

describe('OnboardingWizard — resuming after Stripe', () => {
  beforeEach(() => {
    mocks.row = {
      creator_name: 'Joey Smalls', bio: 'I shoot food.', skills: ['graphic_design'],
      avatar_url: null, allow_portfolio_in_feed: true, is_completed: true,
    };
    setSearch('');
  });

  it('lands on the payments slide, not slide 1, when Stripe sends the user back', async () => {
    setSearch('?stripe_onboarding=complete');
    renderWizard();
    expect(await screen.findByRole('heading', { name: /Set up payments/i })).toBeInTheDocument();
  });

  it('also resumes on the refresh flag, which means Stripe bounced them', async () => {
    setSearch('?stripe_refresh=true');
    renderWizard();
    expect(await screen.findByRole('heading', { name: /Set up payments/i })).toBeInTheDocument();
  });

  /**
   * The data-loss guard. Without hydration the name field is empty on return, and the
   * upsert that runs on Continue would write that empty string over a real profile.
   */
  it('rehydrates the existing profile rather than showing blank fields', async () => {
    renderWizard();
    expect(await screen.findByDisplayValue('Joey Smalls')).toBeInTheDocument();
  });

  /** A brand-new signup has no row. It must still start at slide 1 with a blank form. */
  it('leaves a first-time user untouched when there is no row', async () => {
    mocks.row = null;
    setSearch('?stripe_onboarding=complete');
    renderWizard();
    expect(await screen.findByRole('heading', { name: /What should we call you\?/i })).toBeInTheDocument();
  });

  /** An incomplete profile must resume where it left off, never jump to the end. */
  it('does not jump to payments when the profile is not complete', async () => {
    mocks.row = { ...(mocks.row as Record<string, unknown>), is_completed: false };
    setSearch('?stripe_onboarding=complete');
    renderWizard();
    expect(await screen.findByRole('heading', { name: /What should we call you\?/i })).toBeInTheDocument();
  });

  /**
   * `StripeConnectSetup` reads the SAME query flag to refresh its status and clears it
   * itself. If the wizard cleared it first that refresh would silently stop working —
   * the destination would be fixed and the arrival broken.
   */
  it('does not consume the query flag it resumed on', async () => {
    setSearch('?stripe_onboarding=complete');
    renderWizard();
    await screen.findByRole('heading', { name: /Set up payments/i });
    expect(window.location.search).toContain('stripe_onboarding=complete');
  });
});
