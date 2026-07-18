// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AppStatusBadge } from "./AppStatusBadge";
test("AppStatusBadge maps tone to brand classes (never gray)", () => {
  const { rerender } = render(<AppStatusBadge tone="teal">Active</AppStatusBadge>);
  expect(screen.getByText("Active")).toHaveClass("bg-dc-teal/10", "text-dc-teal-btn", "rounded-full");
  rerender(<AppStatusBadge tone="pink">New</AppStatusBadge>);
  expect(screen.getByText("New")).toHaveClass("bg-dc-pink-accent/10", "text-dc-pink-accent");
  rerender(<AppStatusBadge tone="neutral">Draft</AppStatusBadge>);
  expect(screen.getByText("Draft")).toHaveClass("bg-dc-teal/5", "text-dc-text-muted");
});
