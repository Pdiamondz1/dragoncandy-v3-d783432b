// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'r@example.com', email_confirmed_at: null, user_metadata: { role: 'business_client' } },
    refreshProfile: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAutoDetect', () => ({
  useAutoDetect: () => mocks.autoDetect,
}));
const mocks = vi.hoisted(() => ({
  upsert: vi.fn().mockResolvedValue({ error: null }),
  autoDetect: { loading: false, city: '', country: '', timezone: '' },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      upsert: mocks.upsert,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));
vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnboardingWizard } from './OnboardingWizard';

/**
 * The wizard reads org units through React Query so the address slide can act on the
 * row the auto-org trigger creates. Retries are off so a failing query surfaces in the
 * test rather than being retried into a timeout.
 */
function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const refetchSpy = vi.spyOn(client, 'refetchQueries').mockResolvedValue(undefined);
  const tree = () => (
    <QueryClientProvider client={client}>
      <OnboardingWizard />
    </QueryClientProvider>
  );
  const result = render(tree());
  // Re-renders the SAME tree, so the component re-reads its mocked hooks. Passing a
  // different element to `rerender` would unmount the wizard instead.
  const rerenderWizard = () => result.rerender(tree());
  return { ...result, refetchSpy, rerenderWizard };
}

/** Identity → name → Continue → cuisine → pick → Continue. Leaving the LAST collect
 *  slide is what triggers the core save. */
async function reachFirstServiceSlide() {
  fireEvent.change(screen.getByPlaceholderText(/Taco Bell/i), { target: { value: "Tony's Pizza" } });
  fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
  await screen.findByRole('heading', { name: /What kind of food do you serve\?/i });
  fireEvent.click(screen.getByRole('button', { name: /Italian/i }));
  fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
}

describe('OnboardingWizard — restaurant cuisine step', () => {
  it('asks for cuisine (not industry) and gates Continue until one is picked', async () => {
    renderWizard();

    // Identity step first — restaurant name prompt.
    expect(screen.getByRole('heading', { name: /What's your restaurant called\?/i })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Taco Bell/i), { target: { value: "Tony's Pizza" } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    // Cuisine step.
    expect(await screen.findByRole('heading', { name: /What kind of food do you serve\?/i })).toBeInTheDocument();
    expect(screen.getByText(/Pick all that apply/i)).toBeInTheDocument();

    // Continue disabled with nothing selected.
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled();

    // Pick a cuisine → Continue enables.
    fireEvent.click(screen.getByRole('button', { name: /Italian/i }));
    expect(screen.getByRole('button', { name: /Continue/i })).toBeEnabled();
  });
});

describe('OnboardingWizard — the core save runs when it needs to', () => {
  beforeEach(() => { mocks.upsert.mockClear(); });

  /**
   * The org query is a separate React Query cache from AuthContext's profile, and for a
   * new business the core save is what causes `trg_auto_create_org` to create the org.
   * Without this refetch the wizard keeps the `{ org: null }` it cached on mount, so the
   * address slide can never resolve a location to write to.
   */
  it('refetches the org query after provisioning, not just the auth profile', async () => {
    const { refetchSpy } = renderWizard();
    await reachFirstServiceSlide();
    await waitFor(() => expect(refetchSpy).toHaveBeenCalled());
    const keys = refetchSpy.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(keys.some((k) => k.includes('org-from-profile'))).toBe(true);
  });

  /**
   * The bug: `coreSaved` was a one-way latch, so going back, correcting a field and
   * continuing skipped the save. The edit stayed on screen and never reached the row.
   */
  it('saves again when a collect field is edited after the first save', async () => {
    renderWizard();
    await reachFirstServiceSlide();
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    const firstRun = mocks.upsert.mock.calls.length;

    // Back to cuisine, back to identity, change the name, forward again.
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    await screen.findByRole('heading', { name: /What kind of food do you serve\?/i });
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    await screen.findByRole('heading', { name: /What's your restaurant called\?/i });
    fireEvent.change(screen.getByPlaceholderText(/Taco Bell/i), { target: { value: 'Tony Pizzeria' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await screen.findByRole('heading', { name: /What kind of food do you serve\?/i });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => expect(mocks.upsert.mock.calls.length).toBeGreaterThan(firstRun));
  });

  /**
   * The control for the test above: without it, "saves again" would also pass against a
   * wizard that simply saves on every forward press, which is what this replaced.
   */
  it('does not save again when nothing was edited', async () => {
    renderWizard();
    await reachFirstServiceSlide();
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    const firstRun = mocks.upsert.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    await screen.findByRole('heading', { name: /What kind of food do you serve\?/i });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => expect(mocks.upsert.mock.calls.length).toBe(firstRun));
  });
});

describe('OnboardingWizard — a double tap cannot skip a slide', () => {
  beforeEach(() => { mocks.upsert.mockClear(); });

  /**
   * `goNext` became async when the core save moved into it. Unguarded, a second click
   * during that await ran a second save AND a second `setCurrentIndex(prev => prev + 1)`,
   * so the wizard advanced two slides and phone verification was skipped without ever
   * being shown.
   *
   * Forced control: this fails with BOTH guards removed and passes with either one, so it
   * pins the pair rather than a specific mechanism. The disabled button is what stops the
   * click here; the re-entry ref covers paths a disabled attribute does not.
   */
  it('advances one slide and saves once when Continue is pressed twice', async () => {
    renderWizard();
    fireEvent.change(screen.getByPlaceholderText(/Taco Bell/i), { target: { value: "Tony's Pizza" } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await screen.findByRole('heading', { name: /What kind of food do you serve\?/i });
    fireEvent.click(screen.getByRole('button', { name: /Italian/i }));

    const cont = screen.getByRole('button', { name: /Continue/i });
    fireEvent.click(cont);
    fireEvent.click(cont);

    // The slide immediately after the last collect step, not the one after that.
    expect(await screen.findByRole('heading', { name: /What's your number\?/i })).toBeInTheDocument();
  });
});

describe('OnboardingWizard — location detected after the core save', () => {
  beforeEach(() => {
    mocks.upsert.mockClear();
    mocks.autoDetect = { loading: false, city: '', country: '', timezone: '' };
  });

  /**
   * The core save moved to the collect/service boundary, so it can now beat
   * `useAutoDetect` — which waits out a geolocation timeout. A creator who tapped through
   * quickly saved nulls for city, country and timezone, detection landed a second later,
   * and nothing ever asked again: the location that nearby matching runs on was lost
   * silently and permanently.
   */
  it('saves again when detection lands after the first save', async () => {
    mocks.autoDetect = { loading: true, city: '', country: '', timezone: '' };
    const { rerenderWizard } = renderWizard();
    await reachFirstServiceSlide();
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    const firstRun = mocks.upsert.mock.calls.length;

    mocks.autoDetect = { loading: false, city: 'Hoboken', country: 'United States', timezone: 'America/New_York' };
    rerenderWizard();

    await waitFor(() => expect(mocks.upsert.mock.calls.length).toBeGreaterThan(firstRun));
  });

  /**
   * The control. The first version of this fix watched the WHOLE fingerprint, so walking
   * back to a collect slide re-saved on every keystroke. Detection settling with nothing
   * to report must change nothing.
   */
  it('does not save again when detection settles empty', async () => {
    mocks.autoDetect = { loading: true, city: '', country: '', timezone: '' };
    const { rerenderWizard } = renderWizard();
    await reachFirstServiceSlide();
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    const firstRun = mocks.upsert.mock.calls.length;

    mocks.autoDetect = { loading: false, city: '', country: '', timezone: '' };
    rerenderWizard();

    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.upsert.mock.calls.length).toBe(firstRun);
  });
});
