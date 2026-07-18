// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AppCard } from "./AppCard";
test("AppCard: default border + pad, emphasis + inset variants", () => {
  const { rerender, container } = render(<AppCard>x</AppCard>);
  expect(container.firstChild).toHaveClass("border-dc-teal/15", "bg-white", "rounded-2xl", "p-5");
  rerender(<AppCard variant="emphasis" pad="6">x</AppCard>);
  expect(container.firstChild).toHaveClass("border-2", "border-dc-teal", "p-6");
  rerender(<AppCard variant="inset">x</AppCard>);
  expect(container.firstChild).toHaveClass("bg-dc-teal/[0.04]", "rounded-xl");
  expect(screen.getByText("x")).toBeInTheDocument();
});
