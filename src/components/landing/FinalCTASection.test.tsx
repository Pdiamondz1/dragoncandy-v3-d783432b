// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FinalCTASection } from "./FinalCTASection";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const mutateMock = vi.fn();

vi.mock("@/hooks/useSubmitLead", () => ({
  useSubmitLead: () => ({ mutate: mutateMock, isPending: false }),
}));

function setup() {
  return render(
    <MemoryRouter>
      <FinalCTASection />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  navigateMock.mockClear();
  mutateMock.mockClear();
});

describe("FinalCTASection", () => {
  it("renders the section head and sub", () => {
    setup();

    expect(
      screen.getByRole("heading", { level: 2, name: "Ready to build together?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Join the platform where real people do the work — and AI makes it fly."),
    ).toBeInTheDocument();
  });

  it("routes the two role CTAs to signup with the right role", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "I run a business" }));
    expect(navigateMock).toHaveBeenCalledWith("/auth?mode=signup&role=business");

    fireEvent.click(screen.getByRole("button", { name: "I'm a creator" }));
    expect(navigateMock).toHaveBeenCalledWith("/auth?mode=signup&role=creator");
  });

  it("shows a validation error and does not submit when the email is invalid", () => {
    setup();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Joe" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("submits with valid name + email", () => {
    setup();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Joe" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "joe@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0][0]).toMatchObject({
      name: "Joe",
      email: "joe@example.com",
      audience: "business",
    });
  });
});
