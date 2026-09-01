import { useEffect } from 'react';
import { io } from 'socket.io-client';
import type { PublicDisplayEventState } from '@podyguard/shared';
import { apiRoot } from './api-base';

export function useDisplayLive(
  token: string | undefined,
  enabled: boolean,
  onSnapshot: (state: PublicDisplayEventState) => void,
  onUnauthorized?: () => void,
  onConnectionChange?: (connected: boolean) => void,
) {
  useEffect(() => {
    if (!token || !enabled) {
      return;
    }
    const remote = apiRoot();
    const options = {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    };
    const socket = remote === '' ? io(options) : io(remote, options);

    const handleSnapshot = (state: PublicDisplayEventState) => {
      onSnapshot(state);
    };
    const handleUnauthorized = () => {
      onUnauthorized?.();
    };
    const emitWatch = () => {
      socket.emit('watch-display', token);
    };

    socket.on('connect', () => {
      onConnectionChange?.(true);
      emitWatch();
    });
    socket.on('disconnect', () => {
      onConnectionChange?.(false);
    });
    socket.on('display-snapshot', handleSnapshot);
    socket.on('display-unauthorized', handleUnauthorized);

    return () => {
      socket.off('display-snapshot', handleSnapshot);
      socket.off('display-unauthorized', handleUnauthorized);
      socket.close();
    };
  }, [token, enabled, onSnapshot, onUnauthorized, onConnectionChange]);
}
