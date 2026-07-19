// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { PositioningBand } from "./PositioningBand";

afterEach(() => cleanup());

describe("PositioningBand", () => {
  it("renders the eyebrow and band head", () => {
    render(<PositioningBand />);

    expect(screen.getByText("What DragonCandy is")).toBeInTheDocument();

    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2).toHaveTextContent("A platform built for two kinds of builders.");
  });

  it("emphasizes the closing sentence with a white <strong>", () => {
    render(<PositioningBand />);

    const strong = screen.getByText(
      /AI works in the background to make everyone faster/,
    );
    expect(strong.tagName).toBe("STRONG");
    expect(strong.className).toContain("text-white");
  });
});
