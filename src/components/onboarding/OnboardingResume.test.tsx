// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  readError: null as { message: string } | null,
  /**
   * A single promise every read awaits, so the "still in flight" race is testable.
   * Deliberately ONE hold rather than a per-call gate: `saveCore` issues a second select
   * (the creator address pre-read), and a re-arming gate hung that one too — the upsert
   * then never reached the creator branch and the assertion failed on the wrong write.
   */
  hold: null as null | Promise<void>,
  release: null as null | (() => void),
  upsert: vi.fn().mockResolvedValue({ error: null }),
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
      upsert: mocks.upsert,
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      select: () => ({ eq: () => ({ maybeSingle: async () => {
        if (mocks.hold) await mocks.hold;
        return { data: mocks.readError ? null : mocks.row, error: mocks.readError };
      } }) }),
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

/**
 * Walk a CREATOR to the collect/service boundary. That boundary is leaving `bio`, NOT
 * `identity` — `ROLE_STEPS.content_creator` is identity → skills → bio → phone → payments.
 * An earlier draft of the two tests below clicked Continue once and asserted the upsert had
 * not run, which was true no matter what the guard did, because one Continue never reaches
 * the save at all. The paired control is what exposed it.
 */
async function reachCollectBoundary() {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Anything' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

  // Skills. Two traps here, both hit while writing this:
  //   - picking "the first button that isn't Continue" grabbed the icon-only BACK button
  //     (empty text, so the filter kept it) and walked the wizard backwards; and
  //   - clicking a skill unconditionally TOGGLES OFF one that hydration already selected,
  //     leaving the slide invalid and Continue disabled.
  // So: only select something when nothing is selected yet, which the disabled state of
  // Continue tells us directly.
  const skillsContinue = await screen.findByRole('button', { name: /Continue/i });
  if ((skillsContinue as HTMLButtonElement).disabled) {
    fireEvent.click(screen.getByRole('button', { name: /Design/i }));
  }
  fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

  // bio — leaving THIS slide is what triggers the core save
  const bio = await screen.findByPlaceholderText(/viral food content/i);
  fireEvent.change(bio, { target: { value: 'I shoot food.' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
}

describe('OnboardingWizard — resuming after Stripe', () => {
  beforeEach(() => {
    mocks.row = {
      creator_name: 'Joey Smalls', bio: 'I shoot food.', skills: ['graphic_design'],
      avatar_url: null, allow_portfolio_in_feed: true, is_completed: true,
    };
    setSearch('');
    mocks.readError = null;
    mocks.upsert.mockClear();
    mocks.hold = null;
    mocks.release = null;
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


  /**
   * Codex P1, round 2. A failed READ and an absent ROW are opposite cases: absent means a
   * new signup and a blank form is right; a failure means we do not KNOW, and the creator
   * upsert has no `ignoreDuplicates`, so continuing could write blanks over a real
   * profile. The first draft of the hydration treated both as "no row" — and its comment
   * justified it by reasoning about the first-time user, while the dangerous case is the
   * returning one.
   */
  it('refuses to run the overwriting save when the profile read failed', async () => {
    mocks.readError = { message: 'network' };
    renderWizard();
    await screen.findByRole('heading', { name: /What should we call you\?/i });
    await reachCollectBoundary();
    await waitFor(() => expect(mocks.upsert).not.toHaveBeenCalled());
  });

  /** Control: the identical journey with a healthy read MUST reach the save, or the test
   *  above passes for the wrong reason. */
  it('control — the same journey does save when the read succeeded', async () => {
    mocks.row = null; // new signup: blank form, nothing to overwrite
    renderWizard();
    await screen.findByRole('heading', { name: /What should we call you\?/i });
    await reachCollectBoundary();
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
  });

  /**
   * Codex P2, round 2. Hydration restored the existing image into `avatarPreview` only,
   * while `saveCore` derives `avatarUrl` from a freshly uploaded file. So a returning user
   * who edited any collect field and continued would upsert `avatar_url: null` and delete
   * the picture still visible on screen — a silent deletion, with the image on screen the
   * whole time.
   */
  it('keeps the existing avatar when a returning user re-saves without changing it', async () => {
    mocks.row = { ...(mocks.row as Record<string, unknown>), avatar_url: 'u1/avatar-existing.jpg' };
    renderWizard();
    await screen.findByDisplayValue('Joey Smalls');
    await reachCollectBoundary();

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    const written = mocks.upsert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(written.avatar_url).toBe('u1/avatar-existing.jpg');
  });

  /**
   * Codex P1, round 3. The failure flag is false while the read is still PENDING, so a
   * user moving quickly could reach `saveCore` before hydration landed and overwrite a
   * real profile with the blank values on screen — avatar included, since the hydrated
   * path is not populated yet. The boundary now awaits the read rather than checking a
   * flag that has not been set yet.
   */
  it('does not save while the profile read is still in flight', async () => {
    mocks.hold = new Promise<void>(r => { mocks.release = r; });  // reads hang until released
    mocks.row = { ...(mocks.row as Record<string, unknown>), avatar_url: 'u1/existing.jpg' };
    renderWizard();
    await screen.findByRole('heading', { name: /What should we call you\?/i });
    await reachCollectBoundary();

    // Still pending: nothing may have been written.
    await waitFor(() => expect(mocks.upsert).not.toHaveBeenCalled());

    mocks.release?.();                           // let the reads land
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());

    // And when it does save, it saves the HYDRATED avatar, not null.
    const written = mocks.upsert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(written.avatar_url).toBe('u1/existing.jpg');
  });

  /**
   * Codex P2, round 4. The post-login redirect computes the first slide with actionable
   * work and passes it as `?step=`. Without the wizard honouring it, a routed user starts at
   * slide 1 and walks back through everything they already finished.
   */
  it('starts at the slide named by ?step=', async () => {
    setSearch('?step=phone');
    renderWizard();
    expect(await screen.findByRole('heading', { name: /What's your number\?/i })).toBeInTheDocument();
  });

  /**
   * The parameter arrives in a URL, so it is untrusted. `ready` is the wizard's END —
   * honouring it would let a hand-typed link skip onboarding entirely, which is the very
   * bug this whole change exists to fix.
   */
  it('refuses ?step=ready and starts at the beginning', async () => {
    setSearch('?step=ready');
    renderWizard();
    expect(await screen.findByRole('heading', { name: /What should we call you\?/i })).toBeInTheDocument();
  });

  it('ignores a slide this role does not have', async () => {
    setSearch('?step=cuisine');          // a restaurant slide; this account is a creator
    renderWizard();
    expect(await screen.findByRole('heading', { name: /What should we call you\?/i })).toBeInTheDocument();
  });
});
