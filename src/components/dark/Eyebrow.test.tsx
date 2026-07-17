// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Eyebrow } from "./Eyebrow";

test("Eyebrow renders its label", () => {
  render(<Eyebrow>How it works</Eyebrow>);
  expect(screen.getByText("How it works")).toBeInTheDocument();
});
