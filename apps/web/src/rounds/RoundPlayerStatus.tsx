import {
  currentEventRound,
  parseEventOperationMode,
  type PublicEvent,
  type PublicParticipant,
  type RoundAssignment,
  type PublicEventRound,
} from '@podyguard/shared';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

function playerLabel(
  participants: PublicParticipant[],
  participantId: string,
  selfId: string,
): string {
  if (participantId === selfId) return 'You';
  return (
    participants.find((row) => row.id === participantId)?.displayName ??
    'Player'
  );
}

function findAssignment(
  event: PublicEvent,
  participantId: string,
): { round: PublicEventRound; assignment: RoundAssignment } | null {
  if (!event.rounds) return null;
  const round = currentEventRound(event.rounds);
  if (!round) return null;
  if (round.status !== 'PUBLISHED' && round.status !== 'ACTIVE') {
    return null;
  }
  const assignment = round.assignments.find((row) =>
    row.participantIds.includes(participantId),
  );
  if (!assignment) return null;
  return { round, assignment };
}

export function RoundPlayerStatus({
  event,
  participant,
  participants,
  busy,
  onLeave,
}: {
  event: PublicEvent;
  participant: PublicParticipant;
  participants: PublicParticipant[];
  busy: boolean;
  onLeave: () => void;
}) {
  if (parseEventOperationMode(event.operationMode) !== 'ROUNDS') {
    return null;
  }

  const seated = findAssignment(event, participant.id);
  const meta = event.rounds?.participants.find(
    (row) => row.participantId === participant.id,
  );
  const current = event.rounds ? currentEventRound(event.rounds) : undefined;
  const waitingForNext =
    meta?.status === 'WAITING_FOR_NEXT_ROUND' ||
    (!seated &&
      (event.rounds?.currentRoundNumber ?? 0) > 0 &&
      current?.status === 'COMPLETED');

  if (seated) {
    const { round, assignment } = seated;
    const others = assignment.participantIds.filter(
      (id) => id !== participant.id,
    );
    const table =
      assignment.tableLabel ??
      (assignment.isBye ? 'Bye' : `Table ${assignment.position}`);
    return (
      <div className="border-neon/30 bg-neon/5 mb-4 rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-display text-lg font-semibold">
            Round {round.number}
          </p>
          <Badge tone={round.status === 'ACTIVE' ? 'live' : 'idle'}>
            {round.status === 'ACTIVE' ? 'Playing' : 'Assigned'}
          </Badge>
        </div>
        <p className="mb-1 text-sm">
          <span className="text-muted">Table · </span>
          <span className="font-mono tracking-wide">{table}</span>
        </p>
        {assignment.isBye ? (
          <p className="text-muted text-sm">You have a bye this round.</p>
        ) : (
          <p className="text-sm">
            <span className="text-muted">
              {others.length > 1 ? 'Pod · ' : 'Opponent · '}
            </span>
            {others
              .map((id) => playerLabel(participants, id, participant.id))
              .join(' · ') || 'TBA'}
          </p>
        )}
        {round.status === 'PUBLISHED' ? (
          <p className="text-muted mt-3 text-xs">
            Pairings are up — head to your table. The host starts the round when
            the floor is ready.
          </p>
        ) : (
          <p className="text-muted mt-3 text-xs">
            Round in progress. Report results with the host when you finish.
          </p>
        )}
        <Button
          className="mt-4"
          variant="ghost"
          block
          disabled={busy}
          onClick={onLeave}
        >
          Leave event
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-white/10 p-4">
      <p className="font-display mb-1 text-base font-semibold">
        {waitingForNext ? 'Between rounds' : 'Waiting for pairings'}
      </p>
      <p className="text-muted mb-4 text-sm">
        {waitingForNext
          ? 'Hang tight — the host will publish the next round when everyone is ready.'
          : 'You are checked in. The host will publish table assignments for the next synchronized round.'}
      </p>
      <Button variant="ghost" block disabled={busy} onClick={onLeave}>
        Leave event
      </Button>
    </div>
  );
}
