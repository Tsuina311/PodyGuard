// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSnapshot } from '@podyguard/shared';
const { sockets, io } = vi.hoisted(() => {
  const sockets: Array<{
    active: boolean;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    fire: (name: string, value?: unknown) => void;
    listeners: Map<string, Set<(v: unknown) => void>>;
  }> = [];
  const io = vi.fn(() => {
    const listeners = new Map<string, Set<(v: unknown) => void>>();
    const socket = {
      active: true,
      listeners,
      on: vi.fn((name: string, fn: (v: unknown) => void) => {
        const all = listeners.get(name) ?? new Set();
        all.add(fn);
        listeners.set(name, all);
      }),
      off: vi.fn((name: string, fn: (v: unknown) => void) =>
        listeners.get(name)?.delete(fn),
      ),
      emit: vi.fn(),
      close: vi.fn(),
      fire: (name: string, value?: unknown) =>
        listeners.get(name)?.forEach((fn) => fn(value)),
    };
    sockets.push(socket);
    return socket;
  });
  return { sockets, io };
});
vi.mock('socket.io-client', () => ({ io }));
vi.mock('./api-base', () => ({ apiRoot: () => '' }));
import { useEventLive } from './useEventLive';
afterEach(() => {
  cleanup();
  sockets.length = 0;
  vi.clearAllMocks();
});
describe('event connection recovery', () => {
  it('rejoins after reconnect and keeps transport failures separate from player identity', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useEventLive('FRIEND', true, callback));
    const socket = sockets[0]!;
    act(() => socket.fire('connect'));
    expect(result.current).toBe('connected');
    expect(socket.emit).toHaveBeenLastCalledWith('watch', 'FRIEND');
    act(() => socket.fire('disconnect', 'transport close'));
    expect(result.current).toBe('reconnecting');
    act(() => socket.fire('connect'));
    expect(socket.emit).toHaveBeenCalledTimes(2);
    const state = { event: { joinCode: 'FRIEND' } } as EventSnapshot;
    act(() => socket.fire('snapshot', state));
    expect(callback).toHaveBeenCalledWith(state);
    socket.active = false;
    act(() => socket.fire('connect_error', new Error('blocked')));
    expect(result.current).toBe('failed');
    expect(io).toHaveBeenCalledWith(
      expect.objectContaining({
        transports: ['websocket', 'polling'],
        tryAllTransports: true,
      }),
    );
  });
  it('removes listeners on event changes and explicit retries', () => {
    const callback = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ code, nonce }) => useEventLive(code, true, callback, nonce),
      { initialProps: { code: 'FIRST', nonce: 0 } },
    );
    const first = sockets[0]!;
    rerender({ code: 'SECOND', nonce: 0 });
    act(() => first.fire('snapshot', {}));
    expect(callback).not.toHaveBeenCalled();
    expect(first.close).toHaveBeenCalledOnce();
    rerender({ code: 'SECOND', nonce: 1 });
    expect(sockets[1]?.close).toHaveBeenCalledOnce();
    unmount();
    expect(sockets[2]?.close).toHaveBeenCalledOnce();
  });
  it('does not open a connection while disabled', () => {
    const { result } = renderHook(() => useEventLive('FRIEND', false, vi.fn()));
    expect(result.current).toBe('idle');
    expect(io).not.toHaveBeenCalled();
  });
});
