// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PageBody } from "./PageBody";
test("PageBody renders children and applies the maxWidth class", () => {
  const { container } = render(<PageBody maxWidth="4xl"><p>hi</p></PageBody>);
  expect(screen.getByText("hi")).toBeInTheDocument();
  expect(container.firstChild).toHaveClass("max-w-4xl", "mx-auto", "space-y-8");
});
