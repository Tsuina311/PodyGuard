import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { TRANSFER_ID, TRANSFER_TOKEN, shareableTransferDestination, type LinkTransferCredentials, type LinkTransferResult } from '@podyguard/shared';
import { ApiError, request } from '../api';
import { apiRoot } from '../api-base';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { JoinQr } from '../ui/JoinQr';
import { transferQrLink } from './links';

const KEY = 'podyguard.link-transfer.receiver';
function save(value: LinkTransferCredentials | null) {
  try { if (value) sessionStorage.setItem(KEY, JSON.stringify(value)); else sessionStorage.removeItem(KEY); } catch { /* In-memory still works. */ }
}
function restore(): LinkTransferCredentials | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return value && TRANSFER_ID.test(value.id) && TRANSFER_TOKEN.test(value.receiveToken) && TRANSFER_TOKEN.test(value.sendToken) &&
      Date.parse(value.expiresAt) > Date.now() ? value : null;
  } catch { return null; }
}

export function ReceiveLinkPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [session, setSession] = useState(restore);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState('');
  let qr = '';
  try { if (session) qr = transferQrLink(session.id, session.sendToken); } catch { qr = ''; }

  async function start() {
    setBusy(true); setError(''); setExpired(false);
    save(null); setSession(null);
    try {
      const value = await request<LinkTransferCredentials>('/link-transfers', { method: 'POST' });
      transferQrLink(value.id, value.sendToken);
      save(value); setSession(value);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('linkTransfer.failed')); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!session || expired) return;
    const controller = new AbortController();
    let timer = 0, polling = false, finished = false;
    async function poll() {
      if (polling || finished || controller.signal.aborted) return;
      polling = true;
      window.clearTimeout(timer);
      try {
        const result = await request<LinkTransferResult>(`/link-transfers/${session!.id}`, {
          headers: { Authorization: `Bearer ${session!.receiveToken}` }, signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setError('');
        if (result.status === 'ACCEPTED') {
          const destination = shareableTransferDestination(result.destination);
          if (!destination) throw new Error(t('linkTransfer.invalidDestination'));
          finished = true;
          void navigate(destination, { replace: true });
          save(null);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && [404, 410].includes(caught.status)) {
          finished = true; save(null); setExpired(true);
        } else setError(t('linkTransfer.retrying'));
      } finally {
        polling = false;
        if (!finished && !controller.signal.aborted) timer = window.setTimeout(() => void poll(), 2000);
      }
    }
    const remote = apiRoot();
    const options = { path: '/socket.io', transports: ['websocket', 'polling'], tryAllTransports: true };
    const socket = remote ? io(remote, options) : io(options);
    socket.on('connect', () => { socket.emit('watch-link-transfer', { id: session.id, receiveToken: session.receiveToken }); void poll(); });
    socket.on('link-transfer-ready', () => void poll());
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); socket.close(); };
  }, [session, expired, navigate, t]);

  return <Panel title={t('linkTransfer.receiveTitle')}>
    <p className="mb-3 text-sm text-muted">{t('linkTransfer.receiveHint')}</p>
    {session && !expired && qr && <div className="mb-3 flex flex-col items-center gap-3">
      <JoinQr value={qr} size={200} title={t('linkTransfer.qrTitle')} />
      <p role="status" className="text-sm text-muted">{t('linkTransfer.waiting')}</p>
    </div>}
    {expired && <p role="status" className="mb-3 text-sm text-warning">{t('linkTransfer.expired')}</p>}
    <Button disabled={busy} onClick={() => void start()}>{t(session ? 'linkTransfer.newQr' : 'linkTransfer.connectQr')}</Button>
    {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
  </Panel>;
}
