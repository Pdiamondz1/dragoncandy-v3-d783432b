// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const authState: { user: unknown; loading: boolean } = { user: null, loading: false };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

vi.mock("@/components/SEO", () => ({ SEO: () => null }));

// The article list is not what this file is about; return an empty set so the page renders its
// shell (and its empty state, which carries the second dashboard CTA).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

async function setup() {
  const { default: HelpCenter } = await import("./HelpCenter");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HelpCenter />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  navigateMock.mockClear();
  authState.user = null;
  vi.resetModules();
});

/**
 * /help is PUBLIC — the landing footer links straight to it with no session. It nonetheless told
 * every visitor "Back to Dashboard", including people who have never had one. Founder-reported
 * 2026-08-23 alongside the oversized public-page logo.
 *
 * The destination was never wrong ('/' redirects a signed-in user onward); only the promise the
 * label made was.
 */
describe("HelpCenter dashboard CTAs", () => {
  it("promises no dashboard to a signed-out visitor", async () => {
    const { container } = await setup();

    expect(screen.getByRole("button", { name: /back to home/i })).toBeInTheDocument();
    // Nothing anywhere on the page may say "dashboard" with no session.
    expect(container.textContent).not.toMatch(/dashboard/i);
  });

  it("offers the dashboard once there IS one, and points at it directly", async () => {
    authState.user = { id: "u1" };
    await setup();

    const back = screen.getByRole("button", { name: /back to dashboard/i });
    expect(back).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back to home/i })).toBeNull();
  });
});
