import { useState } from 'react';
import type { EventSnapshot, LimitedMode, PublicLimitedSession } from '@podyguard/shared';
import { addLimitedFakePlayers, advanceLimitedFakes, ApiError } from '../api';
import { useDeveloperMode } from '../developer-mode';
import { Button } from '../ui/Button';
import { LIMITED_MODE_LABELS } from './limited-view';

export function LimitedDeveloperTools({
  joinCode,
  hostToken,
  snapshot,
  onSnapshot,
  onError,
}: {
  joinCode: string;
  hostToken: string;
  snapshot: EventSnapshot;
  onSnapshot: (snapshot: EventSnapshot) => void;
  onError: (error: string | null) => void;
}) {
  const [developer] = useDeveloperMode();
  const configs = snapshot.event.limitedModeConfigs?.filter((row) => row.enabled) ?? [];
  const [mode, setMode] = useState<LimitedMode>(configs[0]?.mode ?? 'PICK_TWO_DRAFT');
  const [countText, setCountText] = useState('3');
  const [busy, setBusy] = useState(false);
  if (!developer || configs.length === 0) return null;

  const selected = configs.find((row) => row.mode === mode) ?? configs[0]!;
  const parsedCount = Number(countText);
  const countReady =
    /^[0-9]+$/.test(countText) &&
    Number.isInteger(parsedCount) &&
    parsedCount >= 1 &&
    parsedCount <= 8;
  const podSize = selected.preferredCohortSize ?? selected.minCohortSize;
  const lobby = snapshot.participants.filter(
    (person) => person.limitedQueueMode === selected.mode,
  );
  const bots = new Set(
    snapshot.participants.filter((person) => person.isBot).map((person) => person.id),
  );
  const unreadyFakes = lobby.filter(
    (person) => person.isBot && person.status !== 'ready',
  );
  const session = (snapshot.limitedSessions ?? []).find(
    (candidate) =>
      candidate.mode === selected.mode &&
      !['COMPLETED', 'CANCELLED'].includes(candidate.status),
  );
  const sessionFakes =
    session?.participants.filter(
      (person) => bots.has(person.participantId) && person.status !== 'DROPPED',
    ) ?? [];
  const fakeMatches =
    session?.rounds
      .find((round) => round.number === session.currentRound)
      ?.matches.filter(
        (match) =>
          !match.outcome &&
          match.playerBId &&
          bots.has(match.playerAId) &&
          bots.has(match.playerBId),
      ) ?? [];

  async function run(action: () => Promise<{ snapshot: EventSnapshot }>) {
    setBusy(true);
    onError(null);
    try {
      onSnapshot((await action()).snapshot);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Fake players could not move.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-neon/30 mb-5 rounded-xl border border-dashed p-3">
      <p className="font-display text-sm font-semibold">Developer</p>
      <p className="text-muted mb-3 text-xs">
        Fake players join the lobby and stop at every button a friend would tap.
        You still use the play tab for your own Ready, seat, and confirmations.
        Add them before you assign tables. This pod wants {podSize}; the lobby has {lobby.length}.
      </p>
      {configs.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {configs.map((config) => (
            <button
              key={config.mode}
              type="button"
              className={`rounded-lg border px-2 py-1 text-xs ${
                selected.mode === config.mode
                  ? 'border-neon text-neon'
                  : 'border-muted/20 text-muted'
              }`}
              onClick={() => setMode(config.mode)}
            >
              {LIMITED_MODE_LABELS[config.mode]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-muted text-xs">
          How many
          <input
            className="border-muted/30 bg-ink ml-2 w-14 rounded-md border px-2 py-1 text-sm"
            inputMode="numeric"
            value={countText}
            onChange={(event) => {
              const next = event.target.value;
              if (next === '' || /^[0-9]+$/.test(next)) {
                setCountText(next);
              }
            }}
          />
        </label>
        <Button
          size="sm"
          variant="glass"
          disabled={busy || !countReady}
          onClick={() =>
            void run(() =>
              addLimitedFakePlayers(joinCode, hostToken, {
                mode: selected.mode,
                count: parsedCount,
              }),
            )
          }
        >
          Add fake players
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {unreadyFakes.length > 0 ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(() =>
                advanceLimitedFakes(joinCode, hostToken, {
                  action: 'ready',
                  mode: selected.mode,
                }),
              )
            }
          >
            Ready the fake players
          </Button>
        ) : null}
        {session ? (
          <SessionFakeActions
            session={session}
            fakes={sessionFakes}
            unfinishedFakeMatches={fakeMatches.length}
            busy={busy}
            onRun={(action) =>
              void run(() =>
                advanceLimitedFakes(joinCode, hostToken, {
                  action,
                  sessionId: session.id,
                }),
              )
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function SessionFakeActions({
  session,
  fakes,
  unfinishedFakeMatches,
  busy,
  onRun,
}: {
  session: PublicLimitedSession;
  fakes: PublicLimitedSession['participants'];
  unfinishedFakeMatches: number;
  busy: boolean;
  onRun: (action: 'seat' | 'seated' | 'ack' | 'report') => void;
}) {
  const acks = new Set(session.phaseAcks ?? []);
  if (session.status === 'SEATING') {
    return (
      <>
        {fakes.some((person) => !person.draftSeat) ? (
          <Button size="sm" disabled={busy} onClick={() => onRun('seat')}>
            Seat the fake players
          </Button>
        ) : null}
        {fakes.some((person) => person.draftSeat && !person.seated) ? (
          <Button size="sm" disabled={busy} onClick={() => onRun('seated')}>
            Fake players tap I'm seated
          </Button>
        ) : null}
      </>
    );
  }
  if (session.status === 'DRAFTING' && fakes.some((person) => !acks.has(person.participantId))) {
    return (
      <Button size="sm" disabled={busy} onClick={() => onRun('ack')}>
        Fake players confirm the draft
      </Button>
    );
  }
  if (session.status === 'DECKBUILDING' && fakes.some((person) => !acks.has(person.participantId))) {
    return (
      <Button size="sm" disabled={busy} onClick={() => onRun('ack')}>
        Fake players mark decks ready
      </Button>
    );
  }
  if (session.status === 'ROUND_ACTIVE' && unfinishedFakeMatches > 0) {
    return (
      <Button size="sm" disabled={busy} onClick={() => onRun('report')}>
        Finish fake matches
      </Button>
    );
  }
  return null;
}
