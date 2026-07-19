// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { DonnySection } from "./DonnySection";

afterEach(() => cleanup());

describe("DonnySection", () => {
  it("renders the real Donny emblem", () => {
    render(<DonnySection />);

    expect(screen.getByAltText("Donny")).toBeInTheDocument();
  });

  it("renders the section head", () => {
    render(<DonnySection />);

    expect(
      screen.getByRole("heading", { level: 2, name: "The assistant in everyone's toolbelt." }),
    ).toBeInTheDocument();
  });

  it("renders the emphasized closing line", () => {
    render(<DonnySection />);

    const strong = screen.getByText("Donny never replaces the humans. Donny works for them.");
    expect(strong.tagName).toBe("STRONG");
  });

  it("does not render the brief generator (relocated to HowItWorks)", () => {
    render(<DonnySection />);

    expect(document.getElementById("see-it-work")).not.toBeInTheDocument();
    expect(screen.queryByText(/generate brief/i)).not.toBeInTheDocument();
  });
});
