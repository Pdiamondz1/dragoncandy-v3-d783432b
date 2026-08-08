// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MatchCardsSkeleton, MatchingProgress } from "./MatchingProgress";
import { MATCHING_STEPS, STEP_MS } from "./matchingSteps";

const states = () =>
  screen.getAllByTestId("matching-step").map((li) => li.getAttribute("data-state"));

describe("MatchingProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("starts with the first step current and the rest pending", () => {
    render(<MatchingProgress />);
    expect(states()).toEqual(["current", "pending", "pending", "pending"]);
    MATCHING_STEPS.forEach((step) => expect(screen.getByText(step)).toBeInTheDocument());
  });

  test("advances one step per tick, marking earlier steps done", () => {
    render(<MatchingProgress />);

    act(() => void vi.advanceTimersByTime(STEP_MS));
    expect(states()).toEqual(["done", "current", "pending", "pending"]);

    act(() => void vi.advanceTimersByTime(STEP_MS));
    expect(states()).toEqual(["done", "done", "current", "pending"]);
  });

  test("holds on the last step rather than claiming a completion it cannot observe", () => {
    render(<MatchingProgress />);
    act(() => void vi.advanceTimersByTime(STEP_MS * (MATCHING_STEPS.length + 5)));
    expect(states()).toEqual(["done", "done", "done", "current"]);
  });

  test("renders placeholder cards so results do not shift the layout in", () => {
    render(<MatchingProgress />);
    expect(screen.getByTestId("match-cards-skeleton")).toBeInTheDocument();
  });
});

test("MatchCardsSkeleton renders the requested number of placeholders", () => {
  const { container } = render(<MatchCardsSkeleton count={3} />);
  expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(3);
  expect(screen.getByTestId("match-cards-skeleton").children).toHaveLength(3);
});
