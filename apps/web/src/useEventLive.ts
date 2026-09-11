import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { EventSnapshot } from '@podyguard/shared';
import { apiRoot } from './api-base';
import { recordJoinBreadcrumb } from './join-diagnostics';

export type EventLiveStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

/**
 * Live event snapshots. Keeps websocket + polling fallback. Connection trouble
 * is reported via status — it must not eject a player who already joined over HTTP.
 */
export function useEventLive(
  joinCode: string | undefined,
  enabled: boolean,
  onSnapshot: (snapshot: EventSnapshot) => void,
  reconnectNonce = 0,
): EventLiveStatus {
  const [status, setStatus] = useState<EventLiveStatus>('idle');

  useEffect(() => {
    if (!joinCode || !enabled) {
      setStatus('idle');
      return;
    }
    const remote = apiRoot();
    const options = {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    };
    const socket = remote === '' ? io(options) : io(remote, options);
    setStatus('connecting');
    recordJoinBreadcrumb('SOCKET_CONNECT_STARTED');

    const handle = (snapshot: EventSnapshot) => {
      onSnapshot(snapshot);
    };
    const onConnect = () => {
      setStatus('connected');
      recordJoinBreadcrumb('SOCKET_CONNECTED');
      socket.emit('watch', joinCode);
    };
    const onDisconnect = (reason: string) => {
      setStatus(socket.active ? 'reconnecting' : 'failed');
      if (!socket.active) {
        recordJoinBreadcrumb('SOCKET_FAILED', reason.slice(0, 80));
      }
    };
    const onConnectError = (error: Error) => {
      setStatus(socket.active ? 'reconnecting' : 'failed');
      recordJoinBreadcrumb('SOCKET_FAILED', error.message.slice(0, 80));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('snapshot', handle);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('snapshot', handle);
      socket.close();
      setStatus('idle');
    };
  }, [joinCode, enabled, onSnapshot, reconnectNonce]);

  return status;
}
