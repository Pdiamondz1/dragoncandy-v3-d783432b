// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppVersion } from './useAppVersion';

const VERSION_POLL_MS = 5 * 60 * 1000;

describe('useAppVersion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns updateAvailable=false in dev mode', () => {
    vi.stubEnv('PROD', false);
    const { result } = renderHook(() => useAppVersion());
    expect(result.current.updateAvailable).toBe(false);
  });

  it('fetches version.json on mount in prod mode', () => {
    vi.stubEnv('PROD', true);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hash: 'abc123', built: '2026-05-28T00:00:00Z' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    renderHook(() => useAppVersion());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toMatch(/^\/version\.json\?_t=\d+$/);
  });

  it('sets updateAvailable when hash changes', async () => {
    vi.stubEnv('PROD', true);
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      const hash = callCount === 1 ? 'initial-hash' : 'new-hash';
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hash, built: '2026-05-28T00:00:00Z' }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAppVersion());

    await act(async () => { await vi.runAllTimersAsync(); });
    expect(result.current.updateAvailable).toBe(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(VERSION_POLL_MS); });
    expect(result.current.updateAvailable).toBe(true);
  });

  it('stays false when hash is unchanged', async () => {
    vi.stubEnv('PROD', true);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hash: 'same-hash', built: '2026-05-28T00:00:00Z' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAppVersion());

    await act(async () => { await vi.runAllTimersAsync(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(VERSION_POLL_MS); });
    expect(result.current.updateAvailable).toBe(false);
  });

  it('silently ignores fetch failures', async () => {
    vi.stubEnv('PROD', true);
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAppVersion());

    await act(async () => { await vi.runAllTimersAsync(); });
    expect(result.current.updateAvailable).toBe(false);
  });
});
