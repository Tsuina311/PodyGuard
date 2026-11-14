import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  activeMatchDetails,
  activeMatchPath,
  cancelLocalMatch,
} from './active-match';
import { loadMatchConfig, matchPlayers } from './match-config';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

export function OngoingGame({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [path, setPath] = useState(activeMatchPath);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const refresh = () => {
      setPath(activeMatchPath());
      setConfirm(false);
      onChange();
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [onChange]);
  if (!path) return null;
  const local = path === '/match';
  const config = loadMatchConfig();
  const details =
    activeMatchDetails() ??
    (local
      ? {
          format:
            config.rulesFormat === 'commander'
              ? `${config.gameMode} · Commander`
              : config.gameMode,
          players: matchPlayers(config).map((player) => player.name),
          eventName: undefined,
          tableLabel: undefined,
        }
      : null);
  return (
    <section aria-label={t('home.ongoingGame')}>
      <Panel title={t('home.ongoingGame')}>
        <p className="font-semibold capitalize text-ink">
          {details?.format ?? t('home.eventGame')}
        </p>
        <p className="mt-1 text-sm text-muted break-words">
          {local
            ? t('home.localGame')
            : [details?.eventName, details?.tableLabel, path.split('/').pop()]
                .filter(Boolean)
                .join(' · ')}
        </p>
        {details?.players.length ? (
          <p className="mt-2 text-sm text-ink break-words">
            {t('home.gamePlayers', { count: details.players.length })} ·{' '}
            {details.players.join(', ')}
          </p>
        ) : null}
        {confirm ? (
          <div
            className="mt-3 rounded-xl border border-danger/40 p-3"
            role="group"
            aria-label={t('home.cancelGame')}
          >
            <p className="text-sm text-ink">{t('home.cancelGamePrompt')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="glass" onClick={() => setConfirm(false)}>
                {t('home.keepGame')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (activeMatchPath() !== path) {
                    setPath(activeMatchPath());
                    setConfirm(false);
                    onChange();
                    return;
                  }
                  cancelLocalMatch();
                  setPath(activeMatchPath());
                  setConfirm(false);
                  onChange();
                }}
              >
                {t('home.confirmCancelGame')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="neon" onClick={() => void navigate(path)}>
              {t('home.resumeGame')}
            </Button>
            {local ? (
              <Button variant="ghost" onClick={() => setConfirm(true)}>
                {t('home.cancelGame')}
              </Button>
            ) : null}
          </div>
        )}
      </Panel>
    </section>
  );
}
