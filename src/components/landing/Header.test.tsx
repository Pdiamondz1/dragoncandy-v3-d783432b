// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Header } from "./Header";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

function setup() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  navigateMock.mockClear();
});

describe("Header logo", () => {
  it("renders the DragonCandy wordmark logo and navigates home on click", () => {
    setup();
    const logo = screen.getByAltText("DragonCandy") as HTMLImageElement;
    expect(logo.getAttribute("src")).toBe("/logo.webp");

    fireEvent.click(logo);
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});

describe("Header nav", () => {
  it("renders the logo and a single Log in link, and no section nav", () => {
    setup();

    const logo = screen.getByAltText("DragonCandy");
    expect(logo.getAttribute("src")).toBe("/logo.webp");

    expect(screen.queryByText("For businesses")).not.toBeInTheDocument();
    expect(screen.queryByText("For creators")).not.toBeInTheDocument();
    expect(screen.queryByText("How it works")).not.toBeInTheDocument();
    expect(screen.queryByText("Meet Donny")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /menu/i })).not.toBeInTheDocument();
  });

  it("routes Log in to /auth?mode=login", () => {
    setup();
    fireEvent.click(screen.getByText("Log in"));
    expect(navigateMock).toHaveBeenCalledWith("/auth?mode=login");
  });
});
