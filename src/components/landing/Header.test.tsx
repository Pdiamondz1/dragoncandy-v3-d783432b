// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Header } from "./Header";

afterEach(() => {
  cleanup();
  document.body.innerHTML = ""; // drop any manually-appended #main-content between tests
});

/**
 * The landing renders inside the app shell's scrolling `<main id="main-content">`
 * (App.tsx: `flex h-screen` shell + inner `overflow-auto` main), so the WINDOW never
 * scrolls — the header's scroll-aware background must key off that container, not
 * `window.scrollY` (which stays 0 forever and leaves the header transparent over
 * bright content). This mirrors that shell so the header sees a real scroll source.
 */
function setup(initialScrollTop = 0) {
  let scrollTop = initialScrollTop;
  const main = document.createElement("main");
  main.id = "main-content";
  Object.defineProperty(main, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
  });
  document.body.appendChild(main);

  const utils = render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
    { container: main },
  );

  const header = main.querySelector("header")!;
  const scrollTo = (value: number) => {
    scrollTop = value;
    act(() => {
      main.dispatchEvent(new Event("scroll"));
    });
  };
  return { header, scrollTo, ...utils };
}

describe("Header scroll-aware background", () => {
  it("is transparent while at the top of the scroll container", () => {
    const { header } = setup(0);
    expect(header.className).toContain("bg-transparent");
    expect(header.className).not.toContain("bg-white/80");
  });

  it("switches to the light blurred background once #main-content scrolls past the threshold", () => {
    const { header, scrollTo } = setup(0);
    expect(header.className).toContain("bg-transparent");

    scrollTo(100);

    expect(header.className).toContain("bg-white/80");
    expect(header.className).toContain("backdrop-blur-xl");
    expect(header.className).not.toContain("bg-transparent");
  });
});

describe("Header scroll pass-through", () => {
  // The fixed header must not eat scroll at the top: pointer-events pass through the header
  // to the content (native scroll), and wheel over the interactive bits forwards to the scroller.
  it("disables pointer events on the header but keeps the interactive bits enabled", () => {
    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(container.querySelector("header")!.className).toContain("pointer-events-none");
    expect(container.querySelector("img")!.className).toContain("pointer-events-auto");
    expect(container.querySelector("nav")!.className).toContain("pointer-events-auto");
  });

  it("forwards a wheel over the nav to the #main-content scroller", () => {
    let scrollTop = 0;
    const main = document.createElement("main");
    main.id = "main-content";
    Object.defineProperty(main, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });
    document.body.appendChild(main);

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    fireEvent.wheel(container.querySelector("nav")!, { deltaY: 150 });
    expect(scrollTop).toBe(150);
  });
});
