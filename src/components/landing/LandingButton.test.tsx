// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { LandingButton } from "./LandingButton";

afterEach(() => cleanup());

describe("LandingButton variants", () => {
  it("pink: fill + shadow classes", () => {
    const { getByRole } = render(<LandingButton variant="pink">Go</LandingButton>);
    const btn = getByRole("button");
    expect(btn.className).toContain("bg-landing-pink");
    // Was "text-white" until 2026-08-23 - see the contrast test below for why it moved. The FILL
    // is unchanged; only the label colour did.
    expect(btn.className).toContain("text-landing-grape");
    expect(btn.className).toContain("shadow-landing-pink");
    expect(btn.className).toContain("hover:shadow-landing-pink-hover");
  });

  it("mint: fill + shadow classes", () => {
    const { getByRole } = render(<LandingButton variant="mint">Go</LandingButton>);
    const btn = getByRole("button");
    expect(btn.className).toContain("bg-landing-mint");
    expect(btn.className).toContain("text-landing-grape");
    expect(btn.className).toContain("shadow-landing-mint");
    expect(btn.className).toContain("hover:shadow-landing-mint-hover");
  });

  it("ghost: border + transparent classes", () => {
    const { getByRole } = render(<LandingButton variant="ghost">Go</LandingButton>);
    const btn = getByRole("button");
    expect(btn.className).toContain("border-2");
    expect(btn.className).toContain("border-landing-grape");
    expect(btn.className).toContain("text-landing-grape");
    expect(btn.className).toContain("hover:bg-landing-lilac");
  });

  it("defaults to the pink variant", () => {
    const { getByRole } = render(<LandingButton>Go</LandingButton>);
    expect(getByRole("button").className).toContain("bg-landing-pink");
  });

  it("is a chunky pill: rounded-full, bold, generous padding", () => {
    const { getByRole } = render(<LandingButton>Go</LandingButton>);
    const btn = getByRole("button");
    expect(btn.className).toContain("rounded-full");
    expect(btn.className).toContain("font-semibold");
    expect(btn.className).toContain("px-6");
    expect(btn.className).toContain("py-3");
  });

  it("lifts on hover, gated behind motion-safe", () => {
    const { getByRole } = render(<LandingButton>Go</LandingButton>);
    expect(getByRole("button").className).toContain("motion-safe:hover:-translate-y-0.5");
  });

  it("shows a visible focus-visible ring in landing-yellow", () => {
    const { getByRole } = render(<LandingButton>Go</LandingButton>);
    expect(getByRole("button").className).toContain("focus-visible:outline-landing-yellow");
  });
});

describe("LandingButton polymorphism", () => {
  it("renders a <button> when no href is given", () => {
    const { container } = render(<LandingButton>Go</LandingButton>);
    expect(container.querySelector("button")).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders an <a> when href is given, forwarding the href", () => {
    const { container } = render(<LandingButton href="#join">Go</LandingButton>);
    const a = container.querySelector("a");
    expect(a).toBeTruthy();
    expect(a!.getAttribute("href")).toBe("#join");
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("LandingButton forwarding", () => {
  it("forwards onClick on a <button>", () => {
    const onClick = vi.fn();
    const { getByRole } = render(<LandingButton onClick={onClick}>Go</LandingButton>);
    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forwards onClick on an <a>", () => {
    const onClick = vi.fn();
    const { container } = render(
      <LandingButton href="#join" onClick={onClick}>
        Go
      </LandingButton>,
    );
    fireEvent.click(container.querySelector("a")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("never labels a filled variant in white - both fills carry grape text", () => {
    // White on landing-pink (#F43F7F) is 3.58:1, under the 4.5:1 this label needs (18px, so the
    // 3.0:1 large-text allowance does not apply). Lighthouse failed the landing's accessibility
    // score on it, and it is the primary CTA on the homepage. Grape on the same pink is 4.83:1 -
    // which fixes it WITHOUT touching the brand colour, since the fill is byte-identical.
    //
    // Darkening the fill to landing-pink-ink (#C22760, 5.60:1 with white) was the alternative and
    // was rejected: the page behind this button is dark video, and the bright pink is what makes
    // the CTA pop off it. Do not "restore" white text here; re-measure first.
    const { getByRole } = render(<LandingButton variant="pink">Get started</LandingButton>);
    const pink = getByRole("button");
    expect(pink.className).toContain("bg-landing-pink");
    expect(pink.className).toContain("text-landing-grape");
    expect(pink.className).not.toMatch(/\btext-white\b/);

    cleanup();

    const { getByRole: getMint } = render(<LandingButton variant="mint">Go</LandingButton>);
    const mint = getMint("button");
    expect(mint.className).toContain("text-landing-grape");
    expect(mint.className).not.toMatch(/\btext-white\b/);
  });

  it("forwards className, type, and aria-label", () => {
    const { getByRole } = render(
      <LandingButton className="extra-class" type="submit" aria-label="Submit form">
        Go
      </LandingButton>,
    );
    const btn = getByRole("button", { name: "Submit form" });
    expect(btn.className).toContain("extra-class");
    expect(btn.getAttribute("type")).toBe("submit");
  });
});
