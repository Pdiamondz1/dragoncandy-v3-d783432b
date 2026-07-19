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
    expect(btn.className).toContain("text-white");
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
