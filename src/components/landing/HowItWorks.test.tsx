// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HowItWorks } from "./HowItWorks";

// `BriefGeneratorPreview` (the lazy "see it work" block) calls `useNavigate`, so it needs a
// Router ancestor in case Suspense resolves it during the test — the assertions below only
// target the surrounding block, not the lazy inner (it's async and out of scope here).
function setup() {
  return render(
    <MemoryRouter>
      <HowItWorks />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe("HowItWorks", () => {
  it("renders the section eyebrow and head", () => {
    setup();

    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "From match to momentum." }),
    ).toBeInTheDocument();
  });

  it("renders the three pixel-numbered step headings", () => {
    setup();

    expect(
      screen.getByRole("heading", { level: 3, name: "Tell us what you're building" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Get matched with a person" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Build together, faster" }),
    ).toBeInTheDocument();

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("renders the 'see it work' brief-generator block", () => {
    setup();

    expect(document.getElementById("see-it-work")).toBeInTheDocument();
    expect(screen.getByText("See it work")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Paste your website — watch Donny draft a campaign brief.",
      }),
    ).toBeInTheDocument();
  });
});
