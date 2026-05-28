// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInactivityTimeout } from './useInactivityTimeout';

const IDLE_WARNING_MS = 165 * 60 * 1000;
const IDLE_LOGOUT_MS = 180 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = 'dc_last_activity';

describe('useInactivityTimeout', () => {
  let onLogout: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    onLogout = vi.fn<() => void>();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes dc_last_activity in localStorage on mount', () => {
    renderHook(() => useInactivityTimeout(onLogout, true));
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(0);
  });

  it('does not set timers when disabled', () => {
    renderHook(() => useInactivityTimeout(onLogout, false));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('shows warning after 165 minutes of inactivity', () => {
    const { result } = renderHook(() => useInactivityTimeout(onLogout, true));
    expect(result.current.showWarning).toBe(false);

    const pastTimestamp = Date.now() - IDLE_WARNING_MS - 1000;
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));

    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS); });
    expect(result.current.showWarning).toBe(true);
  });

  it('triggers logout after 180 minutes of inactivity', () => {
    renderHook(() => useInactivityTimeout(onLogout, true));

    const pastTimestamp = Date.now() - IDLE_LOGOUT_MS - 1000;
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));

    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS); });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not trigger logout between 165-180 minutes (warning only)', () => {
    const { result } = renderHook(() => useInactivityTimeout(onLogout, true));

    const pastTimestamp = Date.now() - (170 * 60 * 1000);
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));

    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS); });
    expect(result.current.showWarning).toBe(true);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('confirmActive resets the timestamp and hides warning', () => {
    const { result } = renderHook(() => useInactivityTimeout(onLogout, true));

    const pastTimestamp = Date.now() - IDLE_WARNING_MS - 1000;
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));
    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS); });
    expect(result.current.showWarning).toBe(true);

    act(() => { result.current.confirmActive(); });
    expect(result.current.showWarning).toBe(false);

    const stored = Number(localStorage.getItem(STORAGE_KEY));
    expect(Date.now() - stored).toBeLessThan(5000);
  });

  it('checks immediately on visibilitychange to visible', () => {
    const { result } = renderHook(() => useInactivityTimeout(onLogout, true));

    const pastTimestamp = Date.now() - IDLE_WARNING_MS - 1000;
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.showWarning).toBe(true);
  });

  it('updates localStorage on activity events when warning is not showing', () => {
    renderHook(() => useInactivityTimeout(onLogout, true));

    const beforeActivity = Date.now();
    act(() => { window.dispatchEvent(new Event('mousedown')); });
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    expect(stored).toBeGreaterThanOrEqual(beforeActivity);
  });
});
