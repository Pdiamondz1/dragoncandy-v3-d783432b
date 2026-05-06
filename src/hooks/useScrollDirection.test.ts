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
});
