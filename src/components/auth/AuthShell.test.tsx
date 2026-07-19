// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AuthShell } from "./AuthShell";

afterEach(() => cleanup());

describe("AuthShell", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <AuthShell>
        <p>hello world</p>
      </AuthShell>
    );
    expect(getByText("hello world")).toBeTruthy();
  });

  it("is a light container — no dark class, uses a light bg", () => {
    const { container } = render(
      <AuthShell>
        <p>content</p>
      </AuthShell>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("bg-white");
    expect(root.className).not.toContain("dark");
    expect(root.className).not.toContain("bg-dc-dark");
  });

  it("does not add the dark class to the document root", () => {
    render(
      <AuthShell>
        <p>content</p>
      </AuthShell>
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("renders the glow behind the content via an isolate stacking context (no shrink-wrap slot)", () => {
    const { container, getByText } = render(
      <AuthShell>
        <p>content</p>
      </AuthShell>
    );
    const root = container.firstElementChild as HTMLElement;
    // Root owns a stacking context so the -z-10 glow paints behind the content...
    expect(root.className).toContain("isolate");
    const glow = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(glow.className).toContain("-z-10");
    // ...and children render DIRECTLY on the root (not wrapped in an extra flex-item slot),
    // so a centered caller's `w-full max-w-*` card fills its intended width.
    expect(getByText("content").parentElement).toBe(root);
  });

  it("renders an aria-hidden glow backdrop", () => {
    const { container } = render(
      <AuthShell>
        <p>content</p>
      </AuthShell>
    );
    const glow = container.querySelector('[aria-hidden="true"]');
    expect(glow).toBeTruthy();
    expect(glow!.className).toContain("pointer-events-none");
  });

  it("merges a caller-provided className onto the root", () => {
    const { container } = render(
      <AuthShell className="custom-class">
        <p>content</p>
      </AuthShell>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("custom-class");
  });
});
