// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { ValuesSection } from "./ValuesSection";

afterEach(() => cleanup());

describe("ValuesSection", () => {
  it("renders the section eyebrow and head", () => {
    render(<ValuesSection />);

    expect(screen.getByText("Why it works")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "People first. Platform underneath." }),
    ).toBeInTheDocument();
  });

  it("renders the three value headings", () => {
    render(<ValuesSection />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Human connections, not algorithms" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Run your business, don't just post",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "AI assists. Humans decide." }),
    ).toBeInTheDocument();
  });
});
