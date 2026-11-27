import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ApiError,
  beginDisplayPairing,
  claimDisplayToken,
  pollDisplayPairing,
  saveDisplayToken,
} from '../api';
import { isJoinCodeFormat, normalizeJoinCode } from '@podyguard/shared';
import { Field } from '../ui/Field';
import { Brand } from '../ui/Brand';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { ReceiveLinkPanel } from '../link-transfer/ReceiveLinkPanel';

export const managedDisplayPairPath = '/display?managed=1';

export function DisplayPairPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const [eventCode, setEventCode] = useState('');
  const code = normalizeJoinCode(eventCode);

  if (query.get('managed') === '1') return <ManagedDisplayPairing />;

  return (
    <div className="flex min-h-[70vh] flex-col justify-center gap-4">
      <header>
        <Brand className="mb-6" />
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {t('eventMonitor.title')}
        </h1>
      </header>
      <Panel onSubmit={event => {
        event.preventDefault();
        if (isJoinCodeFormat(code)) void navigate(`/display/event/${code}`);
      }}>
        <p className="mb-4 text-sm text-muted">{t('eventMonitor.enterInstructions')}</p>
        <Field label={t('eventMonitor.code')} value={eventCode} autoCapitalize="characters"
          autoComplete="off" spellCheck={false} className="font-mono text-lg tracking-widest uppercase"
          onChange={event => setEventCode(event.target.value)} />
        <Button type="submit" variant="neon" disabled={!isJoinCodeFormat(code)}>
          {t('eventMonitor.open')}
        </Button>
      </Panel>
      <details className="rounded-2xl border border-muted/25 px-4">
        <summary className="cursor-pointer py-3 text-sm font-semibold text-muted">
          {t('eventMonitor.moreOptions')}
        </summary>
        <div className="space-y-3 pb-4">
          <ReceiveLinkPanel />
          <Link className="inline-flex min-h-11 items-center text-neon underline" to={managedDisplayPairPath}>
            {t('host.displaysPairLink')}
          </Link>
        </div>
      </details>
      <Link className="self-start text-xs text-muted hover:text-ink" to="/">{t('common.home')}</Link>
    </div>
  );
}

function ManagedDisplayPairing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startPairing = useCallback(async () => {
    setBusy(true);
    setError(null);
    setExpired(false);
    setPairingCode(null);
    setSessionId(null);
    try {
      const pairing = await beginDisplayPairing();
      setSessionId(pairing.sessionId);
      setPairingCode(pairing.pairingCode);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('display.pairFailed'),
      );
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void startPairing();
  }, [startPairing]);

  useEffect(() => {
    if (!sessionId || expired) {
      return;
    }
    let cancelled = false;
    let claiming = false;

    const poll = async () => {
      if (cancelled || claiming) {
        return;
      }
      try {
        const result = await pollDisplayPairing(sessionId);
        if (cancelled) {
          return;
        }
        if (result.status === 'EXPIRED' || result.status === 'REVOKED') {
          setExpired(true);
          return;
        }
        if (result.status === 'ACTIVE') {
          claiming = true;
          try {
            const claimed = await claimDisplayToken(sessionId);
            if (cancelled) {
              return;
            }
            saveDisplayToken(claimed.token, sessionId);
            navigate('/display/live', { replace: true });
          } catch (caught) {
            if (!cancelled) {
              setError(
                caught instanceof ApiError
                  ? caught.message
                  : t('display.claimFailed'),
              );
              setExpired(true);
            }
          }
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : t('display.pollFailed'),
          );
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, expired, navigate, t]);

  return (
    <div className="flex min-h-[70vh] flex-col justify-center gap-8">
      <header>
        <Brand className="mb-6" />
        <h1 className="font-display mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {t('display.pairTitle')}
        </h1>
        <p className="text-muted max-w-xl text-sm sm:text-base">
          {t('display.pairHint')}
        </p>
      </header>

      <Panel
        title={t('display.pairingCode')}
        aside={expired ? t('display.expired') : t('display.waiting')}
      >
        {pairingCode && !expired ? (
          <>
            <p
              className="font-display text-neon mb-4 text-center text-5xl font-bold tracking-[0.28em] drop-shadow-[0_0_22px_var(--color-neon)] sm:text-7xl"
              aria-live="polite"
            >
              {pairingCode}
            </p>
            <p className="text-muted text-center text-sm">
              {t('display.waitingApproval')}
            </p>
          </>
        ) : expired ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <p className="text-muted text-center text-sm">
              {t('display.expiredHint')}
            </p>
            <Button
              variant="neon"
              disabled={busy}
              onClick={() => void startPairing()}
            >
              {busy ? t('common.working') : t('display.retryPair')}
            </Button>
          </div>
        ) : (
          <p className="text-muted text-center text-sm">
            {busy ? t('common.loading') : t('display.starting')}
          </p>
        )}
      </Panel>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <p className="text-muted/70 text-xs">
        <Link className="hover:text-ink" to="/display">
          {t('eventMonitor.title')}
        </Link>
      </p>
    </div>
  );
}
