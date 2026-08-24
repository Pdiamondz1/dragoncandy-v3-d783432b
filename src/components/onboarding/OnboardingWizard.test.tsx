// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'r@example.com', email_confirmed_at: null, user_metadata: { role: 'business_client' } },
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
  return render(
    <QueryClientProvider client={client}>
      <OnboardingWizard />
    </QueryClientProvider>,
  );
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
