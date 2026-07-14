// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollDirection } from './useScrollDirection';

function createScrollContainer(id: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = id;
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true });
  document.body.appendChild(el);
  return el;
}

function setScrollDimensions(el: HTMLDivElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

function fireScroll(el: HTMLDivElement, scrollTop: number) {
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true });
  el.dispatchEvent(new Event('scroll'));
}

describe('useScrollDirection', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createScrollContainer('main-content');
  });

  afterEach(() => {
    container.remove();
  });

  test('returns "up" as initial direction', () => {
    const { result } = renderHook(() => useScrollDirection());
    expect(result.current).toBe('up');
  });

  test('returns "down" after scrolling past threshold', async () => {
    const { result } = renderHook(() => useScrollDirection());

    await act(async () => {
      fireScroll(container, 20);
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(result.current).toBe('down');
  });

  test('returns "up" after scrolling back up past threshold', async () => {
    const { result } = renderHook(() => useScrollDirection());

    await act(async () => {
      fireScroll(container, 50);
      await new Promise((r) => requestAnimationFrame(r));
    });

    await act(async () => {
      fireScroll(container, 20);
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(result.current).toBe('up');
  });

  test('ignores scroll within threshold deadzone', async () => {
    const { result } = renderHook(() => useScrollDirection());

    await act(async () => {
      fireScroll(container, 5);
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(result.current).toBe('up');
  });

  test('returns "up" when scrolled to the bottom, even after scrolling down', async () => {
    setScrollDimensions(container, 1000, 600);
    const { result } = renderHook(() => useScrollDirection());

    // Scroll down mid-page → hidden
    await act(async () => {
      fireScroll(container, 200);
      await new Promise((r) => requestAnimationFrame(r));
    });
    expect(result.current).toBe('down');

    // Land at the very bottom (200 → 400; 400 + 600 = scrollHeight) → nav must reveal
    await act(async () => {
      fireScroll(container, 400);
      await new Promise((r) => requestAnimationFrame(r));
    });
    expect(result.current).toBe('up');
  });

  test('stays "down" when scrolling down far from the bottom', async () => {
    setScrollDimensions(container, 3000, 600);
    const { result } = renderHook(() => useScrollDirection());

    await act(async () => {
      fireScroll(container, 400);
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(result.current).toBe('down');
  });
});
