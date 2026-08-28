import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  OFFICIAL_COMMANDER_CHALLENGES,
  poolLabel,
  usesCommanderRules,
  commanderSearchProfile,
  type ChallengeDetectionMode,
  type EventSnapshot,
  type PodRating,
  type PublicEvent,
  type PublicParticipant,
  type TreacheryRoleAssignment,
} from '@podyguard/shared';
import {
  ApiError,
  chooseGameTracker,
  clearPlayerSession,
  completeChallenge,
  getEvent,
  getMyTreacheryRole,
  getMe,
  joinEvent,
  listParticipants,
  listTables,
  leaveEvent,
  loadPlayerSession,
  ratePod,
  reportGameResult,
  savePlayerSession,
  setDecks,
  setPaused,
  setReady,
  unveilMyTreacheryIdentity,
} from './api';
import { DeckEditor, defaultDeckRows, type DeckFormRow } from './DeckEditor';
import { Badge, statusTone } from './ui/Badge';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';
import { ThemeToggleCorner } from './ui/ThemeToggle';
import { WaitTime } from './ui/WaitTime';
import { assignedDeckLine, tableForParticipant } from './match-view';
import { TrackerView } from './tracker/TrackerView';
import { TournamentPlayerStatus } from './tournament/TournamentPlayerStatus';
import { TreacheryRoleDialog } from './TreacheryRoleDialog';
import { useEventLive } from './useEventLive';
import { forgetActiveMatch, rememberActiveMatch } from './active-match';
import { readStored, writeStored } from './device-storage';
import {
  enqueuePending,
  flushPending,
  isOfflineError,
  type PendingOp,
} from './offline-queue';

export function JoinPage() {
  const { t } = useTranslation();
  const { joinCode = '' } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [decks, setDeckRows] = useState<DeckFormRow[]>(defaultDeckRows);
  const [participant, setParticipant] = useState<PublicParticipant | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [showTracker, setShowTracker] = useState(false);
  const [askRating, setAskRating] = useState(false);
  const [treacheryRole, setTreacheryRole] =
    useState<TreacheryRoleAssignment | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const rolePod = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setEvent(null);
    setParticipant(null);
    const existing = loadPlayerSession(joinCode);
    void getEvent(joinCode)
      .then(async (loaded) => {
        if (cancelled) {
          return;
        }
        setEvent(loaded);
        if (!existing) {
          return;
        }
        // Ready for the form in case the seat has gone, so a player who has to
        // ask for a new one at least does not have to retype who they are.
        setDisplayName(existing.displayName);
        const me = await getMe(loaded.joinCode, existing.token).catch(
          (caught: unknown) => {
            // A seat the server no longer knows — event recycled, participant
            // dropped — must not leave a stored key parked in front of the
            // join form for good.
            if (
              caught instanceof ApiError &&
              (caught.status === 401 || caught.status === 404)
            ) {
              clearPlayerSession(loaded.joinCode);
              return null;
            }
            throw caught;
          },
        );
        if (!me) {
          return;
        }
        const [roster, tableList] = await Promise.all([
          listParticipants(loaded.joinCode),
          listTables(loaded.joinCode),
        ]);
        if (!cancelled) {
          setToken(existing.token);
          setParticipant(me.participant);
          setSnapshot({
            event: loaded,
            participants: roster.participants,
            tables: tableList.tables,
          });
          if (me.participant.decks.length > 0) {
            setDeckRows(
              me.participant.decks.map((deck) => ({
                name: deck.name ?? '',
                poolId: deck.poolId,
                preference: deck.preference,
                commanders: deck.commanders ?? [],
              })),
            );
          }
          if (
            me.participant.status === 'playing' &&
            me.participant.trackerUsed === true
          ) {
            setShowTracker(true);
          }
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError && caught.status === 404) {
          void navigate('/', { replace: true, state: { staleJoin: true } });
          return;
        }
        setError(
          caught instanceof ApiError
            ? caught.message
            : t('common.errors.eventNotFound'),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [joinCode, navigate]);

  const onSnapshot = useCallback((next: EventSnapshot) => {
    setSnapshot(next);
    setEvent(next.event);
    setParticipant((current) => {
      if (!current) {
        return current;
      }
      return next.participants.find((row) => row.id === current.id) ?? current;
    });
  }, []);

  useEventLive(event?.joinCode, Boolean(event && token), onSnapshot);

  useEffect(() => {
    if (
      event?.gameMode !== 'treachery' ||
      !token ||
      !participant?.tableLabel
    ) {
      setTreacheryRole(null);
      setRoleOpen(false);
      rolePod.current = null;
      return;
    }
    let cancelled = false;
    void getMyTreacheryRole(event.joinCode, token)
      .then(({ assignment }) => {
        if (cancelled) {
          return;
        }
        const firstReceipt = rolePod.current !== assignment.podId;
        rolePod.current = assignment.podId;
        setTreacheryRole(assignment);
        const seenKey = treacheryRoleSeenKey(assignment.podId, participant.id);
        if (firstReceipt && readStored(seenKey) !== 'true') {
          setRoleRevealed(false);
          setRoleOpen(true);
        }
      })
      .catch((caught: unknown) => {
        if (
          !cancelled &&
          caught instanceof ApiError &&
          caught.code !== 'POD_NOT_FOUND'
        ) {
          setError(caught.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    event?.gameMode,
    event?.joinCode,
    participant?.id,
    participant?.status,
    participant?.tableLabel,
    token,
  ]);

  useEffect(() => {
    if (!event || !participant) {
      return;
    }
    const path = `/e/${event.joinCode}`;
    if (participant.status === 'playing' && showTracker) {
      rememberActiveMatch(path);
    } else if (participant.status !== 'playing') {
      forgetActiveMatch(path);
    }
  }, [event, participant, showTracker]);

  useEffect(() => {
    if (!event || !token) {
      return;
    }
    const join = event.joinCode;
    const auth = token;
    async function send(op: PendingOp) {
      if (op.type === 'result') {
        await reportGameResult(
          join,
          auth,
          op.winnerParticipantId,
          op.durationSeconds,
        );
        return;
      }
      if (op.type === 'challenge') {
        await completeChallenge(join, auth, op.challengeId, {
          targetParticipantId: op.targetParticipantId,
          source: op.source,
          confirmed: op.confirmed,
        });
        return;
      }
      if (op.type === 'tracker-choice') {
        await chooseGameTracker(join, auth, op.trackerUsed);
        return;
      }
      await ratePod(join, auth, op.rating);
    }
    void flushPending(join, send);
    const onOnline = () => {
      void flushPending(join, send);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [event, token]);

  async function onJoin(submit: FormEvent) {
    submit.preventDefault();
    if (!event || !displayName.trim()) {
      return;
    }
    if (commanderRules && decks.some((deck) => deck.commanders.length === 0)) {
      setError(t('common.errors.chooseCommander'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await joinEvent(event.joinCode, displayName, decks);
      savePlayerSession(event.joinCode, {
        token: result.token,
        displayName: result.participant.displayName,
      });
      setToken(result.token);
      setParticipant(result.participant);
      if (result.participant.decks.length > 0) {
        setDeckRows(
          result.participant.decks.map((deck) => ({
            name: deck.name ?? '',
            poolId: deck.poolId,
            preference: deck.preference,
            commanders: deck.commanders ?? [],
          })),
        );
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.joinEvent'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDecks() {
    if (!event || !token) {
      return;
    }
    if (commanderRules && decks.some((deck) => deck.commanders.length === 0)) {
      setError(t('common.errors.chooseCommander'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await setDecks(event.joinCode, token, decks);
      setParticipant(result.participant);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.saveDecks'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onReady(ready: boolean) {
    if (!event || !token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await setReady(event.joinCode, token, ready);
      setParticipant(result.participant);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.updateReady'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPause(paused: boolean) {
    if (!event || !token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await setPaused(event.joinCode, token, paused);
      setParticipant(result.participant);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.updatePause'),
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Drops the stored seat and shows the join form again. The key now outlives
   * the app, so without this a player who left — or was removed by the host —
   * would land back on a panel they can do nothing with.
   */
  function onForgetSeat() {
    const code = event?.joinCode ?? joinCode.toUpperCase();
    clearPlayerSession(code);
    forgetActiveMatch(`/e/${code}`);
    setToken(null);
    setParticipant(null);
  }

  async function onLeave() {
    if (!event || !token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await leaveEvent(event.joinCode, token);
      onForgetSeat();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.leaveEvent'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onChooseTracker(trackerUsed: boolean) {
    if (!event || !token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await chooseGameTracker(
        event.joinCode,
        token,
        trackerUsed,
      );
      setParticipant(result.participant);
      if (trackerUsed) {
        setShowTracker(true);
      }
    } catch (caught) {
      if (isOfflineError(caught)) {
        enqueuePending(event.joinCode, {
          type: 'tracker-choice',
          trackerUsed,
        });
        if (trackerUsed) {
          setShowTracker(true);
        }
        setError(t('join.offlineSaved'));
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.trackerChoice'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onUnveilIdentity() {
    if (!event || !token) {
      throw new Error(t('common.errors.sessionUnavailable'));
    }
    const result = await unveilMyTreacheryIdentity(event.joinCode, token);
    setTreacheryRole(result.assignment);
  }

  async function onTrackerFinished(
    winnerId: string,
    durationSeconds: number,
  ) {
    if (!event || !token) {
      throw new Error(t('common.errors.sessionUnavailable'));
    }
    try {
      const result = await reportGameResult(
        event.joinCode,
        token,
        winnerId,
        durationSeconds,
      );
      setParticipant(result.participant);
    } catch (caught) {
      if (!isOfflineError(caught)) {
        throw caught;
      }
      enqueuePending(event.joinCode, {
        type: 'result',
        winnerParticipantId: winnerId,
        durationSeconds,
      });
    }
    setShowTracker(false);
    setAskRating(true);
    forgetActiveMatch(`/e/${event.joinCode}`);
  }

  const commanderRules = usesCommanderRules(
    event?.gameMode ?? 'commander',
    event?.rulesFormat,
  );
  const isReady = participant?.status === 'ready';
  const isPaused = participant?.status === 'paused';
  const hasLeft = participant?.status === 'left';
  const seated = Boolean(participant?.tableLabel);
  const decksComplete =
    decks.length > 0 &&
    (commanderRules
      ? decks.every((deck) => deck.commanders.length > 0)
      : decks.every((deck) => deck.poolId.trim().length > 0));
  const canJoin =
    Boolean(event) && displayName.trim().length > 0 && decksComplete;
  const matchTable = tableForParticipant(snapshot, participant);
  const challengeProgress = Object.fromEntries(
    (snapshot?.participants ?? []).map((row) => [
      row.id,
      {
        points: row.challengePoints ?? 0,
        completedChallengeIds: (row.challengeCompletions ?? []).map(
          (completion) => completion.challengeId,
        ),
      },
    ]),
  );

  async function onChallengeComplete(
    challengeId: string,
    targetParticipantId: string,
    source: ChallengeDetectionMode,
    confirmed?: boolean,
  ): Promise<boolean> {
    if (!event || !token) {
      throw new Error(t('common.errors.sessionUnavailable'));
    }
    try {
      const result = await completeChallenge(event.joinCode, token, challengeId, {
        targetParticipantId,
        source,
        confirmed,
      });
      return result.created;
    } catch (caught) {
      if (!isOfflineError(caught)) {
        throw caught;
      }
      enqueuePending(event.joinCode, {
        type: 'challenge',
        challengeId,
        targetParticipantId,
        source,
        confirmed,
      });
      return true;
    }
  }

  /*
    While a game is running the tracker is the entire screen. The event header
    and the match card are pre-game context, and on a phone they push the life
    counters below the fold.
  */
  if (participant && token && seated && participant.status === 'playing' && showTracker) {
    return (
      <>
        <TrackerView
          storageKey={`podyguard.tracker.${event?.joinCode ?? ''}.${matchTable?.id ?? participant.id}`}
          players={(snapshot?.participants ?? [])
            .filter((row) => row.tableLabel === participant.tableLabel)
            .map((row) => ({
              id: row.id,
              name: row.displayName,
              commanders: row.assignedCommanders ?? [],
            }))}
          onFinish={onTrackerFinished}
          onQuit={() => void navigate('/')}
          {...(commanderRules
            ? {
                challengeProgress,
                onChallengeComplete,
                challengePack: event?.challengePack ?? OFFICIAL_COMMANDER_CHALLENGES,
              }
            : {})}
          gameMode={event?.gameMode}
          rulesFormat={event?.rulesFormat}
          startingPlayerId={treacheryRole?.leaderParticipantId}
          revealedIdentities={Object.fromEntries(
            (snapshot?.participants ?? [])
              .filter((row) => row.revealedTreacheryIdentity)
              .map((row) => [row.id, row.revealedTreacheryIdentity!]),
          )}
          onCheckRole={
            treacheryRole
              ? () => {
                  setRoleRevealed(true);
                  setRoleOpen(true);
                }
              : undefined
          }
          roleCheckOpen={roleOpen && Boolean(treacheryRole)}
        />
        {roleOpen && treacheryRole ? (
          <TreacheryRoleDialog
            assignment={treacheryRole}
            revealed={roleRevealed}
            onReveal={() => setRoleRevealed(true)}
            onUnveil={
              participant.status === 'playing' ? onUnveilIdentity : undefined
            }
            onClose={() => {
              writeStored(
                treacheryRoleSeenKey(treacheryRole.podId, participant.id),
                'true',
              );
              setRoleOpen(false);
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <ThemeToggleCorner
        feedbackContext={{
          ...(participant ? { participantStatus: participant.status } : {}),
          ...(event ? { gameMode: event.gameMode } : {}),
        }}
      />
      <header>
        <Brand className="mb-6" />
        <h1 className="font-display mb-2 text-3xl font-bold tracking-tight">
          {event?.name ?? t('join.joinEvent')}
        </h1>
        <p className="text-muted mb-8 font-mono text-sm tracking-[0.28em] uppercase">
          {event?.joinCode ?? joinCode.toUpperCase()}
        </p>
      </header>

      {participant && token ? (
        <Panel
          title={participant.displayName}
          aside={<Badge tone={statusTone(participant.status)}>{participant.status}</Badge>}
        >
          {event?.tournament ? (
            <TournamentPlayerStatus
              event={event}
              participant={participant}
              tables={snapshot?.tables ?? []}
            />
          ) : null}
          {(participant.status === 'joined' ||
            participant.status === 'paused') &&
          (!event?.tournament ||
            event.tournament.phase === 'registration') ? (
            <div className="mb-4">
              <DeckEditor
                decks={decks}
                onChange={setDeckRows}
                disabled={busy}
                requireCommanders={commanderRules}
                searchProfile={commanderSearchProfile(event?.gameMode ?? 'commander')}
              />
              <Button
                type="button"
                variant="glass"
                size="sm"
                disabled={busy || !decksComplete}
                onClick={() => void onSaveDecks()}
              >
                {t('join.saveDecks')}
              </Button>
            </div>
          ) : null}
          {seated ? (
            <div className="border-neon/30 from-neon/10 mb-4 rounded-xl border bg-gradient-to-br to-transparent p-5">
              <p className="text-muted mb-1 text-center text-xs tracking-[0.2em] uppercase">
                {t('join.matchFound')}
              </p>
              <p className="font-display text-neon mb-1 text-center text-3xl font-bold">
                {participant.tableLabel}
              </p>
              <p className="mb-4 text-center text-sm">
                {poolLabel(participant.assignedPoolId ?? matchTable?.poolId ?? 'open')}
              </p>
              <ul className="mb-4 space-y-1 text-center text-sm">
                {(matchTable?.seatedNames.length
                  ? matchTable.seatedNames
                  : [participant.displayName]
                ).map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <p className="text-muted mb-1 text-center text-xs tracking-[0.16em] uppercase">
                {t('join.yourDeck')}
              </p>
              <p className="mb-4 text-center text-base font-medium">
                {assignedDeckLine(participant)}
              </p>
              {treacheryRole ? (
                <Button
                  variant="glass"
                  block
                  className="mb-3"
                  onClick={() => {
                    setRoleRevealed(true);
                    setRoleOpen(true);
                  }}
                >
                  {t('join.checkMyRole')}
                </Button>
              ) : null}
              {participant.status === 'playing' ? (
                <>
                  <p className="text-muted mb-3 text-center text-sm">
                    {participant.trackerUsed === false
                      ? t('join.playingWithoutTracker')
                      : t('join.chooseTracker')}
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="neon"
                      size="lg"
                      block
                      disabled={busy}
                      onClick={() => void onChooseTracker(true)}
                    >
                      {t('join.useGameTracker')}
                    </Button>
                    {participant.trackerUsed === undefined ? (
                      <Button
                        variant="glass"
                        block
                        disabled={busy}
                        onClick={() => void onChooseTracker(false)}
                      >
                        {t('join.playWithoutTracker')}
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-muted text-center text-sm">
                  {t('join.stayAtTable')}
                </p>
              )}
            </div>
          ) : event?.tournament &&
            event.tournament.phase !== 'registration' ? null : hasLeft ? (
            <div>
              <p className="text-muted mb-4 text-sm">{t('join.leftEvent')}</p>
              {/* The seat is gone, by their own hand or the host's, so the way
                  on is a fresh one rather than this panel for ever. */}
              <Button variant="neon" block onClick={onForgetSeat}>
                {t('join.joinAgain')}
              </Button>
            </div>
          ) : isReady ? (
            <>
              {participant.decks.length > 0 ? (
                <ul className="mb-4 space-y-1 text-sm">
                  {participant.decks.map((deck) => (
                    <li key={deck.id}>
                      {deck.name || poolLabel(deck.poolId)}
                      <span className="text-muted">
                        {' '}
                        {t('common.dash')} {poolLabel(deck.poolId)}
                        {deck.preference === 'preferred'
                          ? ` ${t('common.preferred')}`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted mb-4 text-sm">{t('join.openPool')}</p>
              )}
              <div className="mb-4 flex items-center gap-2.5">
                <span className="relative flex size-2">
                  <span className="bg-neon/60 absolute size-2 animate-ping rounded-full" />
                  <span className="bg-neon size-2 rounded-full" />
                </span>
                <p className="text-muted text-sm">
                  {t('join.ready')}
                  {participant.readyAt ? (
                    <>
                      {' '}
                      · {t('join.waiting')}{' '}
                      <WaitTime since={participant.readyAt} />
                    </>
                  ) : (
                    `. ${t('join.holdTight')}`
                  )}
                </p>
              </div>
              <p className="text-muted mb-4 text-sm">
                {t('join.flex', {
                  flex: participant.flexCredits,
                  points: participant.challengePoints ?? 0,
                })}
              </p>
              {askRating ? (
                <div className="mb-4">
                  <p className="text-muted mb-2 text-sm">{t('join.howWasPod')}</p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        [1, '😞'],
                        [2, '😐'],
                        [3, '🙂'],
                        [4, '😄'],
                      ] as Array<[PodRating, string]>
                    ).map(([rating, label]) => (
                      <Button
                        key={rating}
                        variant="glass"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            if (!event || !token) {
                              return;
                            }
                            try {
                              await ratePod(event.joinCode, token, rating);
                              setAskRating(false);
                            } catch (caught) {
                              if (isOfflineError(caught)) {
                                enqueuePending(event.joinCode, {
                                  type: 'pod-rating',
                                  rating,
                                });
                                setAskRating(false);
                                return;
                              }
                              setError(
                                caught instanceof ApiError
                                  ? caught.message
                                  : t('common.errors.saveRating'),
                              );
                            }
                          })();
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Button
                  variant="glass"
                  block
                  disabled={busy}
                  onClick={() => void onPause(true)}
                >
                  {t('join.pause')}
                </Button>
                <Button
                  variant="ghost"
                  block
                  disabled={busy}
                  onClick={() => void onLeave()}
                >
                  {t('join.leave')}
                </Button>
              </div>
            </>
          ) : isPaused ? (
            <>
              <p className="text-muted mb-4 text-sm">{t('join.pausedMessage')}</p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="neon"
                  size="lg"
                  block
                  disabled={busy}
                  onClick={() => void onReady(true)}
                >
                  {busy ? t('common.updating') : t('join.imReady')}
                </Button>
                <Button
                  variant="ghost"
                  block
                  disabled={busy}
                  onClick={() => void onLeave()}
                >
                  {t('join.leaveEvent')}
                </Button>
              </div>
            </>
          ) : participant.status === 'joined' ? (
            <>
              <p className="text-muted mb-4 text-sm">{t('join.markReady')}</p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="neon"
                  size="lg"
                  block
                  disabled={busy}
                  onClick={() => void onReady(true)}
                >
                  {busy ? t('common.updating') : t('join.imReady')}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    block
                    disabled={busy}
                    onClick={() => void onPause(true)}
                  >
                    {t('join.pause')}
                  </Button>
                  <Button
                    variant="ghost"
                    block
                    disabled={busy}
                    onClick={() => void onLeave()}
                  >
                    {t('join.leave')}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted text-sm">{t('join.matchingShortly')}</p>
          )}
        </Panel>
      ) : (
        <Panel title={t('join.takeSeat')} onSubmit={onJoin}>
          {event?.tournament &&
          event.tournament.phase !== 'registration' ? (
            <p className="text-muted text-sm">
              {t('tournament.registrationClosed')}
            </p>
          ) : (
            <>
              <Field
                label={t('join.displayName')}
                value={displayName}
                onChange={(change) => setDisplayName(change.target.value)}
                placeholder={t('join.displayNamePlaceholder')}
                autoComplete="nickname"
                required
              />
              <DeckEditor
                decks={decks}
                onChange={setDeckRows}
                disabled={busy}
                requireCommanders={commanderRules}
                searchProfile={
                  event ? commanderSearchProfile(event.gameMode) : 'commander'
                }
              />
              <Button
                type="submit"
                size="lg"
                block
                disabled={busy || !canJoin}
              >
                {busy ? t('common.joining') : t('join.joinEventButton')}
              </Button>
            </>
          )}
        </Panel>
      )}

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      {roleOpen && treacheryRole && participant ? (
        <TreacheryRoleDialog
          assignment={treacheryRole}
          revealed={roleRevealed}
          onReveal={() => setRoleRevealed(true)}
          onUnveil={
            participant.status === 'playing' ? onUnveilIdentity : undefined
          }
          onClose={() => {
            writeStored(
              treacheryRoleSeenKey(treacheryRole.podId, participant.id),
              'true',
            );
            setRoleOpen(false);
          }}
        />
      ) : null}

      <p className="text-muted/70 text-xs">
        <Link className="hover:text-ink" to="/">
          {t('common.home')}
        </Link>
        <span className="mx-2">·</span>
        <Link
          className="hover:text-ink"
          to={`/host/${event?.joinCode ?? joinCode}`}
        >
          {t('join.imTheHost')}
        </Link>
      </p>
    </>
  );
}

function treacheryRoleSeenKey(podId: string, participantId: string): string {
  return `podyguard.treachery-role-seen.${podId}.${participantId}`;
}
