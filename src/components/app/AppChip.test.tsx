// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppChip } from "./AppChip";
test("AppChip toggles style by active + fires onClick", () => {
  const onClick = vi.fn();
  const { rerender } = render(<AppChip onClick={onClick}>All</AppChip>);
  const btn = screen.getByRole("button", { name: "All" });
  expect(btn).toHaveClass("bg-white", "border-dc-teal/20", "text-dc-text-muted", "rounded-full");
  fireEvent.click(btn); expect(onClick).toHaveBeenCalled();
  rerender(<AppChip active>All</AppChip>);
  expect(screen.getByRole("button", { name: "All" })).toHaveClass("bg-dc-teal/10", "border-dc-teal", "text-dc-teal-btn");
});
