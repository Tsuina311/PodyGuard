import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  EventMetrics,
  PublicEvent,
  PublicParticipant,
  PublicTable,
} from '@podyguard/shared';
import {
  ASSASSIN_POD_SIZES,
  poolShortLabel,
  TREACHERY_POD_SIZES,
  usesCommanderRules,
} from '@podyguard/shared';
import { countByStatus, queueByWait } from './match-view';
import {
  ApiError,
  fillTablesWithBots,
  getEventMetrics,
  listParticipants,
  listTables,
  loadHostToken,
  matchNow,
  saveHostToken,
  setTableStatus,
  startTable,
  finishTable,
  cancelTable,
  updateMatchSettings,
  unlockHost,
  verifyHostToken,
} from './api';
import {
  isLocalHostname,
  joinLinkParts,
  lanHostFromBuild,
  playerJoinUrl,
} from './join-url';
import { Badge, statusTone } from './ui/Badge';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { JoinQr } from './ui/JoinQr';
import { Panel } from './ui/Panel';
import { ThemeToggleCorner } from './ui/ThemeToggle';
import { WaitTime } from './ui/WaitTime';
import { useEventLive } from './useEventLive';
import { ChallengePackEditor } from './ChallengePackEditor';
import { HostMetrics } from './HostMetrics';

export function HostPage() {
  const { t } = useTranslation();
  const { joinCode = '' } = useParams();
  const code = joinCode.toUpperCase();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [participants, setParticipants] = useState<PublicParticipant[]>([]);
  const [tables, setTables] = useState<PublicTable[]>([]);
  const [hostPin, setHostPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [metrics, setMetrics] = useState<EventMetrics | null>(null);
  const [hoursDraft, setHoursDraft] = useState('24');

  const refresh = useCallback(async () => {
    const [roster, tableList] = await Promise.all([
      listParticipants(code),
      listTables(code),
    ]);
    setParticipants(roster.participants);
    setTables(tableList.tables);
  }, [code]);

  const refreshMetrics = useCallback(async (token: string) => {
    try {
      const result = await getEventMetrics(code, token);
      setMetrics(result.metrics);
    } catch {
      /* host token may not be ready yet */
    }
  }, [code]);

  const onSnapshot = useCallback(
    (snapshot: { event: PublicEvent; participants: PublicParticipant[]; tables: PublicTable[] }) => {
      setEvent(snapshot.event);
      setParticipants(snapshot.participants);
      setTables(snapshot.tables);
    },
    [],
  );

  useEventLive(code, Boolean(event), onSnapshot);

  useEffect(() => {
    const token = loadHostToken(code);
    if (!token) {
      return;
    }
    let cancelled = false;
    void verifyHostToken(code, token)
      .then(async (result) => {
        if (cancelled) {
          return;
        }
        setHostToken(token);
        setEvent(result.event);
        await refresh();
        await refreshMetrics(token);
      })
      .catch(() => {
        /* show PIN form */
      });
    return () => {
      cancelled = true;
    };
  }, [code, refresh, refreshMetrics]);

  useEffect(() => {
    if (event) {
      setHoursDraft(String(event.lifetimeHours));
    }
  }, [event]);

  async function onUnlock(submit: FormEvent) {
    submit.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await unlockHost(code, hostPin);
      saveHostToken(result.event.joinCode, result.hostToken);
      setHostToken(result.hostToken);
      setEvent(result.event);
      await refresh();
      await refreshMetrics(result.hostToken);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.unlockHost'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onToggleTable(table: PublicTable) {
    if (!hostToken) {
      return;
    }
    const next = table.status === 'disabled' ? 'free' : 'disabled';
    setError(null);
    try {
      await setTableStatus(code, hostToken, table.id, next);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.updateTable'),
      );
    }
  }

  async function onStartTable(table: PublicTable) {
    if (!hostToken) {
      return;
    }
    setError(null);
    try {
      await startTable(code, hostToken, table.id);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.startGame'),
      );
    }
  }

  async function onStartAllTables() {
    if (!hostToken) {
      return;
    }
    const readyTables = tables.filter((table) => table.podStatus === 'formed');
    if (readyTables.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        readyTables.map((table) => startTable(code, hostToken, table.id)),
      );
      await refresh();
    } catch (caught) {
      await refresh();
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.startAllGames'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onFinishTable(table: PublicTable) {
    if (!hostToken) {
      return;
    }
    setError(null);
    try {
      await finishTable(code, hostToken, table.id);
      await refresh();
      await refreshMetrics(hostToken);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.finishTable'),
      );
    }
  }

  async function onCancelTable(table: PublicTable) {
    if (!hostToken) {
      return;
    }
    setError(null);
    try {
      await cancelTable(code, hostToken, table.id);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.cancelPod'),
      );
    }
  }

  async function onToggleSetting(
    patch: {
      allowThreePods?: boolean;
      allowFivePods?: boolean;
      preferredPodSize?: number;
      lifetimeHours?: number;
    },
  ) {
    if (!hostToken) {
      return;
    }
    setError(null);
    try {
      const result = await updateMatchSettings(code, hostToken, patch);
      setEvent(result.event);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.updateSettings'),
      );
    }
  }

  async function onMatch() {
    if (!hostToken) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await matchNow(code, hostToken);
      await refresh();
      await refreshMetrics(hostToken);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.matchTables'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onFillBots() {
    if (!hostToken) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fillTablesWithBots(code, hostToken);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.fillBots'),
      );
    } finally {
      setBusy(false);
    }
  }

  const joinUrl =
    typeof window === 'undefined'
      ? ''
      : (() => {
          const link = joinLinkParts(
            window.location,
            lanHostFromBuild(),
            import.meta.env.VITE_PUBLIC_ORIGIN,
          );
          return playerJoinUrl(
            link.origin,
            link.pathname,
            event?.joinCode ?? code,
          );
        })();

  const unreachableFromPhones =
    typeof window !== 'undefined' &&
    isLocalHostname(window.location.hostname) &&
    !lanHostFromBuild();

  async function onCopyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t('common.errors.clipboard'));
    }
  }

  const counts = countByStatus(participants);
  const queue = queueByWait(participants);
  const seatedPlayers = participants.filter(
    (row) => row.status === 'matched' || row.status === 'playing',
  );
  const pausedPlayers = participants.filter((row) => row.status === 'paused');
  const lobby = participants.filter((row) => row.status === 'joined');
  const readyTables = tables.filter((table) => table.podStatus === 'formed');

  if (!event) {
    return (
      <>
        <ThemeToggleCorner />
        <header>
          <Brand className="mb-6" />
          <h1 className="font-display mb-2 text-3xl font-bold tracking-tight">
            {t('host.desk')}
          </h1>
          <p className="text-muted mb-8 font-mono text-sm tracking-[0.28em] uppercase">
            {code}
          </p>
        </header>

        <Panel title={t('host.locked')} aside={t('host.hostOnly')} onSubmit={onUnlock}>
          <Field
            label={t('home.hostPin')}
            value={hostPin}
            onChange={(change) => setHostPin(change.target.value)}
            inputMode="numeric"
            autoComplete="off"
            className="font-mono tracking-[0.3em]"
            required
          />
          <Button type="submit" size="lg" block disabled={busy}>
            {busy ? t('common.checking') : t('host.unlockHostDesk')}
          </Button>
        </Panel>

        {error ? <p className="text-danger text-sm">{error}</p> : null}

        <p className="text-muted/70 text-xs">
          <Link className="hover:text-ink" to="/">
            {t('common.home')}
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <ThemeToggleCorner
        feedbackContext={{ gameMode: event.gameMode }}
      />
      <header>
        <Brand className="mb-6" />
        <h1 className="font-display mb-2 text-3xl font-bold tracking-tight">
          {event.name}
        </h1>
        <div className="text-muted mb-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span>
            {t('host.playerCount', { count: participants.length })}
          </span>
          <span className="text-neon">
            {t('host.ready', { count: counts.ready })}
          </span>
          <span>{t('host.matched', { count: counts.matched })}</span>
          <span>{t('host.playing', { count: counts.playing })}</span>
          <span>{t('host.paused', { count: counts.paused })}</span>
          <span>
            {t('host.ends', {
              date: new Date(event.expiresAt).toLocaleString(undefined, {
                weekday: 'short',
                hour: 'numeric',
                minute: '2-digit',
              }),
            })}
          </span>
          <Badge tone={event.gameMode === 'treachery' ? 'dev' : 'idle'}>
            {t(`modes.${event.gameMode}.label`)}
          </Badge>
          <Badge tone={event.rulesFormat === 'normal' ? 'live' : 'idle'}>
            {t(`families.${event.rulesFormat}`)}
          </Badge>
        </div>
      </header>

      <Panel title={t('host.podSizes')} aside={t('host.matching')}>
        {event.gameMode === 'commander' ? (
          <>
            <label className="text-muted mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={event.allowThreePods}
                onChange={(change) =>
                  void onToggleSetting({ allowThreePods: change.target.checked })
                }
              />
              {t('host.allowLeftoverThree')}
            </label>
            <label className="text-muted flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={event.allowFivePods}
                onChange={(change) =>
                  void onToggleSetting({ allowFivePods: change.target.checked })
                }
              />
              {t('host.allowFivePods')}
            </label>
          </>
        ) : event.gameMode === 'treachery' ? (
          <>
            <p className="text-muted mb-3 text-sm">
              {t('host.treacheryTargetHint')}
            </p>
            <div className="grid grid-cols-5 gap-2">
              {TREACHERY_POD_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`rounded-xl border p-2 text-sm font-semibold transition ${
                    event.preferredPodSize === size
                      ? 'border-neon bg-neon/10 text-neon'
                      : 'border-muted/20 text-muted hover:border-muted/40'
                  }`}
                  onClick={() => void onToggleSetting({ preferredPodSize: size })}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="text-muted mt-3 text-xs">
              {event.preferredPodSize >= 5
                ? t('host.matchingPrefers', { size: event.preferredPodSize })
                : t('host.matchingPrefersFour')}
            </p>
          </>
        ) : event.gameMode === 'assassin' ? (
          <>
            <p className="text-muted mb-3 text-sm">
              {t('host.assassinTargetHint')}
            </p>
            <div className="grid grid-cols-6 gap-2">
              {ASSASSIN_POD_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`rounded-xl border p-2 text-sm font-semibold transition ${
                    event.preferredPodSize === size
                      ? 'border-neon bg-neon/10 text-neon'
                      : 'border-muted/20 text-muted hover:border-muted/40'
                  }`}
                  onClick={() =>
                    void onToggleSetting({ preferredPodSize: size })
                  }
                >
                  {size}
                </button>
              ))}
            </div>
          </>
        ) : event.gameMode === 'multiplayer' ? (
          <>
            <p className="text-muted mb-3 text-sm">
              {t('host.multiplayerTargetHint')}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[3, 4, 5, 6].map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`rounded-xl border p-2 text-sm font-semibold transition ${
                    event.preferredPodSize === size
                      ? 'border-neon bg-neon/10 text-neon'
                      : 'border-muted/20 text-muted hover:border-muted/40'
                  }`}
                  onClick={() =>
                    void onToggleSetting({ preferredPodSize: size })
                  }
                >
                  {size}
                </button>
              ))}
            </div>
          </>
        ) : event.gameMode === 'duel' ||
          event.gameMode === 'duel-commander' ||
          event.gameMode === 'brawl' ? (
          <p className="text-muted text-sm">
            {event.gameMode === 'duel'
              ? t('host.duelMatchmaking')
              : event.gameMode === 'duel-commander'
                ? t('host.duelCommanderMatchmaking')
                : t('host.brawlMatchmaking')}
          </p>
        ) : event.gameMode === 'two-headed-giant' ? (
          <p className="text-muted text-sm">{t('host.twoHeadedMatchmaking')}</p>
        ) : event.gameMode === 'archenemy-commander' ? (
          <p className="text-muted text-sm">{t('host.archenemyMatchmaking')}</p>
        ) : event.gameMode === 'emperor' ? (
          <p className="text-muted text-sm">{t('host.emperorMatchmaking')}</p>
        ) : (
          <p className="text-muted text-sm">{t('host.starMatchmaking')}</p>
        )}
      </Panel>

      <Panel title={t('host.eventLength')} aside={t('host.joinCodeDies')}>
        <Field
          label={t('host.hoursFromStart')}
          hint={t('host.hoursFromStartHint')}
          type="number"
          inputMode="numeric"
          min={1}
          max={168}
          value={hoursDraft}
          onChange={(change) => setHoursDraft(change.target.value)}
          onBlur={() => {
            const hours = Number(hoursDraft);
            if (
              Number.isInteger(hours) &&
              hours >= 1 &&
              hours <= 168 &&
              hours !== event.lifetimeHours
            ) {
              void onToggleSetting({ lifetimeHours: hours });
            } else {
              setHoursDraft(String(event.lifetimeHours));
            }
          }}
        />
      </Panel>

      {metrics ? <HostMetrics metrics={metrics} /> : null}

      {hostToken && usesCommanderRules(event.gameMode, event.rulesFormat) ? (
        <ChallengePackEditor
          joinCode={code}
          hostToken={hostToken}
          event={event}
          onEvent={setEvent}
          onError={setError}
        />
      ) : null}

      <Panel title={t('host.joinCodeTitle')} aside={t('host.share')}>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <JoinQr value={joinUrl} />
          <div className="min-w-0">
            <p className="font-display text-neon mb-3 text-4xl font-bold tracking-[0.2em] drop-shadow-[0_0_18px_var(--color-neon)]">
              {event.joinCode}
            </p>
            <p className="text-muted mb-4 font-mono text-xs break-all">{joinUrl}</p>
            {unreachableFromPhones ? (
              <p className="text-warning mb-4 text-xs">
                {t('host.noLanAddress')}
              </p>
            ) : null}
            <Button variant="glass" size="sm" onClick={() => void onCopyLink()}>
              {copied ? t('common.copied') : t('host.copyPlayerLink')}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title={t('host.queue')} aside={t('host.ready', { count: counts.ready })}>
        {queue.length === 0 ? (
          <p className="text-muted text-sm">{t('host.nobodyWaiting')}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {queue.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{row.displayName}</span>
                  {row.isBot ? <Badge tone="dev">{t('common.bot')}</Badge> : null}
                  {row.flexCredits > 0 ? (
                    <Badge>{t('host.flex', { count: row.flexCredits })}</Badge>
                  ) : null}
                  {(row.challengePoints ?? 0) > 0 ? (
                    <Badge tone="live">
                      {t('host.challengePts', {
                        count: row.challengePoints ?? 0,
                      })}
                    </Badge>
                  ) : null}
                  {row.decks[0] ? (
                    <Badge>
                      {poolShortLabel(
                        row.decks.find((deck) => deck.preference === 'preferred')
                          ?.poolId ??
                          row.decks[0]?.poolId ??
                          'open',
                      )}
                    </Badge>
                  ) : null}
                </span>
                <WaitTime since={row.readyAt} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {lobby.length > 0 ? (
        <Panel title={t('host.notReady')} aside={String(lobby.length)}>
          <ul className="divide-y divide-white/5">
            {lobby.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-2.5 text-sm">
                <span className="truncate">{row.displayName}</span>
                {(row.challengePoints ?? 0) > 0 ? (
                  <Badge tone="live">
                    {t('host.challengePts', {
                      count: row.challengePoints ?? 0,
                    })}
                  </Badge>
                ) : null}
                {row.isBot ? <Badge tone="dev">{t('common.bot')}</Badge> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {pausedPlayers.length > 0 ? (
        <Panel title={t('host.pausedTitle')} aside={String(pausedPlayers.length)}>
          <ul className="divide-y divide-white/5">
            {pausedPlayers.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2 py-2.5 text-sm"
              >
                <span>{row.displayName}</span>
                {(row.challengePoints ?? 0) > 0 ? (
                  <Badge tone="live">
                    {t('host.challengePts', {
                      count: row.challengePoints ?? 0,
                    })}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {seatedPlayers.length > 0 ? (
        <Panel
          title={t('host.seated')}
          aside={t('host.atTables', {
            count: counts.matched + counts.playing,
          })}
        >
          <ul className="divide-y divide-white/5">
            {seatedPlayers.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="truncate">{row.displayName}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {(row.challengePoints ?? 0) > 0 ? (
                    <Badge tone="live">
                      {t('host.pts', { count: row.challengePoints ?? 0 })}
                    </Badge>
                  ) : null}
                  {row.assignedPoolId ? (
                    <Badge>{poolShortLabel(row.assignedPoolId)}</Badge>
                  ) : null}
                  <span className="text-muted font-mono text-xs">
                    {row.tableLabel}
                  </span>
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title={t('host.tablesTitle')} aside={t('host.total', { count: tables.length })}>
        {tables.length === 0 ? (
          <p className="text-muted text-sm">{t('host.noTables')}</p>
        ) : (
          <>
          <Button
            block
            size="lg"
            className="mb-5"
            disabled={busy || readyTables.length === 0}
            onClick={() => void onStartAllTables()}
          >
            {busy
              ? t('host.startingGames')
              : t('host.startAllReady', { count: readyTables.length })}
          </Button>
          <ul className="mb-5 grid gap-3 sm:grid-cols-2">
            {tables.map((table) => (
              <li
                key={table.id}
                className={
                  table.status === 'occupied'
                    ? 'border-neon/30 bg-neon/5 rounded-xl border p-3'
                    : 'rounded-xl border border-muted/20 bg-ink/[0.02] p-3'
                }
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold">
                    {table.label}
                  </span>
                  <Badge tone={statusTone(table.podStatus ?? table.status)}>
                    {table.poolId
                      ? `${poolShortLabel(table.poolId)} · ${table.podStatus ?? table.status}`
                      : (table.podStatus ?? table.status)}
                  </Badge>
                  {table.trackerUsed !== undefined ? (
                    <Badge>
                      {table.trackerUsed
                        ? t('host.trackerUsed')
                        : t('host.noTracker')}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted mb-3 text-xs">
                  {table.seatedNames.length > 0
                    ? table.seatedNames.join(' · ')
                    : t('common.empty')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {table.podStatus === 'formed' ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void onStartTable(table)}
                    >
                      {t('host.startGame')}
                    </Button>
                  ) : null}
                  {table.podStatus === 'formed' || table.podStatus === 'playing' ? (
                    <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void onFinishTable(table)}
                    >
                      {t('host.finishTable')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void onCancelTable(table)}
                    >
                      {t('host.cancelPod')}
                    </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={table.status === 'occupied'}
                      onClick={() => void onToggleTable(table)}
                    >
                      {table.status === 'disabled'
                        ? t('host.enable')
                        : t('host.disable')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          </>
        )}

        <div className="mb-5 flex flex-wrap gap-2.5">
          <Button disabled={busy} onClick={() => void onMatch()}>
            {busy ? t('common.working') : t('host.matchNow')}
          </Button>
          {import.meta.env.DEV ? (
            <Button
              variant="outline"
              className="border-dashed"
              disabled={busy}
              onClick={() => void onFillBots()}
            >
              {busy ? t('common.working') : t('host.fillBots')}
            </Button>
          ) : null}
        </div>
      </Panel>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <p className="text-muted/70 text-xs">
        <Link className="hover:text-ink" to="/">
          {t('common.home')}
        </Link>
        <span className="mx-2">·</span>
        <Link className="hover:text-ink" to={`/e/${code}`}>
          {t('host.playerJoinPage')}
        </Link>
      </p>
    </>
  );
}
