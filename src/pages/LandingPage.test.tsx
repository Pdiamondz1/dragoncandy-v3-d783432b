// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock("@/components/SEO", () => ({
  SEO: () => null,
}));

vi.mock("@/components/landing/RotatingBackdrop", () => ({
  RotatingBackdrop: () => <div data-testid="rotating-backdrop" />,
}));

async function setup() {
  const { default: LandingPage } = await import("./LandingPage");
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  navigateMock.mockClear();
  vi.resetModules();
});

describe("LandingPage", () => {
  it("mounts the rotating backdrop at page level, not inside the hero", async () => {
    const { container } = await setup();

    const backdrop = screen.getByTestId("rotating-backdrop");
    expect(backdrop).toBeInTheDocument();

    // It must be a child of the page wrapper and a SIBLING of the hero section — not inside it.
    // Nested inside the hero, the footage would stop at the footer's top edge and the footer
    // would need an opaque background of its own, which is the seam this layout removed.
    const section = container.querySelector("section");
    expect(section).not.toBeNull();
    expect(section!.contains(backdrop)).toBe(false);
  });

  it("gives the footer no background and no border, so the footage runs edge to edge", async () => {
    const { container } = await setup();

    const footer = container.querySelector("footer");
    expect(footer).not.toBeNull();

    // A background or a top border on the footer both re-draw the horizontal seam across the
    // bottom of the screen. Neither is allowed here.
    expect(footer!.className).not.toMatch(/\bbg-/);
    expect(footer!.className).not.toMatch(/\bborder-t\b/);
  });

  it("pads the footer for the iOS home indicator", async () => {
    const { container } = await setup();

    const footer = container.querySelector("footer");
    // Bottom-anchored chrome must pay back env(safe-area-inset-bottom) — invisible on the web,
    // load-bearing in the Capacitor iOS shell (DESIGN_SYSTEM.md).
    expect(footer!.className).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("keeps the legal entity and the three legal links in the footer", async () => {
    const { container } = await setup();

    const footer = container.querySelector("footer")!;
    expect(footer.textContent).toContain("Dragon Candy LLC");
    expect(footer.textContent).toContain("Hoboken, NJ");

    const hrefs = [...footer.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/terms", "/privacy", "/help"]);
  });
});
