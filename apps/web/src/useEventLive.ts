import { useEffect } from 'react';
import { io } from 'socket.io-client';
import type { EventSnapshot } from '@podyguard/shared';

export function useEventLive(
  joinCode: string | undefined,
  enabled: boolean,
  onSnapshot: (snapshot: EventSnapshot) => void,
) {
  useEffect(() => {
    if (!joinCode || !enabled) {
      return;
    }
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    const handle = (snapshot: EventSnapshot) => {
      onSnapshot(snapshot);
    };
    socket.on('connect', () => {
      socket.emit('watch', joinCode);
    });
    socket.on('snapshot', handle);
    return () => {
      socket.off('snapshot', handle);
      socket.close();
    };
  }, [joinCode, enabled, onSnapshot]);
}
