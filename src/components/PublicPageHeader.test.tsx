// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const authState: { user: unknown; loading: boolean } = { user: null, loading: false };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

async function setup() {
  const { PublicPageHeader } = await import("./PublicPageHeader");
  return render(
    <MemoryRouter>
      <PublicPageHeader />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  navigateMock.mockClear();
  authState.user = null;
});

/**
 * The logo on every public page (/how-it-works, /terms, /privacy, /help, /pricing, 404, public
 * profiles) must match the landing header's.
 *
 * It did not. `/logo.webp` is a stacked badge that is TALLER THAN WIDE — 280x326 intrinsic,
 * aspect 0.859 — and this header sized it by WIDTH (`w-[100px] md:w-[120px] lg:w-[140px] h-auto`),
 * which multiplies the height instead of capping it: 140 wide rendered **163 tall** against the
 * landing's **56**, inflating the header to 195px. Founder-reported 2026-08-23 as the logo being
 * "waaay too big" on four pages at once.
 */
describe("PublicPageHeader logo", () => {
  it("uses the landing header's exact height classes, not width classes", async () => {
    await setup();
    const logo = screen.getByAltText("DragonCandy");

    // Height-capped, matching src/components/landing/Header.tsx.
    expect(logo.className).toContain("h-12");
    expect(logo.className).toContain("lg:h-14");
    expect(logo.className).toContain("w-auto");

    // A width-based size is the actual defect: with a taller-than-wide asset it sets the height.
    expect(logo.className).not.toMatch(/\bw-\[\d+px\]/);
    expect(logo.className).not.toMatch(/\bh-auto\b/);
  });

  it("stays in step with the landing header by SHARING the size, not by copying it", () => {
    // This used to assert that both files contained the same literal class string — two copies
    // kept in step by hand. That is precisely how the other three headers (auth, mobile top nav,
    // desktop sidebar) drifted to 163px, 74px and 116px without anything failing. The size now
    // lives in @/lib/brandLogo and both files import it; brandLogo.test.ts holds the same check
    // for all five headers at once.
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
    const landing = read("src/components/landing/Header.tsx");
    const publicHeader = read("src/components/PublicPageHeader.tsx");

    for (const src of [landing, publicHeader]) {
      expect(src).toMatch(/from ["']@\/lib\/brandLogo["']/);
      expect(src).toContain("HEADER_LOGO_CLASS");
      // No local copy of the size to drift away from the constant.
      expect(src).not.toMatch(/className="[^"]*\bh-12\b[^"]*"/);
    }
  });

  it("reserves the box at the asset's REAL aspect so it cannot cause a layout shift", async () => {
    await setup();
    const logo = screen.getByAltText("DragonCandy");

    // These attributes existed as 140x47 — an aspect of 2.98 against the real 0.859. Attributes
    // meant to prevent CLS reserved the wrong shape and caused it instead.
    expect(logo.getAttribute("width")).toBe("280");
    expect(logo.getAttribute("height")).toBe("326");
  });
});
