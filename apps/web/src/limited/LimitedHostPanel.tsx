import { useState } from 'react';
import type {
  EventSnapshot,
  LimitedMatch,
  LimitedMatchOutcome,
  LimitedMode,
  PublicLimitedSession,
} from '@podyguard/shared';
import { limitedHostCue, limitedModeConfig, limitedTablesNeeded } from '@podyguard/shared';
import {
  advanceLimitedPhase,
  ApiError,
  assignLimitedTables,
  cancelLimitedSession,
  completeLimitedSession,
  correctLimitedResult,
  dropLimitedParticipant,
  launchLimitedSession,
  replaceLimitedRoster,
  replaceLimitedDraftTables,
  startLimitedRound,
  updateLimitedTimer,
} from '../api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { LimitedDeveloperTools } from './LimitedDeveloperTools';
import { LimitedTimerDisplay } from './LimitedTimerDisplay';
import {
  LIMITED_MODE_LABELS,
  participantName,
  queuedParticipants,
  scoreForOutcome,
} from './limited-view';

export function LimitedHostPanel({
  joinCode,
  hostToken,
  snapshot,
  onSession,
  onSnapshot = () => undefined,
  onError,
}: {
  joinCode: string;
  hostToken: string;
  snapshot: EventSnapshot;
  onSession: (session: PublicLimitedSession) => void;
  onSnapshot?: (snapshot: EventSnapshot) => void;
  onError: (error: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const configs = snapshot.event.limitedModeConfigs?.filter((row) => row.enabled) ?? [];

  async function run(action: () => Promise<{ session: PublicLimitedSession }>) {
    setBusy(true);
    onError(null);
    try {
      const result = await action();
      onSession(result.session);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Limited action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (configs.length === 0) return null;

  return (
    <Panel title="Limited event desk" aside={`${snapshot.limitedSessions?.length ?? 0} sessions`}>
      <LimitedDeveloperTools
        joinCode={joinCode}
        hostToken={hostToken}
        snapshot={snapshot}
        onSnapshot={onSnapshot}
        onError={onError}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {configs.map((config) => {
          const queue = queuedParticipants(snapshot, config.mode);
          const podSize = config.preferredCohortSize ?? config.minCohortSize;
          const freeTables = snapshot.tables.filter((table) => table.status === 'free').length;
          const seatsNeeded = limitedTablesNeeded(podSize, freeTables);
          const readyCount = queue.filter((person) => person.status === 'ready').length;
          const cue = limitedHostCue({
            mode: config.mode,
            podSize,
            tableCount: freeTables,
            joined: queue.length,
            ready: readyCount,
            draftMinutes: config.draftMinutes,
            deckMinutes: config.deckbuildingMinutes,
            roundMinutes: config.roundMinutes,
            session: null,
          });
          const format = limitedModeConfig(config.mode);
          return (
            <div key={config.mode} className="rounded-xl border border-white/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-sm">{LIMITED_MODE_LABELS[config.mode]}</strong>
                <Badge tone={freeTables > 0 && readyCount >= seatsNeeded ? 'ready' : 'idle'}>
                  {freeTables > 0 ? `${readyCount}/${seatsNeeded} ready` : `${readyCount} ready`}
                </Badge>
              </div>
              <p className="mb-2 text-sm font-semibold">{cue.title}</p>
              <p className="text-muted mb-3 text-xs">{cue.detail}</p>
              <p className="text-muted mb-3 text-xs">
                {format.hasDraftPhase
                  ? format.cardsPerPick === 2
                    ? `Each table seats four. ${freeTables} ${freeTables === 1 ? 'table needs' : 'tables need'} ${seatsNeeded} ready players. Take two cards. Pass left, then right, then left. Diagonals play first.`
                    : `Each table seats eight. ${freeTables} ${freeTables === 1 ? 'table needs' : 'tables need'} ${seatsNeeded} ready players. Take one card. Pass left, then right, then left. Then Swiss.`
                  : `Each table seats four. ${freeTables} ${freeTables === 1 ? 'table needs' : 'tables need'} ${seatsNeeded} ready players. No draft. Six packs, then Swiss.`}{' '}
                {config.matchStructure}.
              </p>
              {queue.length === 0 ? (
                <p className="text-muted mb-3 text-sm">
                  Nobody has joined yet. They appear here as soon as they scan the QR and enter a name.
                </p>
              ) : (
                <ul className="mb-3 divide-y divide-white/5 text-sm">
                  {queue.map((person) => (
                    <li key={person.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="truncate">{person.displayName}</span>
                      <Badge tone={person.status === 'ready' ? 'ready' : 'idle'}>
                        {person.status === 'ready' ? 'Ready' : 'Not ready'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                block
                size="sm"
                disabled={busy || cue.action !== 'assign'}
                onClick={() => {
                  setBusy(true);
                  onError(null);
                  void assignLimitedTables(joinCode, hostToken, { mode: config.mode })
                    .then((result) => onSnapshot(result.snapshot))
                    .catch((caught: unknown) => {
                      onError(
                        caught instanceof ApiError
                          ? caught.message
                          : 'Limited action failed.',
                      );
                    })
                    .finally(() => setBusy(false));
                }}
              >
                {cue.actionLabel ?? 'Assign to tables'}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        {(snapshot.limitedSessions ?? []).map((session) => (
          <LimitedSessionHostCard
            key={session.id}
            session={session}
            snapshot={snapshot}
            busy={busy}
            run={run}
            joinCode={joinCode}
            hostToken={hostToken}
          />
        ))}
      </div>
    </Panel>
  );
}

function LimitedSessionHostCard({
  session,
  snapshot,
  busy,
  run,
  joinCode,
  hostToken,
}: {
  session: PublicLimitedSession;
  snapshot: EventSnapshot;
  busy: boolean;
  run: (action: () => Promise<{ session: PublicLimitedSession }>) => Promise<void>;
  joinCode: string;
  hostToken: string;
}) {
  const queued = queuedParticipants(snapshot, session.mode).filter(
    (person) => !session.participants.some((row) => row.participantId === person.id),
  );
  const activeRound = session.rounds.find((round) => round.number === session.currentRound);
  const activeParticipantCount = session.participants.filter(
    (participant) => participant.status !== 'DROPPED',
  ).length;
  const launchReady =
    activeParticipantCount >= session.minCohortSize &&
    (session.maxCohortSize === undefined ||
      activeParticipantCount <= session.maxCohortSize) &&
    (session.preferredCohortSize === undefined ||
      activeParticipantCount >= session.preferredCohortSize ||
      session.allowUndersizedLaunch);

  function roster(ids: string[]) {
    void run(() => replaceLimitedRoster(joinCode, hostToken, session.id, ids));
  }

  function move(index: number, delta: number) {
    const ids = session.participants.map((row) => row.participantId);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    roster(ids);
  }

  function correct(match: LimitedMatch, outcome: Exclude<LimitedMatchOutcome, 'BYE'>) {
    const correctionReason = window.prompt('Reason for correcting this result?')?.trim();
    if (!correctionReason) return;
    void run(() =>
      correctLimitedResult(joinCode, hostToken, session.id, match.id, {
        outcome,
        ...scoreForOutcome(outcome, match.bestOf),
        correctionReason,
      }),
    );
  }

  return (
    <section className="rounded-xl border border-muted/20 bg-ink/[0.025] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display font-semibold">{session.label}</h3>
          <p className="text-muted text-xs">
            {LIMITED_MODE_LABELS[session.mode]} · {session.matchStructure}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={session.status === 'ROUND_ACTIVE' ? 'live' : 'idle'}>
            {session.status.replaceAll('_', ' ')}
          </Badge>
          <LimitedTimerDisplay timer={session.timer} compact />
        </div>
      </div>

      <ol className="mb-3 divide-y divide-white/5 text-sm">
        {session.participants.map((person, index) => {
          const mark = rosterMark(session, person);
          return (
          <li key={person.participantId} className="flex flex-wrap items-center gap-2 py-2">
            <span className="w-6 font-mono text-muted">{person.draftSeat ?? '—'}</span>
            <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
            <Badge tone={mark.tone}>{mark.label}</Badge>
            {session.status === 'FORMING' ? (
              <>
                <Button size="sm" variant="ghost" disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</Button>
                <Button size="sm" variant="ghost" disabled={busy || index === session.participants.length - 1} onClick={() => move(index, 1)}>↓</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => roster(session.participants.filter((_, row) => row !== index).map((row) => row.participantId))}
                >
                  Remove
                </Button>
              </>
            ) : person.status !== 'DROPPED' && !['COMPLETED', 'CANCELLED'].includes(session.status) ? (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => void run(() => dropLimitedParticipant(joinCode, hostToken, session.id, person.participantId))}
              >
                Drop
              </Button>
            ) : null}
          </li>
          );
        })}
      </ol>

      {session.status === 'FORMING' && queued.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {queued.map((person) => (
            <Button
              key={person.id}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => roster([...session.participants.map((row) => row.participantId), person.id])}
            >
              + {person.displayName}
            </Button>
          ))}
        </div>
      ) : null}

      {session.status === 'FORMING' && session.mode !== 'SEALED' ? (
        <fieldset className="mb-3 rounded-lg border border-white/10 p-3">
          <legend className="text-muted px-1 text-xs">Draft tables</legend>
          <div className="flex flex-wrap gap-2">
            {snapshot.tables.map((table) => {
              const selected = session.draftTableIds.includes(table.id);
              return (
                <label
                  key={table.id}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    selected
                      ? 'border-neon bg-neon/10 text-neon'
                      : 'border-muted/20 text-muted'
                  }`}
                >
                  <input
                    className="mr-1"
                    type="checkbox"
                    checked={selected}
                    disabled={busy || (table.status !== 'free' && !selected)}
                    onChange={() => {
                      const tableIds = selected
                        ? session.draftTableIds.filter(
                            (tableId) => tableId !== table.id,
                          )
                        : [...session.draftTableIds, table.id];
                      void run(() =>
                        replaceLimitedDraftTables(
                          joinCode,
                          hostToken,
                          session.id,
                          tableIds,
                        ),
                      );
                    }}
                  />
                  {table.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {activeRound ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {activeRound.matches.map((match) => (
            <div key={match.id} className="rounded-lg border border-white/10 p-3 text-sm">
              <p className="font-medium">
                {match.tableLabel ?? `Match ${match.position}`} · {participantName(session, match.playerAId)} vs {participantName(session, match.playerBId)}
              </p>
              <p className="text-muted mb-2 text-xs">
                {match.outcome ?? match.status} {match.outcome ? `· ${match.playerAGameWins}-${match.playerBGameWins}` : ''}
              </p>
              {match.outcome && match.outcome !== 'BYE' ? (
                <div className="flex flex-wrap gap-1">
                  {(['PLAYER_A_WIN', 'PLAYER_B_WIN', 'DRAW', 'DOUBLE_LOSS'] as const).map((outcome) => (
                    <Button key={outcome} size="sm" variant="ghost" disabled={busy} onClick={() => correct(match, outcome)}>
                      {outcome.replaceAll('_', ' ')}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {session.standings.length > 0 ? (
        <div className="mb-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[28rem] text-left text-xs">
            <thead className="text-muted uppercase">
              <tr>
                <th className="p-2">Rank</th>
                <th>Player</th>
                <th>Record</th>
                <th>Points</th>
                <th>MW%</th>
                <th>OMW%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {session.standings.map((standing) => (
                <tr key={standing.participantId}>
                  <td className="p-2 font-mono">{standing.rank}</td>
                  <td>{standing.displayName}</td>
                  <td>{standing.matchWins}-{standing.matchLosses}-{standing.draws}</td>
                  <td>{standing.points}</td>
                  <td>{Math.round(standing.matchWinPercentage * 100)}%</td>
                  <td>{Math.round(standing.opponentMatchWinPercentage * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <SessionStep
        session={session}
        tableLabel={
          snapshot.tables.find((table) => table.id === session.draftTableIds[0])?.label ??
          null
        }
      />

      <div className="flex flex-wrap gap-2">
        {session.status === 'FORMING' ? (
          <>
            <Button disabled={busy || !launchReady} onClick={() => void run(() => launchLimitedSession(joinCode, hostToken, session.id))}>Launch seating</Button>
            <Button variant="danger" disabled={busy} onClick={() => void run(() => cancelLimitedSession(joinCode, hostToken, session.id))}>Cancel</Button>
          </>
        ) : session.status === 'SEATING' ? (
          <Button
            disabled={
              busy ||
              session.participants.some(
                (person) => person.status !== 'DROPPED' && (!person.draftSeat || !person.seated),
              )
            }
            onClick={() => void run(() => advanceLimitedPhase(joinCode, hostToken, session.id, session.mode === 'SEALED' ? 'DECKBUILDING' : 'DRAFTING'))}
          >
            {session.mode === 'SEALED' ? 'Start deckbuilding' : 'Start draft'}
          </Button>
        ) : session.status === 'BETWEEN_ROUNDS' ? (
          <Button disabled={busy} onClick={() => void run(() => startLimitedRound(joinCode, hostToken, session.id))}>
            Start round {(session.currentRound ?? 0) + 1}
          </Button>
        ) : null}
        {session.timer?.status === 'RUNNING' ? (
          <Button variant="glass" disabled={busy} onClick={() => void run(() => updateLimitedTimer(joinCode, hostToken, session.id, 'PAUSE'))}>
            {session.timer.phase === 'ROUND' ? 'Pause this table' : 'Pause timer'}
          </Button>
        ) : session.timer?.status === 'PAUSED' ? (
          <Button variant="glass" disabled={busy} onClick={() => void run(() => updateLimitedTimer(joinCode, hostToken, session.id, 'RESUME'))}>
            {session.timer.phase === 'ROUND' ? 'Resume this table' : 'Resume timer'}
          </Button>
        ) : null}
        {session.timer ? (
          <Button variant="glass" disabled={busy} onClick={() => void run(() => updateLimitedTimer(joinCode, hostToken, session.id, 'ADD', { seconds: 300 }))}>+5 minutes</Button>
        ) : null}
        {!['FORMING', 'COMPLETED', 'CANCELLED'].includes(session.status) ? (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm('End this Limited session now?')) {
                void run(() =>
                  completeLimitedSession(
                    joinCode,
                    hostToken,
                    session.id,
                  ),
                );
              }
            }}
          >
            End session
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function rosterMark(
  session: PublicLimitedSession,
  person: PublicLimitedSession['participants'][number],
): { label: string; tone: 'muted' | 'ready' | 'idle' } {
  if (person.status === 'DROPPED') return { label: 'Dropped', tone: 'muted' };
  const confirmed = session.phaseAcks?.includes(person.participantId) ?? false;
  if (session.status === 'SEATING') {
    if (!person.draftSeat) return { label: 'Picking a seat', tone: 'idle' };
    return person.seated
      ? { label: 'Seated', tone: 'ready' }
      : { label: `Seat ${person.draftSeat}`, tone: 'idle' };
  }
  if (session.status === 'DRAFTING') {
    return confirmed
      ? { label: 'Draft done', tone: 'ready' }
      : { label: 'Drafting', tone: 'idle' };
  }
  if (session.status === 'DECKBUILDING') {
    return confirmed
      ? { label: 'Deck received', tone: 'ready' }
      : { label: 'Building', tone: 'idle' };
  }
  return { label: person.status.replaceAll('_', ' '), tone: 'idle' };
}

function SessionStep({
  session,
  tableLabel,
}: {
  session: PublicLimitedSession;
  tableLabel: string | null;
}) {
  if (session.status === 'FORMING') return null;
  const active = session.participants.filter((person) => person.status !== 'DROPPED');
  const cue = limitedHostCue({
    mode: session.mode,
    podSize: session.preferredCohortSize ?? session.minCohortSize,
    joined: active.length,
    ready: active.length,
    deckMinutes: 0,
    roundMinutes: 0,
    session: {
      status: session.status,
      seated: active.filter((person) => person.seated).length,
      active: active.length,
      phaseAckCount: session.phaseAcks?.length ?? 0,
      playStarted: Boolean(session.timer),
      tableLabel,
      roundNumber: session.currentRound ?? null,
      totalRounds: session.totalRounds,
    },
  });
  return (
    <p className="text-muted mb-3 text-sm">
      <span className="text-ink font-semibold">{cue.title}. </span>
      {cue.detail}
    </p>
  );
}
