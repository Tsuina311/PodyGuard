import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { checkHealth } from './api';
import { apiRoot } from './api-base';
import { probeDurableStorage } from './device-storage';
import { getSessionDiagnosticId } from './join-diagnostics';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import { ThemeToggleCorner } from './ui/ThemeToggle';

type CheckState = 'pending' | 'ok' | 'fail' | 'skip';

type ConnectivityReport = {
  application: CheckState;
  javascript: CheckState;
  api: CheckState;
  polling: CheckState;
  websocket: CheckState;
  storage: CheckState;
  apiDetail?: string;
  pollingDetail?: string;
  websocketDetail?: string;
};

const INITIAL: ConnectivityReport = {
  application: 'ok',
  javascript: 'ok',
  api: 'pending',
  polling: 'pending',
  websocket: 'pending',
  storage: 'pending',
};

function label(state: CheckState): string {
  switch (state) {
    case 'ok':
      return 'OK';
    case 'fail':
      return 'FAILED';
    case 'skip':
      return 'SKIPPED';
    default:
      return 'testing…';
  }
}

function tone(state: CheckState): string {
  switch (state) {
    case 'ok':
      return 'text-neon';
    case 'fail':
      return 'text-warning';
    default:
      return 'text-muted';
  }
}

async function probePolling(): Promise<{ ok: boolean; detail: string }> {
  const root = apiRoot();
  const base = root === '' ? window.location.origin : root;
  const url = `${base.replace(/\/$/, '')}/socket.io/?EIO=4&transport=polling`;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return { ok: false, detail: `HTTP ${String(response.status)}` };
    }
    const body = await response.text();
    // Engine.IO open packet starts with "0{"
    if (!body.startsWith('0')) {
      return { ok: false, detail: 'unexpected handshake' };
    }
    return { ok: true, detail: 'Engine.IO open' };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 80) : 'network',
    };
  }
}

function probeWebsocket(): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const remote = apiRoot();
    const options = {
      path: '/socket.io',
      transports: ['websocket'] as string[],
      reconnection: false,
      timeout: 8_000,
    };
    const socket = remote === '' ? io(options) : io(remote, options);
    const finish = (ok: boolean, detail: string) => {
      socket.close();
      resolve({ ok, detail });
    };
    const timer = window.setTimeout(() => {
      finish(false, 'timeout');
    }, 9_000);
    socket.on('connect', () => {
      window.clearTimeout(timer);
      finish(true, 'websocket connected');
    });
    socket.on('connect_error', (error) => {
      window.clearTimeout(timer);
      finish(false, error.message.slice(0, 80));
    });
  });
}

export function ConnectivityPage() {
  const { t } = useTranslation();
  const [report, setReport] = useState<ConnectivityReport>(INITIAL);
  const [running, setRunning] = useState(false);
  const diagnosticId = getSessionDiagnosticId();

  const run = useCallback(async () => {
    setRunning(true);
    setReport({
      ...INITIAL,
      storage: probeDurableStorage() === 'ok' ? 'ok' : 'fail',
    });

    const apiOk = await checkHealth();
    setReport((current) => ({
      ...current,
      api: apiOk ? 'ok' : 'fail',
      apiDetail: apiOk ? undefined : 'health not ok',
    }));

    const polling = await probePolling();
    setReport((current) => ({
      ...current,
      polling: polling.ok ? 'ok' : 'fail',
      pollingDetail: polling.detail,
    }));

    const websocket = await probeWebsocket();
    setReport((current) => ({
      ...current,
      websocket: websocket.ok ? 'ok' : 'fail',
      websocketDetail: websocket.detail,
    }));
    setRunning(false);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const rows: Array<{
    name: string;
    state: CheckState;
    detail?: string;
  }> = [
    { name: 'Application', state: report.application },
    { name: 'JavaScript', state: report.javascript },
    { name: 'API', state: report.api, detail: report.apiDetail },
    {
      name: 'Realtime polling',
      state: report.polling,
      detail: report.pollingDetail,
    },
    {
      name: 'Realtime websocket',
      state: report.websocket,
      detail: report.websocketDetail,
    },
    {
      name: 'Storage',
      state: report.storage,
      detail:
        report.storage === 'fail'
          ? 'localStorage unavailable — join still works'
          : undefined,
    },
  ];

  return (
    <>
      <ThemeToggleCorner />
      <Brand className="mb-6" />
      <Panel title={t('connectivity.title')} aside={t('connectivity.aside')}>
        <p className="text-muted mb-4 text-sm">{t('connectivity.hint')}</p>
        <ul className="mb-5 space-y-2">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex items-baseline justify-between gap-3 border-b border-white/5 py-2 text-sm"
            >
              <span>{row.name}</span>
              <span className={`shrink-0 font-mono text-xs ${tone(row.state)}`}>
                {label(row.state)}
                {row.detail ? (
                  <span className="text-muted ml-2 font-sans">{row.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <dl className="text-muted mb-5 space-y-1 font-mono text-xs">
          <div className="flex justify-between gap-3">
            <dt>{t('connectivity.appVersion')}</dt>
            <dd>v{__APP_VERSION__}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>{t('connectivity.build')}</dt>
            <dd>{__APP_BUILD__}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>{t('connectivity.diagnosticId')}</dt>
            <dd>{diagnosticId}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="neon"
            size="sm"
            disabled={running}
            onClick={() => void run()}
          >
            {t('connectivity.retry')}
          </Button>
          <Link className="text-neon self-center text-sm hover:underline" to="/">
            {t('common.home')}
          </Link>
        </div>
      </Panel>
    </>
  );
}
