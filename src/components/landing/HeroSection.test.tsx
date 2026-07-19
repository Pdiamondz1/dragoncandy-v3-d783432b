// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";

// `LANDING_VIDEO_BACKDROP_ENABLED` is read as a top-level import in HeroSection.tsx, so a single
// hoisted `vi.mock('@/lib/featureConfig')` would bind the whole file to one value. To exercise
// both flag states we reset the module registry and `vi.doMock` + dynamic-`import()` a fresh copy
// of HeroSection per test instead.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** jsdom doesn't implement scrollIntoView; stub it on the rendered element in place. */
function stubScroll(el: Element) {
  const spy = vi.fn();
  (el as unknown as { scrollIntoView: () => void }).scrollIntoView = spy;
  return spy;
}

describe("HeroSection — video backdrop OFF (default)", () => {
  it("renders the eyebrow, headline, sub, note, hero CTAs (scroll), and both doors (signup links) — with no video backdrop mounted", async () => {
    vi.doMock("@/lib/featureConfig", () => ({ LANDING_VIDEO_BACKDROP_ENABLED: false }));
    const { HeroSection } = await import("./HeroSection");

    render(<HeroSection />);

    expect(screen.getByText("Human-driven · AI-assisted")).toBeInTheDocument();

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("creators");
    expect(h1.textContent).toContain("entrepreneurs");
    expect(h1.textContent).toContain("build together.");

    expect(
      screen.getByText(
        /DragonCandy connects business owners with talented social media creators/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Real people. Real partnerships. AI in the toolbelt."),
    ).toBeInTheDocument();

    // Hero CTAs scroll in-page to the doors — they do NOT navigate to signup.
    const businessDoor = document.getElementById("business")!;
    const creatorsDoor = document.getElementById("creators")!;
    expect(businessDoor).toBeInTheDocument();
    expect(creatorsDoor).toBeInTheDocument();
    const businessScrollSpy = stubScroll(businessDoor);
    const creatorsScrollSpy = stubScroll(creatorsDoor);

    fireEvent.click(screen.getByRole("button", { name: "I run a business" }));
    expect(businessScrollSpy).toHaveBeenCalledTimes(1);
    expect(creatorsScrollSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "I'm a creator" }));
    expect(creatorsScrollSpy).toHaveBeenCalledTimes(1);

    // Business door.
    expect(within(businessDoor).getByText("For business owners")).toBeInTheDocument();
    expect(
      within(businessDoor).getByText("Your own social media department — without hiring one."),
    ).toBeInTheDocument();
    const businessCta = within(businessDoor).getByRole("link", { name: "Find your creator" });
    expect(businessCta).toHaveAttribute("href", "/auth?mode=signup&role=business");

    // Creator door.
    expect(within(creatorsDoor).getByText("For creators")).toBeInTheDocument();
    expect(
      within(creatorsDoor).getByText("Turn what you do every day into a real business."),
    ).toBeInTheDocument();
    const creatorCta = within(creatorsDoor).getByRole("link", { name: "Find your clients" });
    expect(creatorCta).toHaveAttribute("href", "/auth?mode=signup&role=creator");

    // No video backdrop mounts when the flag is off.
    expect(screen.queryByTestId("rotating-backdrop")).not.toBeInTheDocument();
  });
});

describe("HeroSection — video backdrop ON", () => {
  it("lazy-mounts HeroVideoBackdrop (RotatingBackdrop) when the flag is on", async () => {
    vi.doMock("@/lib/featureConfig", () => ({ LANDING_VIDEO_BACKDROP_ENABLED: true }));
    vi.doMock("./useLandingBackdropPlaylist", () => ({
      useLandingBackdropPlaylist: () => [],
    }));
    vi.doMock("./RotatingBackdrop", () => ({
      RotatingBackdrop: () => <div data-testid="rotating-backdrop" />,
    }));
    const { HeroSection } = await import("./HeroSection");

    render(<HeroSection />);

    expect(await screen.findByTestId("rotating-backdrop")).toBeInTheDocument();
  });
});
