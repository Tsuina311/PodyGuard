import { useMemo, useState } from 'react';
import {
  attentionItems,
  currentEventRound,
  parseEventOperationMode,
  resolveRoundCount,
  roundProgress,
  type PublicEvent,
  type PublicEventRound,
  type PublicParticipant,
  type RoundAssignment,
  type RoundEventState,
} from '@podyguard/shared';
import {
  ApiError,
  completeEventRound,
  dropEventRoundParticipant,
  generateEventRound,
  markMissingEventRoundParticipant,
  previewRepairEventRound,
  publishEventRound,
  repairEventRound,
  resolveEventRoundStaleBasis,
  startEventRound,
} from '../api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Panel } from '../ui/Panel';
import { cx } from '../ui/cx';

type Props = {
  joinCode: string;
  hostToken: string;
  event: PublicEvent;
  participants: PublicParticipant[];
  onEvent: (event: PublicEvent) => void;
  onError: (error: string | null) => void;
};

function playerName(
  participants: PublicParticipant[],
  participantId: string,
): string {
  return (
    participants.find((row) => row.id === participantId)?.displayName ??
    participantId.slice(0, 6)
  );
}

function statusTone(
  status: RoundAssignment['status'] | string,
): 'ready' | 'live' | 'idle' | 'dev' | undefined {
  switch (status) {
    case 'PLAYING':
    case 'ACTIVE':
    case 'PUBLISHED':
      return 'live';
    case 'COMPLETED':
    case 'BYE':
      return 'ready';
    case 'PLANNING':
    case 'ASSIGNED':
      return 'idle';
    default:
      return undefined;
  }
}

function matchesSearch(
  query: string,
  assignment: RoundAssignment,
  nameFor: (id: string) => string,
): boolean {
  if (!query) return true;
  const haystack = [
    assignment.tableLabel ?? '',
    String(assignment.position),
    assignment.status,
    ...assignment.participantIds.map(nameFor),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function RoundHostPanel({
  joinCode,
  hostToken,
  event,
  participants,
  onEvent,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [repairPreview, setRepairPreview] = useState<{
    movingParticipantIds: string[];
    affectedAssignmentIds: string[];
    after: PublicEventRound;
  } | null>(null);

  const rounds: RoundEventState | undefined = event.rounds;
  const current = rounds ? currentEventRound(rounds) : undefined;
  const progress = current ? roundProgress(current) : null;
  const attention = rounds ? attentionItems(rounds) : [];
  const totalRounds = rounds ? resolveRoundCount(rounds) : 0;
  const query = search.trim().toLowerCase();

  const nameFor = useMemo(
    () => (id: string) => playerName(participants, id),
    [participants],
  );

  const visibleAssignments = useMemo(() => {
    if (!current) return [];
    return current.assignments.filter((assignment) =>
      matchesSearch(query, assignment, nameFor),
    );
  }, [current, query, nameFor]);

  if (parseEventOperationMode(event.operationMode) !== 'ROUNDS') {
    return null;
  }

  async function run(action: () => Promise<{ event: PublicEvent }>) {
    setBusy(true);
    onError(null);
    try {
      const result = await action();
      onEvent({
        ...result.event,
        operationMode: 'ROUNDS',
        rounds: result.event.rounds,
      });
      setUnlockedIds([]);
      setRepairPreview(null);
    } catch (caught) {
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Round action failed. Is the rounds API available?',
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleUnlock(assignmentId: string) {
    setUnlockedIds((currentIds) =>
      currentIds.includes(assignmentId)
        ? currentIds.filter((id) => id !== assignmentId)
        : [...currentIds, assignmentId],
    );
    setRepairPreview(null);
  }

  const version = current?.version ?? 0;
  const canGenerate =
    !current ||
    current.status === 'COMPLETED' ||
    current.status === 'CANCELLED' ||
    current.status === 'PLANNING';
  const canPublish = current?.status === 'PLANNING';
  const canStart = current?.status === 'PUBLISHED';
  const canComplete = current?.status === 'ACTIVE';
  const canRepair =
    current &&
    (current.status === 'PLANNING' || current.status === 'PUBLISHED') &&
    unlockedIds.length > 0;

  return (
    <Panel
      title="Synchronized rounds"
      aside={
        <Badge tone={statusTone(current?.status ?? 'PLANNING')}>
          {current
            ? `Round ${current.number} · ${current.status}`
            : 'No round yet'}
        </Badge>
      }
    >
      <p className="text-muted mb-4 text-sm">
        Everyone plays the same round together. Generate pairings, publish them
        for the floor, start the clock, then complete when results are in.
      </p>

      {rounds ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 p-3">
            <p className="text-muted text-xs tracking-wide uppercase">Progress</p>
            <p className="font-display mt-1 text-lg font-semibold">
              {progress
                ? `${progress.complete} / ${progress.total} tables done`
                : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 p-3">
            <p className="text-muted text-xs tracking-wide uppercase">Night</p>
            <p className="font-display mt-1 text-lg font-semibold">
              Round {rounds.currentRoundNumber || 0} of {totalRounds}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 p-3">
            <p className="text-muted text-xs tracking-wide uppercase">Kind</p>
            <p className="font-display mt-1 text-lg font-semibold">
              {rounds.activityKind === 'DUEL' ? '1v1' : 'Pods'}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-muted mb-4 text-sm">
          Round state will appear here once the server attaches rounds to this
          event.
        </p>
      )}

      {attention.length > 0 ? (
        <div className="border-warning/40 bg-warning/10 mb-4 rounded-xl border p-3">
          <p className="text-warning mb-2 text-xs tracking-wide uppercase">
            Needs attention
          </p>
          <ul className="space-y-1 text-sm">
            {attention.map((item) => (
              <li key={`${item.code}:${item.assignmentId ?? item.participantId ?? item.message}`}>
                {item.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Button
          block
          size="sm"
          disabled={busy || !canGenerate}
          onClick={() =>
            void run(() =>
              generateEventRound(
                joinCode,
                hostToken,
                current?.status === 'PLANNING' ? version : undefined,
              ),
            )
          }
        >
          Generate
        </Button>
        <Button
          block
          size="sm"
          variant="glass"
          disabled={busy || !canPublish}
          onClick={() =>
            void run(() => publishEventRound(joinCode, hostToken, version))
          }
        >
          Publish
        </Button>
        <Button
          block
          size="sm"
          variant="neon"
          disabled={busy || !canStart}
          onClick={() =>
            void run(() => startEventRound(joinCode, hostToken, version))
          }
        >
          Start
        </Button>
        <Button
          block
          size="sm"
          disabled={busy || !canComplete}
          onClick={() =>
            void run(() => completeEventRound(joinCode, hostToken, version))
          }
        >
          Complete
        </Button>
      </div>

      {current?.pairingBasisStale ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(() =>
                resolveEventRoundStaleBasis(
                  joinCode,
                  hostToken,
                  version,
                  'keep',
                ),
              )
            }
          >
            Keep pairings
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || current.status === 'ACTIVE'}
            onClick={() =>
              void run(() =>
                resolveEventRoundStaleBasis(
                  joinCode,
                  hostToken,
                  version,
                  'regenerate',
                ),
              )
            }
          >
            Regenerate for standings
          </Button>
        </div>
      ) : null}

      {current && current.assignments.length > 0 ? (
        <Field
          wrapperClassName="mb-4"
          label="Search tables or players"
          hint="Handy once the room gets big (30+)."
          value={search}
          onChange={(change) => setSearch(change.target.value)}
          placeholder="Table 3 or Alex"
          autoComplete="off"
        />
      ) : null}

      {current ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted text-xs tracking-wide uppercase">
              Tables · {visibleAssignments.length}
              {query ? ` matching “${search.trim()}”` : ''}
            </p>
            {current.status === 'PLANNING' || current.status === 'PUBLISHED' ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !canRepair}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      onError(null);
                      try {
                        const preview = await previewRepairEventRound(
                          joinCode,
                          hostToken,
                          version,
                          unlockedIds,
                        );
                        setRepairPreview({
                          movingParticipantIds: preview.movingParticipantIds,
                          affectedAssignmentIds: preview.affectedAssignmentIds,
                          after: preview.after,
                        });
                      } catch (caught) {
                        onError(
                          caught instanceof ApiError
                            ? caught.message
                            : 'Repair preview failed.',
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Preview repair ({unlockedIds.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !canRepair || !repairPreview}
                  onClick={() =>
                    void run(() =>
                      repairEventRound(
                        joinCode,
                        hostToken,
                        version,
                        unlockedIds,
                      ),
                    )
                  }
                >
                  Apply repair
                </Button>
              </div>
            ) : null}
          </div>

          {repairPreview ? (
            <p className="text-muted mb-3 text-xs">
              Preview moves {repairPreview.movingParticipantIds.length} player(s)
              across {repairPreview.affectedAssignmentIds.length} table(s). Apply
              to commit.
            </p>
          ) : null}

          {current.unassignedParticipantIds.length > 0 ? (
            <p className="text-warning mb-3 text-xs">
              Unassigned:{' '}
              {current.unassignedParticipantIds.map(nameFor).join(' · ')}
            </p>
          ) : null}

          {current.pairingBasisStale ? (
            <p className="text-warning mb-3 text-xs">
              Pairings may be stale after a prior-result correction. Keep or
              regenerate before starting if that matters for this round.
            </p>
          ) : null}

          <ul className="mb-2 grid gap-3 sm:grid-cols-2">
            {visibleAssignments.map((assignment) => {
              const unlocked = unlockedIds.includes(assignment.id);
              const canUnlock =
                current.status === 'PLANNING' || current.status === 'PUBLISHED';
              return (
                <li
                  key={assignment.id}
                  className={cx(
                    'rounded-xl border p-3',
                    unlocked
                      ? 'border-neon/40 bg-neon/5'
                      : 'border-muted/20 bg-ink/[0.02]',
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold">
                      {assignment.isBye
                        ? 'Bye'
                        : (assignment.tableLabel ?? `Table ${assignment.position}`)}
                    </span>
                    <Badge tone={statusTone(assignment.status)}>
                      {assignment.status}
                    </Badge>
                  </div>
                  <p className="text-muted mb-2 text-xs">
                    {assignment.participantIds.map(nameFor).join(' · ') ||
                      'Empty'}
                  </p>
                  {assignment.explanation ? (
                    <p className="text-muted/80 mb-2 text-[0.7rem] leading-snug">
                      {assignment.explanation}
                    </p>
                  ) : null}
                  {canUnlock && !assignment.isBye ? (
                    <label className="text-muted flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={unlocked}
                        onChange={() => toggleUnlock(assignment.id)}
                      />
                      Unlock for repair
                    </label>
                  ) : null}
                  {current.status === 'ACTIVE' || current.status === 'PUBLISHED'
                    ? assignment.participantIds.map((participantId) => (
                        <div
                          key={participantId}
                          className="mt-2 flex flex-wrap gap-1"
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                dropEventRoundParticipant(
                                  joinCode,
                                  hostToken,
                                  participantId,
                                  version,
                                ),
                              )
                            }
                          >
                            Drop {nameFor(participantId)}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                markMissingEventRoundParticipant(
                                  joinCode,
                                  hostToken,
                                  participantId,
                                  version,
                                ),
                              )
                            }
                          >
                            Mark missing
                          </Button>
                        </div>
                      ))
                    : null}
                </li>
              );
            })}
          </ul>

          {visibleAssignments.length === 0 ? (
            <p className="text-muted text-sm">No tables match that search.</p>
          ) : null}
        </>
      ) : (
        <p className="text-muted text-sm">
          Tap Generate when everyone who should play this round is registered.
        </p>
      )}
    </Panel>
  );
}
