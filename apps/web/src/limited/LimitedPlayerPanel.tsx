import { lazy, Suspense, useState } from 'react';
import type {
  EventSnapshot,
  LimitedMatchOutcome,
  LimitedMode,
  PublicLimitedSession,
  PublicParticipant,
} from '@podyguard/shared';
import { limitedModeConfig, limitedPlayerCue } from '@podyguard/shared';
import { ChevronDown } from 'lucide-react';
import {
  acknowledgeLimitedPhase,
  ApiError,
  claimLimitedSeat,
  confirmLimitedPlay,
  confirmLimitedSeated,
  setLimitedSeatLayout,
  dropLimitedParticipant,
  joinLimitedQueue,
  leaveLimitedQueue,
  reportLimitedResult,
  reportLimitedProgress,
  setReady,
} from '../api';
import { readStored, writeStored } from '../device-storage';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { LimitedSeatMap } from './LimitedSeatMap';
import { LimitedTimerDisplay } from './LimitedTimerDisplay';
import {
  activeLimitedSession,
  limitedSeatingDestination,
  limitedPhaseProgress,
  currentLimitedMatch,
  LIMITED_MODE_LABELS,
  participantName,
  scoreForOutcome,
} from './limited-view';

const TrackerView = lazy(() =>
  import('../tracker/TrackerView').then((module) => ({
    default: module.TrackerView,
  })),
);

export function LimitedPlayerPanel({
  snapshot,
  participant,
  token,
  onSnapshot,
  onError,
  onReady,
  onOpenDesk,
}: {
  snapshot: EventSnapshot;
  participant: PublicParticipant;
  token: string;
  onSnapshot: (snapshot: EventSnapshot) => void;
  onError: (error: string | null) => void;
  onReady?: (ready: boolean) => Promise<void>;
  onOpenDesk?: () => void;
}) {
  const enabled =
    snapshot.event.limitedModeConfigs?.filter((config) => config.enabled) ?? [];
  const [mode, setMode] = useState<LimitedMode>(
    participant.limitedQueueMode ?? enabled[0]?.mode ?? 'BOOSTER_DRAFT',
  );
  const [busy, setBusy] = useState(false);
  const [trackerMatchId, setTrackerMatchId] = useState<string | null>(null);
  const [gameScore, setGameScore] = useState<{ key: string; aWins: number; bWins: number } | null>(null);
  const session = activeLimitedSession(snapshot, participant.id);
  const match = currentLimitedMatch(session, participant.id);
  const trackerKey = `podyguard.tracker.limited.${snapshot.event.joinCode}.${match?.id ?? ''}`;
  const scoreKey = `${trackerKey}:score:${participant.id}`;
  const localScore = match?.bestOf === 3 ? readStored(scoreKey)?.match(/^([01])-([01])$/) : null;
  const currentScore = gameScore?.key === scoreKey ? gameScore : null;
  const playerAGameWins = match?.playerAGameWins ?? currentScore?.aWins ?? Number(localScore?.[1] ?? 0);
  const playerBGameWins = match?.playerBGameWins ?? currentScore?.bWins ?? Number(localScore?.[2] ?? 0);
  const gameNumber = playerAGameWins + playerBGameWins + 1;
  const self = session?.participants.find(
    (row) => row.participantId === participant.id,
  );
  const tableLabel = limitedSeatingDestination(snapshot, session, participant.id);
  const matchWinnerId = match?.outcome === 'PLAYER_A_WIN' ? match.playerAId
    : match?.outcome === 'PLAYER_B_WIN' ? match.playerBId : undefined;

  async function act(action: () => Promise<void>) {
    setBusy(true);
    onError(null);
    try {
      await action();
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Limited action failed.');
    } finally {
      setBusy(false);
    }
  }

  function remember(next: PublicLimitedSession) {
    onSnapshot({
      ...snapshot,
      limitedSessions: [
        ...(snapshot.limitedSessions ?? []).filter((row) => row.id !== next.id),
        next,
      ],
    });
  }

  if (enabled.length === 0) return null;

  const cue = limitedPlayerCue({
    mode: session?.mode ?? participant.limitedQueueMode ?? null,
    inLobby: Boolean(participant.limitedQueueMode),
    ready: participant.status === 'ready',
    session: session
      ? {
          status: session.status,
          mode: session.mode,
          tableLabel,
          seat: self?.draftSeat ?? null,
          seated: Boolean(self?.seated),
          phaseAckCount: session.phaseAcks?.length ?? 0,
          selfAcked: session.phaseAcks?.includes(participant.id) ?? false,
          opponentName: match
            ? participantName(
                session,
                match.playerAId === participant.id ? match.playerBId : match.playerAId,
              )
            : null,
          roundNumber: session.currentRound ?? null,
          totalRounds: session.totalRounds,
          playStarted: Boolean(session.timer),
        }
      : null,
  });

  async function submitResult(
    outcome: Exclude<LimitedMatchOutcome, 'BYE'>,
    score: ReturnType<typeof scoreForOutcome>,
  ) {
    if (!session || !match || match.outcome) return;
    const result = await reportLimitedResult(
      snapshot.event.joinCode,
      token,
      session.id,
      match.id,
      { outcome, ...score },
    );
    remember(result.session);
  }

  async function recordGameWin(outcome: 'PLAYER_A_WIN' | 'PLAYER_B_WIN') {
    if (!match || match.outcome) return;
    const aWins = playerAGameWins + Number(outcome === 'PLAYER_A_WIN');
    const bWins = playerBGameWins + Number(outcome === 'PLAYER_B_WIN');
    const winsNeeded = Math.ceil(match.bestOf / 2);
    if (aWins === winsNeeded || bWins === winsNeeded) {
      await submitResult(outcome, { playerAGameWins: aWins, playerBGameWins: bWins });
    } else {
      if (!session) return;
      const result = await reportLimitedProgress(snapshot.event.joinCode, token, session.id, match.id,
        { playerAGameWins: aWins, playerBGameWins: bWins });
      remember(result.session);
      writeStored(scoreKey, `${aWins}-${bWins}`);
      setGameScore({ key: scoreKey, aWins, bWins });
    }
    setTrackerMatchId(null);
  }

  const seatCount =
    session?.preferredCohortSize ??
    session?.minCohortSize ??
    (session ? limitedModeConfig(session.mode).preferredCohortSize ?? 4 : 4);
  const format = session?.mode ?? participant.limitedQueueMode ?? null;
  const seatingSession = session?.status === 'SEATING' ? session : undefined;
  const phaseProgress = session && limitedPhaseProgress(session);
  const isDraft = Boolean(session && limitedModeConfig(session.mode).hasDraftPhase);

  function reportGameWin(outcome: 'PLAYER_A_WIN' | 'PLAYER_B_WIN', label: string) {
    if (window.confirm(`Confirm result: ${label}?`)) void act(() => recordGameWin(outcome));
  }

  function beginPlay(tracker: boolean) {
    if (!session || !match) return;
    void act(async () => {
      if (!session.timer) await confirmLimitedPlay(snapshot.event.joinCode, token, session.id);
      const result = await reportLimitedProgress(snapshot.event.joinCode, token, session.id, match.id,
        { playerAGameWins, playerBGameWins, startGame: true });
      remember(result.session);
      if (tracker) setTrackerMatchId(match.id);
    });
  }

  if (
    trackerMatchId === match?.id &&
    session &&
    match?.playerBId &&
    !match.outcome
  ) {
    const opponentId =
      match.playerAId === participant.id ? match.playerBId : match.playerAId;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-void">
        {session.timer ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[70] px-3 pt-2">
            <LimitedTimerDisplay timer={session.timer} compact roundNumber={session.currentRound} />
          </div>
        ) : null}
        <Suspense fallback={null}>
          <TrackerView
            storageKey={gameNumber === 1 ? trackerKey : `${trackerKey}.game-${gameNumber}`}
            players={[
              { id: participant.id, name: participant.displayName, commanders: [] },
              {
                id: opponentId,
                name: participantName(session, opponentId),
                commanders: [],
              },
            ]}
            gameMode="duel"
            rulesFormat="normal"
            finishLabel={match.bestOf === 1 ? 'Report match result' : 'Record game result'}
            onFinish={(winnerId) =>
              recordGameWin(winnerId === match.playerAId ? 'PLAYER_A_WIN' : 'PLAYER_B_WIN')
            }
            onQuit={() => setTrackerMatchId(null)}
            onOpenDesk={onOpenDesk && (() => {
              setTrackerMatchId(null);
              onOpenDesk();
            })}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <Panel
      title={format ? LIMITED_MODE_LABELS[format] : 'Limited'}
      className="p-4 sm:p-5"
      aside={
        session ? (
          <Badge tone={session.status === 'ROUND_ACTIVE' ? 'live' : 'idle'}>
            {session.status.replaceAll('_', ' ')}
          </Badge>
        ) : participant.status === 'ready' ? (
          <Badge tone="ready">Ready</Badge>
        ) : participant.limitedQueueMode ? (
          <Badge tone="idle">In the lobby</Badge>
        ) : null
      }
    >
      <div className="mb-3">
        <h3 className="font-display text-lg font-semibold">{cue.title}</h3>
        <p className="text-muted mt-1 text-sm">
          {cue.detail}
          {session?.status === 'ROUND_ACTIVE' && match && (
            <> · {match.tableLabel ?? tableLabel ?? 'Table'} · Best of {match.bestOf}</>
          )}
        </p>
        {phaseProgress && <p role="status" className="mt-2 text-sm text-muted">{phaseProgress}</p>}
      </div>

      {session?.timer ? (
        <div className="mb-3">
          <LimitedTimerDisplay timer={session.timer} compact={session.timer.phase === 'ROUND'} roundNumber={session.currentRound} />
        </div>
      ) : null}

      {cue.action === 'join-lobby' ? (
        <>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            {enabled.map((config) => (
              <label
                key={config.mode}
                className={`cursor-pointer rounded-xl border p-3 text-sm font-semibold ${
                  mode === config.mode
                    ? 'border-neon bg-neon/10 text-neon'
                    : 'border-muted/20 text-muted'
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  checked={mode === config.mode}
                  onChange={() => setMode(config.mode)}
                />
                {LIMITED_MODE_LABELS[config.mode]}
              </label>
            ))}
          </div>
          <Button
            variant="neon"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const result = await joinLimitedQueue(
                  snapshot.event.joinCode,
                  token,
                  enabled.length === 1 ? enabled[0]!.mode : mode,
                );
                onSnapshot(result.snapshot);
              })
            }
          >
            {cue.actionLabel}
          </Button>
        </>
      ) : null}

      {cue.action === 'ready' || cue.action === 'unready' ? (
        <div className="flex flex-col gap-2">
          <Button
            variant={cue.action === 'ready' ? 'neon' : 'glass'}
            disabled={busy}
            onClick={() =>
              void act(async () => {
                if (onReady) {
                  await onReady(cue.action === 'ready');
                  return;
                }
                await setReady(
                  snapshot.event.joinCode,
                  token,
                  cue.action === 'ready',
                );
              })
            }
          >
            {cue.actionLabel}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const result = await leaveLimitedQueue(snapshot.event.joinCode, token);
                onSnapshot(result.snapshot);
              })
            }
          >
            Leave the lobby
          </Button>
        </div>
      ) : null}

      {seatingSession ? (
        <div className="mb-4">
          <LimitedSeatMap
            shape={snapshot.tables.find(table => table.id === seatingSession.draftTableIds[0])?.area?.draft?.shape}
            seatCount={seatCount}
            selfId={participant.id}
            disabled={busy}
            seated={self?.seated}
            passLabel={isDraft ? 'Pack 1 passes left' : undefined}
            layout={seatingSession.seatLayout === 'long' ? 'long' : 'square'}
            onLayout={
              seatCount === 4
                ? (layout) => {
                    void act(async () => {
                      const result = await setLimitedSeatLayout(
                        snapshot.event.joinCode,
                        token,
                        seatingSession.id,
                        layout,
                      );
                      remember(result.session);
                    });
                  }
                : undefined
            }
            occupants={seatingSession.participants
              .filter((row) => row.draftSeat && row.status !== 'DROPPED')
              .map((row) => ({
                participantId: row.participantId,
                displayName: row.displayName,
                seat: row.draftSeat!,
              }))}
            onPick={(seat) => {
              void act(async () => {
                const result = await claimLimitedSeat(
                  snapshot.event.joinCode,
                  token,
                  seatingSession.id,
                  seat,
                );
                remember(result.session);
              });
            }}
          />
        </div>
      ) : null}

      {cue.actionLabel &&
      (cue.action === 'seated' ||
        cue.action === 'ack-draft' ||
        cue.action === 'ack-deck') &&
      session ? (
        <Button
          variant="neon"
          size="lg"
          block
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const result =
                cue.action === 'seated'
                  ? await confirmLimitedSeated(
                      snapshot.event.joinCode,
                      token,
                      session.id,
                    )
                  : await acknowledgeLimitedPhase(
                      snapshot.event.joinCode,
                      token,
                      session.id,
                    );
              remember(result.session);
            })
          }
        >
          {cue.actionLabel}
        </Button>
      ) : null}

      {match && session ? (
        <div className="mt-4 rounded-xl border border-ink/10 p-4">
          <p aria-live="polite" className="text-muted mb-3 text-sm">
            {match.outcome
              ? `Result: ${matchWinnerId ? `${participantName(session, matchWinnerId)} wins` : match.outcome.replaceAll('_', ' ')}`
              : match.bestOf === 3 ? `Best of 3 · ${playerAGameWins}–${playerBGameWins}` : null}
            {match.outcome && match.bestOf === 3 && match.playerAGameWins != null && match.playerBGameWins != null
              ? ` · ${match.playerAGameWins}–${match.playerBGameWins}`
              : ''}
          </p>
          {match.outcome && session.status === 'ROUND_ACTIVE' ? (
            <p className="text-muted text-sm">Waiting for the other matches in this round.</p>
          ) : null}
          {!match.outcome && match.playerBId ? (
            <div className="mb-3 flex flex-col gap-2">
              <Button
                variant="neon"
                block
                disabled={busy}
                onClick={() => beginPlay(true)}
              >
                {gameNumber > 1 ? `Track game ${gameNumber}` : 'Use life tracker'}
              </Button>
              {match.currentGameStartedAt ? null : (
                <Button
                  variant="glass"
                  block
                  disabled={busy}
                  onClick={() => beginPlay(false)}
                >
                  Start without life tracker
                </Button>
              )}
            </div>
          ) : null}
          {!match.outcome && match.playerBId ? (
            <div className="border-t border-ink/10 pt-3">
              <p className="mb-2 text-sm font-semibold">{match.bestOf === 3 ? 'Report a game winner' : 'Report the winner'}</p>
              <div className="grid grid-cols-2 gap-2">
                {(['PLAYER_A_WIN', 'PLAYER_B_WIN'] as const).map((outcome) => {
                  const winnerId = outcome === 'PLAYER_A_WIN' ? match.playerAId : match.playerBId;
                  const label = `${participantName(session, winnerId)} wins${match.bestOf === 3 ? ` game ${gameNumber}` : ''}`;
                  return (
                    <Button key={outcome} size="sm" variant="glass" disabled={busy} onClick={() => reportGameWin(outcome, label)}>
                      {label}
                    </Button>
                  );
                })}
              </div>
              <details className="group mt-2 text-sm">
                <summary className="flex min-h-10 cursor-pointer items-center gap-1.5 text-muted underline marker:content-none [&::-webkit-details-marker]:hidden">
                  More results
                  <ChevronDown size={16} aria-hidden className="group-open:rotate-180" />
                </summary>
                <div className="grid grid-cols-2 gap-2">
                  {(['DRAW', 'DOUBLE_LOSS'] as const).map((outcome) => {
                    const label = outcome === 'DRAW' ? 'Report match draw' : 'Report double loss';
                    return (
                      <Button key={outcome} size="sm" variant="ghost" disabled={busy} onClick={() => {
                        if (!window.confirm(`${label}?`)) return;
                        const score = outcome === 'DRAW' && playerAGameWins === playerBGameWins
                          ? { playerAGameWins, playerBGameWins } : scoreForOutcome(outcome, match.bestOf);
                        void act(() => submitResult(outcome, score));
                      }}>
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </details>
            </div>
          ) : null}
        </div>
      ) : null}

      {session && !['COMPLETED', 'CANCELLED'].includes(session.status) ? (
        <button
          type="button"
          className="mt-3 min-h-11 text-sm text-muted underline hover:text-ink disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            const eventLabel = isDraft ? 'draft' : 'session';
            const consequence = match && !match.outcome && match.playerBId
              ? ' Your current match will count as a loss.'
              : '';
            if (!window.confirm(`Leave this ${eventLabel}? You’ll be removed from the ${eventLabel}.${consequence}`)) return;
            void act(async () => {
              const result = await dropLimitedParticipant(snapshot.event.joinCode, token, session.id);
              remember(result.session);
            });
          }}
        >
          {isDraft ? 'Leave this draft' : 'Leave this session'}
        </button>
      ) : null}
    </Panel>
  );
}
