// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("LandingHero", () => {
  it("renders the eyebrow, the slogan as one sentence, and exactly one CTA into signup", async () => {
    vi.doMock("./RotatingBackdrop", () => ({
      RotatingBackdrop: () => <div data-testid="rotating-backdrop" />,
    }));
    const { LandingHero } = await import("./LandingHero");

    render(<LandingHero />);

    expect(screen.getByText("People-Driven · Donny-Assisted")).toBeInTheDocument();

    // The accent spans must not fragment the sentence for a screen reader.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Where Restaurants & Creators build content together.");

    // Two links, and the asymmetry between them is the design: ONE call to action, plus a
    // secondary way in for someone who already has an account. If the log-in ever becomes a
    // second pill, this page has two CTAs and the single-CTA premise is gone.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);

    const cta = screen.getByRole("link", { name: "Get started" });
    expect(cta).toHaveAttribute("href", "/auth?mode=signup");

    const login = screen.getByRole("link", { name: "Log in" });
    expect(login).toHaveAttribute("href", "/auth?mode=login");
    // The pill styling belongs to the CTA alone.
    expect(cta.className).toMatch(/rounded-full/);
    expect(login.className).not.toMatch(/rounded-full/);
  });

  it("carries the log-in affordance on more than colour", async () => {
    const { LandingHero } = await import("./LandingHero");
    render(<LandingHero />);

    // Over moving footage colour is the least reliable cue, and colour alone is never an
    // affordance. The underline is what makes this readable as a link on a bright frame.
    const login = screen.getByRole("link", { name: "Log in" });
    expect(login.className).toMatch(/\bunderline\b/);

    // landing-mint-line (#B8ECDA), not the slogan's brighter #7BE3C0: this is SMALL text, so it
    // needs 4.5:1 rather than 3.0:1, and the bright mint measures only 3.91 at p90 in this band
    // against the paler one's 4.62. Re-measure before changing it.
    expect(login.className).toMatch(/text-landing-mint-line\b/);
  });

  // The backdrop deliberately does NOT mount here — it moved to the page wrapper so the footage
  // runs behind the footer too (see LandingPage.test.tsx). Pinned so a future refactor that
  // quietly moves it back reintroduces the opaque-footer seam loudly instead of silently.
  it("paints no background of its own, so the page-level footage shows through", async () => {
    const { LandingHero } = await import("./LandingHero");
    const { container } = render(<LandingHero />);
    const section = container.querySelector("section");
    expect(section).not.toBeNull();
    expect(section!.className).not.toMatch(/\bbg-/);
    expect(container.querySelector("video")).toBeNull();
  });
});
