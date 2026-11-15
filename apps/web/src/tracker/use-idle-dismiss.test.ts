/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEAT_CONTROLS_HIDE_MS,
  useIdleDismiss,
} from './use-idle-dismiss';

describe('useIdleDismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes after the idle window when opened and left alone', () => {
    const onDismiss = vi.fn();
    renderHook(() =>
      useIdleDismiss(true, onDismiss, SEAT_CONTROLS_HIDE_MS),
    );

    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SEAT_CONTROLS_HIDE_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('restarts the idle window on each bump (damage tap)', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useIdleDismiss(true, onDismiss, SEAT_CONTROLS_HIDE_MS),
    );

    act(() => {
      vi.advanceTimersByTime(SEAT_CONTROLS_HIDE_MS - 200);
    });
    act(() => {
      result.current();
    });
    act(() => {
      vi.advanceTimersByTime(SEAT_CONTROLS_HIDE_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss while inactive', () => {
    const onDismiss = vi.fn();
    const { rerender } = renderHook(
      ({ active }) =>
        useIdleDismiss(active, onDismiss, SEAT_CONTROLS_HIDE_MS),
      { initialProps: { active: false } },
    );

    act(() => {
      vi.advanceTimersByTime(SEAT_CONTROLS_HIDE_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    rerender({ active: true });
    act(() => {
      vi.advanceTimersByTime(SEAT_CONTROLS_HIDE_MS);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
