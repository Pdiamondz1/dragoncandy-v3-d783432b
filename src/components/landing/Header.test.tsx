// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Header } from "./Header";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const SECTION_IDS = ["business", "creators", "how", "donny"];

/** Header's nav buttons scroll-target these ids via `document.getElementById(...).scrollIntoView()`,
 * which jsdom doesn't implement — stub real target elements with their own spy. */
function stubSections() {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const id of SECTION_IDS) {
    const el = document.createElement("div");
    el.id = id;
    const spy = vi.fn();
    (el as unknown as { scrollIntoView: () => void }).scrollIntoView = spy;
    document.body.appendChild(el);
    spies[id] = spy;
  }
  return spies;
}

function setup() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  navigateMock.mockClear();
  vi.useRealTimers();
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

describe("Header desktop nav", () => {
  it("scroll-links each of the four section buttons to its target", () => {
    const spies = stubSections();
    setup();
    const nav = screen.getByRole("navigation", { name: "Primary" });

    fireEvent.click(within(nav).getByText("For businesses"));
    expect(spies.business).toHaveBeenCalled();

    fireEvent.click(within(nav).getByText("For creators"));
    expect(spies.creators).toHaveBeenCalled();

    fireEvent.click(within(nav).getByText("How it works"));
    expect(spies.how).toHaveBeenCalled();

    fireEvent.click(within(nav).getByText("Meet Donny"));
    expect(spies.donny).toHaveBeenCalled();
  });

  it("routes Log in to /auth?mode=login and Get started to /auth?mode=signup", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Primary" });

    fireEvent.click(within(nav).getByText("Log in"));
    expect(navigateMock).toHaveBeenCalledWith("/auth?mode=login");

    fireEvent.click(within(nav).getByText("Get started"));
    expect(navigateMock).toHaveBeenCalledWith("/auth?mode=signup");
  });
});

describe("Header mobile Sheet menu", () => {
  it("exposes the same four section links plus Log in and Get started once opened", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Toggle menu"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("For businesses")).toBeInTheDocument();
    expect(within(dialog).getByText("For creators")).toBeInTheDocument();
    expect(within(dialog).getByText("How it works")).toBeInTheDocument();
    expect(within(dialog).getByText("Meet Donny")).toBeInTheDocument();
    expect(within(dialog).getByText("Log in")).toBeInTheDocument();
    expect(within(dialog).getByText("Get started")).toBeInTheDocument();
  });

  it("closes the sheet then scrolls to the section after clicking a mobile section link", () => {
    vi.useFakeTimers();
    const spies = stubSections();
    setup();

    fireEvent.click(screen.getByLabelText("Toggle menu"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("How it works"));

    expect(spies.how).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(spies.how).toHaveBeenCalled();
  });

  it("closes the sheet then navigates after clicking mobile Log in / Get started", () => {
    vi.useFakeTimers();
    setup();

    fireEvent.click(screen.getByLabelText("Toggle menu"));
    let dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Log in"));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(navigateMock).toHaveBeenCalledWith("/auth?mode=login");

    fireEvent.click(screen.getByLabelText("Toggle menu"));
    dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Get started"));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(navigateMock).toHaveBeenCalledWith("/auth?mode=signup");
  });
});
