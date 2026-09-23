/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMANDER_DAMAGE_IDLE_CLOSE_MS,
  SEAT_CONTROLS_HIDE_MS,
  useIdleDismiss,
} from './use-idle-dismiss';

describe('commander / seat chrome timing', () => {
  it('hides the damage sheet and dial chrome after the same few seconds', () => {
    expect(COMMANDER_DAMAGE_IDLE_CLOSE_MS).toBe(4000);
    expect(SEAT_CONTROLS_HIDE_MS).toBe(4000);
  });
});

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
      useIdleDismiss(true, onDismiss, COMMANDER_DAMAGE_IDLE_CLOSE_MS),
    );

    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(COMMANDER_DAMAGE_IDLE_CLOSE_MS - 1);
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
      useIdleDismiss(true, onDismiss, COMMANDER_DAMAGE_IDLE_CLOSE_MS),
    );

    act(() => {
      vi.advanceTimersByTime(COMMANDER_DAMAGE_IDLE_CLOSE_MS - 200);
    });
    act(() => {
      result.current();
    });
    act(() => {
      vi.advanceTimersByTime(COMMANDER_DAMAGE_IDLE_CLOSE_MS - 1);
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
        useIdleDismiss(active, onDismiss, COMMANDER_DAMAGE_IDLE_CLOSE_MS),
      { initialProps: { active: false } },
    );

    act(() => {
      vi.advanceTimersByTime(COMMANDER_DAMAGE_IDLE_CLOSE_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    rerender({ active: true });
    act(() => {
      vi.advanceTimersByTime(COMMANDER_DAMAGE_IDLE_CLOSE_MS);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
