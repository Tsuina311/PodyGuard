import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TRANSFER_ID, TRANSFER_TOKEN } from '@podyguard/shared';
import { request } from '../api';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Panel } from '../ui/Panel';
import { QrScannerDialog } from '../ui/QrScannerDialog';
import { destinationFromInput, transferFromScan } from './links';

async function send(id: string, sendToken: string, destination: string) {
  return request<{ accepted: boolean }>(`/link-transfers/${id}`, {
    method: 'POST', headers: { Authorization: `Bearer ${sendToken}` }, body: JSON.stringify({ destination }),
  });
}

export function SendToScreenButton({ destination }: { destination: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), [camera, setCamera] = useState(false);
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  if (!destination) return null;
  async function submit(raw: string) {
    const session = transferFromScan(raw);
    if (!session || !destination) { setMessage(t('linkTransfer.invalidQr')); return; }
    setBusy(true); setMessage(''); setCamera(false);
    try {
      const result = await send(session.id, session.sendToken, destination);
      setMessage(t(result.accepted ? 'linkTransfer.sent' : 'linkTransfer.alreadySent'));
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : t('linkTransfer.failed')); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="glass" onClick={() => { setOpen(true); setMessage(''); }}>{t('linkTransfer.sendTitle')}</Button>
    {open && createPortal(<div role="dialog" aria-modal="true" aria-label={t('linkTransfer.sendTitle')} onKeyDown={event => {
      if (event.key === 'Escape') { setOpen(false); setCamera(false); }
    }} className="fixed inset-0 z-[70] flex items-center justify-center overflow-auto bg-void/95 p-4">
      <div className="w-full max-w-md rounded-2xl border border-muted/25 bg-hull p-5">
        <h2 className="font-display mb-2 text-xl font-bold">{t('linkTransfer.sendTitle')}</h2>
        <p className="mb-4 text-sm text-muted">{t('linkTransfer.sendHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => setCamera(true)}>{t('linkTransfer.scan')}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { setOpen(false); setCamera(false); }}>{t('common.close')}</Button>
        </div>
        <form className="mt-4" onSubmit={event => { event.preventDefault(); void submit(code); }}>
          <Field label={t('linkTransfer.pasteQr')} value={code} onChange={event => setCode(event.target.value)} autoComplete="off" />
          <Button type="submit" disabled={busy || !code.trim()}>{t('linkTransfer.send')}</Button>
        </form>
        {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      </div>
    </div>, document.body)}
    {camera && createPortal(<QrScannerDialog onDetect={raw => void submit(raw)} onClose={() => setCamera(false)}
      parse={raw => transferFromScan(raw) ? raw : null} title={t('linkTransfer.scan')} hint={t('linkTransfer.sendHint')}
      invalidCodeHint={t('linkTransfer.invalidQr')} cameraErrorHint={t('linkTransfer.cameraUnavailable')} />, document.body)}
  </>;
}

/** Native-camera landing: select an existing share link or the public event code. */
export function SendToScreenPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [query] = useSearchParams();
  const token = query.get('send') ?? '';
  const valid = TRANSFER_ID.test(id) && TRANSFER_TOKEN.test(token) && query.getAll('send').length === 1 &&
    [...query.keys()].every(key => key === 'send');
  const [value, setValue] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const destination = destinationFromInput(value);
  return <Panel title={t('linkTransfer.sendTitle')} onSubmit={event => {
    event.preventDefault();
    if (!valid || !destination || busy) return;
    setBusy(true); setMessage('');
    void send(id, token, destination).then(result => setMessage(t(result.accepted ? 'linkTransfer.sent' : 'linkTransfer.alreadySent')))
      .catch(caught => setMessage(caught instanceof Error ? caught.message : t('linkTransfer.failed'))).finally(() => setBusy(false));
  }}>
    <p className="mb-4 text-sm text-muted">{t(valid ? 'linkTransfer.chooseLink' : 'linkTransfer.invalidQr')}</p>
    <Field label={t('linkTransfer.destination')} value={value} onChange={event => setValue(event.target.value)} autoComplete="off" />
    <Button type="submit" disabled={!valid || !destination || busy}>{t('linkTransfer.send')}</Button>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </Panel>;
}
