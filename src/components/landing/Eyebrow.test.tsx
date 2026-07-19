// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Eyebrow } from "./Eyebrow";

afterEach(() => cleanup());

describe("Eyebrow", () => {
  it("renders its text", () => {
    const { getByText } = render(<Eyebrow>Human-driven</Eyebrow>);
    expect(getByText("Human-driven")).toBeTruthy();
  });

  it("is a pixel-font, uppercase, tracked label", () => {
    const { container } = render(<Eyebrow>label</Eyebrow>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toContain("font-pixel");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("tracking-[0.14em]");
    expect(el.className).toContain("text-[11px]");
    expect(el.className).toContain("inline-flex");
  });

  it("renders a leading square marker that inherits color via currentColor", () => {
    const { container } = render(<Eyebrow>label</Eyebrow>);
    const marker = container.querySelector("span > span");
    expect(marker).toBeTruthy();
    expect(marker!.className).toContain("bg-current");
    expect(marker!.className).toContain("h-2");
    expect(marker!.className).toContain("w-2");
  });

  it("forwards className so callers can color it (e.g. text-landing-pink)", () => {
    const { container } = render(<Eyebrow className="text-landing-pink">label</Eyebrow>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("text-landing-pink");
  });
});
