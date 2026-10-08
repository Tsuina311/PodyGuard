import { useState } from 'react';
import type {
  EventSnapshot,
  LimitedMatchOutcome,
  LimitedMode,
  PublicLimitedSession,
  PublicParticipant,
} from '@podyguard/shared';
import { limitedModeConfig, limitedPlayerCue } from '@podyguard/shared';
import {
  acknowledgeLimitedPhase,
  ApiError,
  claimLimitedSeat,
  confirmLimitedSeated,
  dropLimitedParticipant,
  joinLimitedQueue,
  leaveLimitedQueue,
  reportLimitedResult,
  setReady,
} from '../api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { LimitedSeatMap } from './LimitedSeatMap';
import { LimitedTimerDisplay } from './LimitedTimerDisplay';
import {
  activeLimitedSession,
  currentLimitedMatch,
  LIMITED_MODE_LABELS,
  participantName,
  scoreForOutcome,
} from './limited-view';

export function LimitedPlayerPanel({
  snapshot,
  participant,
  token,
  onSnapshot,
  onError,
  onReady,
}: {
  snapshot: EventSnapshot;
  participant: PublicParticipant;
  token: string;
  onSnapshot: (snapshot: EventSnapshot) => void;
  onError: (error: string | null) => void;
  onReady?: (ready: boolean) => Promise<void>;
}) {
  const enabled =
    snapshot.event.limitedModeConfigs?.filter((config) => config.enabled) ?? [];
  const [mode, setMode] = useState<LimitedMode>(
    participant.limitedQueueMode ?? enabled[0]?.mode ?? 'BOOSTER_DRAFT',
  );
  const [busy, setBusy] = useState(false);
  const session = activeLimitedSession(snapshot, participant.id);
  const match = currentLimitedMatch(session, participant.id);
  const self = session?.participants.find(
    (row) => row.participantId === participant.id,
  );
  const tableLabel = tableName(snapshot, session);

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
        }
      : null,
  });

  function submit(outcome: Exclude<LimitedMatchOutcome, 'BYE'>) {
    if (!session || !match) return;
    void act(async () => {
      const result = await reportLimitedResult(
        snapshot.event.joinCode,
        token,
        session.id,
        match.id,
        { outcome, ...scoreForOutcome(outcome, match.bestOf) },
      );
      remember(result.session);
    });
  }

  const seatCount =
    session?.preferredCohortSize ??
    session?.minCohortSize ??
    (session ? limitedModeConfig(session.mode).preferredCohortSize ?? 4 : 4);
  const format = session?.mode ?? participant.limitedQueueMode ?? null;
  const seatingSession = session?.status === 'SEATING' ? session : undefined;

  return (
    <Panel
      title="Limited"
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
      <div className="mb-4">
        <h3 className="font-display text-lg font-semibold">{cue.title}</h3>
        <p className="text-muted mt-1 text-sm">{cue.detail}</p>
        {format ? (
          <p className="text-muted mt-2 text-xs">{LIMITED_MODE_LABELS[format]}</p>
        ) : null}
      </div>

      {session?.timer ? (
        <div className="mb-4">
          <LimitedTimerDisplay timer={session.timer} />
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
            seatCount={seatCount}
            selfId={participant.id}
            disabled={busy}
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
        <div className="mt-4 rounded-xl border border-white/10 p-4">
          <p className="text-muted mb-1 text-xs uppercase tracking-widest">
            {match.tableLabel ?? tableLabel ?? 'Table'}
          </p>
          <p className="font-display mb-2 text-lg font-semibold">
            {participantName(session, match.playerAId)} vs{' '}
            {participantName(session, match.playerBId)}
          </p>
          <p className="text-muted mb-3 text-sm">
            {match.outcome
              ? `Result: ${match.outcome.replaceAll('_', ' ')}`
              : `Best of ${match.bestOf}`}
          </p>
          {!match.outcome && match.playerBId ? (
            <div className="grid grid-cols-2 gap-2">
              {(['PLAYER_A_WIN', 'PLAYER_B_WIN', 'DRAW', 'DOUBLE_LOSS'] as const).map(
                (outcome) => (
                  <Button
                    key={outcome}
                    size="sm"
                    variant="glass"
                    disabled={busy}
                    onClick={() => submit(outcome)}
                  >
                    {outcome === 'PLAYER_A_WIN'
                      ? `${participantName(session, match.playerAId)} wins`
                      : outcome === 'PLAYER_B_WIN'
                        ? `${participantName(session, match.playerBId)} wins`
                        : outcome.replaceAll('_', ' ')}
                  </Button>
                ),
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {session && !['COMPLETED', 'CANCELLED'].includes(session.status) ? (
        <Button
          className="mt-4"
          variant="danger"
          size="sm"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const result = await dropLimitedParticipant(
                snapshot.event.joinCode,
                token,
                session.id,
              );
              remember(result.session);
            })
          }
        >
          Drop from session
        </Button>
      ) : null}
    </Panel>
  );
}

function tableName(
  snapshot: EventSnapshot,
  session: PublicLimitedSession | undefined,
): string | null {
  const tableId = session?.draftTableIds[0];
  if (!tableId) return null;
  return snapshot.tables.find((table) => table.id === tableId)?.label ?? null;
}
