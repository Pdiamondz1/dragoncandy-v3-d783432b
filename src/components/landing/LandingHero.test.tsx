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

    const ctas = screen.getAllByRole("link");
    expect(ctas).toHaveLength(1);
    expect(ctas[0]).toHaveAttribute("href", "/auth?mode=signup");
    expect(ctas[0]).toHaveTextContent("Get started");
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
