import { useState } from 'react';
import type {
  EventSnapshot,
  LimitedMatchOutcome,
  LimitedMode,
  PublicParticipant,
} from '@podyguard/shared';
import {
  ApiError,
  dropLimitedParticipant,
  joinLimitedQueue,
  leaveLimitedQueue,
  reportLimitedResult,
} from '../api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
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
}: {
  snapshot: EventSnapshot;
  participant: PublicParticipant;
  token: string;
  onSnapshot: (snapshot: EventSnapshot) => void;
  onError: (error: string | null) => void;
}) {
  const [mode, setMode] = useState<LimitedMode>(
    participant.limitedQueueMode ??
      snapshot.event.limitedModeConfigs?.find((config) => config.enabled)?.mode ??
      'BOOSTER_DRAFT',
  );
  const [busy, setBusy] = useState(false);
  const session = activeLimitedSession(snapshot, participant.id);
  const match = currentLimitedMatch(session, participant.id);
  const configs = snapshot.event.limitedModeConfigs?.filter((config) => config.enabled) ?? [];

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

  function submit(outcome: Exclude<LimitedMatchOutcome, 'BYE'>) {
    if (!session || !match) return;
    void act(async () => {
      await reportLimitedResult(
        snapshot.event.joinCode,
        token,
        session.id,
        match.id,
        { outcome, ...scoreForOutcome(outcome, match.bestOf) },
      );
    });
  }

  if (configs.length === 0) return null;

  return (
    <Panel
      title="Limited"
      aside={
        session ? (
          <Badge tone={session.status === 'ROUND_ACTIVE' ? 'live' : 'idle'}>
            {session.status.replaceAll('_', ' ')}
          </Badge>
        ) : participant.limitedQueueMode ? (
          <Badge tone="ready">Queued</Badge>
        ) : null
      }
    >
      {session ? (
        <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold">{session.label}</h3>
              <p className="text-muted text-sm">
                {LIMITED_MODE_LABELS[session.mode]} · {session.matchStructure} · round {session.currentRound ?? 0}/{session.totalRounds}
              </p>
            </div>
            <LimitedTimerDisplay timer={session.timer} compact />
          </div>
          {session.status === 'SEATING' || session.status === 'DRAFTING' ? (
            <div className="border-neon/30 bg-neon/5 mb-4 rounded-xl border p-4 text-center">
              <p className="text-muted text-xs uppercase tracking-widest">Your draft seat</p>
              <p className="font-display text-neon text-4xl font-bold">
                {session.participants.find((row) => row.participantId === participant.id)?.draftSeat ?? '—'}
              </p>
            </div>
          ) : null}
          {match ? (
            <div className="mb-4 rounded-xl border border-white/10 p-4">
              <p className="text-muted mb-1 text-xs uppercase tracking-widest">
                {match.tableLabel ?? (match.outcome === 'BYE' ? 'Bye' : 'Table pending')}
              </p>
              <p className="font-display mb-2 text-lg font-semibold">
                {participantName(session, match.playerAId)} vs {participantName(session, match.playerBId)}
              </p>
              <p className="text-muted mb-3 text-sm">
                {match.outcome ? `Result: ${match.outcome.replaceAll('_', ' ')}` : `Best of ${match.bestOf}`}
              </p>
              {!match.outcome && match.playerBId ? (
                <div className="grid grid-cols-2 gap-2">
                  {(['PLAYER_A_WIN', 'PLAYER_B_WIN', 'DRAW', 'DOUBLE_LOSS'] as const).map((outcome) => (
                    <Button key={outcome} size="sm" variant="glass" disabled={busy} onClick={() => submit(outcome)}>
                      {outcome === 'PLAYER_A_WIN'
                        ? `${participantName(session, match.playerAId)} wins`
                        : outcome === 'PLAYER_B_WIN'
                          ? `${participantName(session, match.playerBId)} wins`
                          : outcome.replaceAll('_', ' ')}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-muted mb-4 text-sm">
              {session.status === 'DECKBUILDING'
                ? 'Build your deck and watch the timer. Pairings will appear here.'
                : 'The organizer is preparing the next phase.'}
            </p>
          )}
          {!['COMPLETED', 'CANCELLED'].includes(session.status) ? (
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await dropLimitedParticipant(snapshot.event.joinCode, token, session.id);
                })
              }
            >
              Drop from session
            </Button>
          ) : null}
        </>
      ) : participant.limitedQueueMode ? (
        <>
          <p className="text-muted mb-3 text-sm">
            Waiting for {LIMITED_MODE_LABELS[participant.limitedQueueMode]}. You will be assigned automatically or by the organizer.
          </p>
          <Button
            variant="glass"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const result = await leaveLimitedQueue(snapshot.event.joinCode, token);
                onSnapshot(result.snapshot);
              })
            }
          >
            Leave Limited queue
          </Button>
        </>
      ) : (
        <>
          <p className="text-muted mb-3 text-sm">Choose one enabled Limited queue.</p>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            {configs.map((config) => (
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
                <span className="mt-1 block text-xs font-normal">
                  {config.matchStructure} · target {config.preferredCohortSize ?? config.minCohortSize}
                </span>
              </label>
            ))}
          </div>
          <Button
            variant="neon"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const result = await joinLimitedQueue(snapshot.event.joinCode, token, mode);
                onSnapshot(result.snapshot);
              })
            }
          >
            Join Limited queue
          </Button>
        </>
      )}
    </Panel>
  );
}
