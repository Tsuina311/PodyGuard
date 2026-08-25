import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  EventMetrics,
  PublicEvent,
  PublicParticipant,
  PublicTable,
} from '@podyguard/shared';
import { poolShortLabel } from '@podyguard/shared';
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
  lanHostFromBuild,
  playerJoinUrl,
  shareableOrigin,
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
        caught instanceof ApiError ? caught.message : 'Could not unlock host.',
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
        caught instanceof ApiError ? caught.message : 'Could not update table.',
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
        caught instanceof ApiError ? caught.message : 'Could not start the game.',
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
          : 'Could not start all ready games.',
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
        caught instanceof ApiError ? caught.message : 'Could not finish the table.',
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
        caught instanceof ApiError ? caught.message : 'Could not cancel the pod.',
      );
    }
  }

  async function onToggleSetting(
    patch: { allowThreePods?: boolean; allowFivePods?: boolean },
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
        caught instanceof ApiError ? caught.message : 'Could not update settings.',
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
        caught instanceof ApiError ? caught.message : 'Could not match tables.',
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
          : 'Could not fill tables with bots.',
      );
    } finally {
      setBusy(false);
    }
  }

  const joinUrl =
    typeof window === 'undefined'
      ? ''
      : playerJoinUrl(
          shareableOrigin(window.location, lanHostFromBuild()),
          window.location.pathname,
          event?.joinCode ?? code,
        );

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
      setError('Clipboard blocked — copy the link manually.');
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
            Host desk
          </h1>
          <p className="text-muted mb-8 font-mono text-sm tracking-[0.28em] uppercase">
            {code}
          </p>
        </header>

        <Panel title="Locked" aside="host only" onSubmit={onUnlock}>
          <Field
            label="Host PIN"
            value={hostPin}
            onChange={(change) => setHostPin(change.target.value)}
            inputMode="numeric"
            autoComplete="off"
            className="font-mono tracking-[0.3em]"
            required
          />
          <Button type="submit" size="lg" block disabled={busy}>
            {busy ? 'Checking…' : 'Unlock host desk'}
          </Button>
        </Panel>

        {error ? <p className="text-danger text-sm">{error}</p> : null}

        <p className="text-muted/70 text-xs">
          <Link className="hover:text-ink" to="/">
            Home
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <ThemeToggleCorner />
      <header>
        <Brand className="mb-6" />
        <h1 className="font-display mb-2 text-3xl font-bold tracking-tight">
          {event.name}
        </h1>
        <div className="text-muted mb-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span>
            {participants.length} player{participants.length === 1 ? '' : 's'}
          </span>
          <span className="text-neon">{counts.ready} ready</span>
          <span>{counts.matched} matched</span>
          <span>{counts.playing} playing</span>
          <span>{counts.paused} paused</span>
        </div>
      </header>

      <Panel title="Pod sizes" aside="matching">
        <label className="text-muted mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={event.allowThreePods}
            onChange={(change) =>
              void onToggleSetting({ allowThreePods: change.target.checked })
            }
          />
          Allow leftover 3-player pods
        </label>
        <label className="text-muted flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={event.allowFivePods}
            onChange={(change) =>
              void onToggleSetting({ allowFivePods: change.target.checked })
            }
          />
          Allow 5-player pods
        </label>
      </Panel>

      {metrics ? <HostMetrics metrics={metrics} /> : null}

      {hostToken ? (
        <ChallengePackEditor
          joinCode={code}
          hostToken={hostToken}
          event={event}
          onEvent={setEvent}
          onError={setError}
        />
      ) : null}

      <Panel title="Join code" aside="share">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <JoinQr value={joinUrl} />
          <div className="min-w-0">
            <p className="font-display text-neon mb-3 text-4xl font-bold tracking-[0.2em] drop-shadow-[0_0_18px_var(--color-neon)]">
              {event.joinCode}
            </p>
            <p className="text-muted mb-4 font-mono text-xs break-all">{joinUrl}</p>
            {unreachableFromPhones ? (
              <p className="text-warning mb-4 text-xs">
                No LAN address found — this link only works on this computer.
              </p>
            ) : null}
            <Button variant="glass" size="sm" onClick={() => void onCopyLink()}>
              {copied ? 'Copied' : 'Copy player link'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Queue" aside={`${String(counts.ready)} ready`}>
        {queue.length === 0 ? (
          <p className="text-muted text-sm">Nobody waiting.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {queue.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{row.displayName}</span>
                  {row.isBot ? <Badge tone="dev">bot</Badge> : null}
                  {row.flexCredits > 0 ? (
                    <Badge>flex {String(row.flexCredits)}</Badge>
                  ) : null}
                  {(row.challengePoints ?? 0) > 0 ? (
                    <Badge tone="live">
                      {String(row.challengePoints)} challenge pts
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
        <Panel title="Not ready" aside={String(lobby.length)}>
          <ul className="divide-y divide-white/5">
            {lobby.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-2.5 text-sm">
                <span className="truncate">{row.displayName}</span>
                {(row.challengePoints ?? 0) > 0 ? (
                  <Badge tone="live">
                    {String(row.challengePoints)} challenge pts
                  </Badge>
                ) : null}
                {row.isBot ? <Badge tone="dev">bot</Badge> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {pausedPlayers.length > 0 ? (
        <Panel title="Paused" aside={String(pausedPlayers.length)}>
          <ul className="divide-y divide-white/5">
            {pausedPlayers.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2 py-2.5 text-sm"
              >
                <span>{row.displayName}</span>
                {(row.challengePoints ?? 0) > 0 ? (
                  <Badge tone="live">
                    {String(row.challengePoints)} challenge pts
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {seatedPlayers.length > 0 ? (
        <Panel
          title="Seated"
          aside={`${String(counts.matched + counts.playing)} at tables`}
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
                      {String(row.challengePoints)} pts
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

      <Panel title="Tables" aside={`${String(tables.length)} total`}>
        {tables.length === 0 ? (
          <p className="text-muted text-sm">
            This event was created without tables.
          </p>
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
              ? 'Starting games…'
              : `Start all ready games (${String(readyTables.length)})`}
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
                    <Badge>{table.trackerUsed ? 'tracker' : 'no tracker'}</Badge>
                  ) : null}
                </div>
                <p className="text-muted mb-3 text-xs">
                  {table.seatedNames.length > 0
                    ? table.seatedNames.join(' · ')
                    : 'Empty'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {table.podStatus === 'formed' ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void onStartTable(table)}
                    >
                      Start game
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
                      Finish table
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void onCancelTable(table)}
                    >
                      Cancel pod
                    </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={table.status === 'occupied'}
                      onClick={() => void onToggleTable(table)}
                    >
                      {table.status === 'disabled' ? 'Enable' : 'Disable'}
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
            {busy ? 'Working…' : 'Match now'}
          </Button>
          {import.meta.env.DEV ? (
            <Button
              variant="outline"
              className="border-dashed"
              disabled={busy}
              onClick={() => void onFillBots()}
            >
              {busy ? 'Working…' : 'Fill tables with bots'}
            </Button>
          ) : null}
        </div>
      </Panel>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <p className="text-muted/70 text-xs">
        <Link className="hover:text-ink" to="/">
          Home
        </Link>
        <span className="mx-2">·</span>
        <Link className="hover:text-ink" to={`/e/${code}`}>
          Player join page
        </Link>
      </p>
    </>
  );
}
