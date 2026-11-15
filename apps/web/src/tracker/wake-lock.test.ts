/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWakeLock } from './wake-lock';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mockLock() {
  let released = false;
  let callback = () => undefined as void;
  return {
    get released() {
      return released;
    },
    release: vi.fn(async () => {
      released = true;
      callback();
    }),
    addEventListener: vi.fn((_type: string, fn: () => void) => {
      callback = fn;
    }),
  };
}
it('reacquires after an unexpected release while visible and releases on unmount', async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const first = mockLock();
  const second = mockLock();
  const request = vi
    .fn()
    .mockResolvedValueOnce(first)
    .mockResolvedValue(second);
  vi.stubGlobal('navigator', { wakeLock: { request } });
  const { result, unmount } = renderHook(() => useWakeLock(true));
  await act(async () => {});
  expect(result.current.status).toBe('active');
  await act(async () => {
    await first.release();
    vi.advanceTimersByTime(1000);
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe('active');
  unmount();
  expect(second.release).toHaveBeenCalledOnce();
});
it('retries a denial after user interaction without multiplying active locks', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('denied'))
    .mockResolvedValue(mockLock());
  vi.stubGlobal('navigator', { wakeLock: { request } });
  const { result } = renderHook(() => useWakeLock(true));
  await act(async () => {});
  expect(result.current.status).toBe('unavailable');
  await act(async () => {
    document.dispatchEvent(new Event('pointerup'));
  });
  expect(result.current.status).toBe('active');
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(request).toHaveBeenCalledTimes(2);
});
it('releases a request that completes after the tracker has unmounted', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  let resolve!: (lock: ReturnType<typeof mockLock>) => void;
  vi.stubGlobal('navigator', {
    wakeLock: {
      request: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  });
  const { unmount } = renderHook(() => useWakeLock(true));
  unmount();
  const lock = mockLock();
  await act(async () => {
    resolve(lock);
  });
  expect(lock.release).toHaveBeenCalledOnce();
});
