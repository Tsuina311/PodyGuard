import { useEffect } from 'react';
import { io } from 'socket.io-client';
import type { EventSnapshot } from '@podyguard/shared';
import { apiRoot } from './api-base';

export function useEventLive(
  joinCode: string | undefined,
  enabled: boolean,
  onSnapshot: (snapshot: EventSnapshot) => void,
) {
  useEffect(() => {
    if (!joinCode || !enabled) {
      return;
    }
    const remote = apiRoot();
    const options = {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    };
    const socket = remote === '' ? io(options) : io(remote, options);
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
