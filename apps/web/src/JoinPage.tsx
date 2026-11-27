import { EventTableLink } from './table-view/EventTableLink';
import { EventTrackerSession, type TrackerIntent } from './table-view/EventTrackerSession';
import { Agreement } from './game-nights/Agreement';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DevicePlayers } from './DevicePlayers';
import { playerTabName } from './player-tabs';
import { createPlayerScope, listPlayerSessions, playerPath, playerScope, playerStorageCode } from './player-sessions';
import { useTranslation } from 'react-i18next';
import {
  OFFICIAL_COMMANDER_CHALLENGES,
  parseEventOperationMode,
  poolLabel,
  usesCommanderRules,
  commanderSearchProfile,
  type ChallengeDetectionMode,
  type EventSnapshot,
  type JoinGuestSuggestion,
  type JoinSavedDeckSuggestion,
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
  getJoinGuestDecks,
  getJoinSuggestions,
  getMyTreacheryRole,
  getMe,
  joinEvent,
  listParticipants,
  listTables,
  leaveEvent,
  loadAccountSession,
  loadAccountToken,
  loadPlayerSession,
  loadHostToken,
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
import { cx } from './ui/cx';
import { assignedDeckLine, tableForParticipant } from './match-view';
import { TrackerView } from './tracker/TrackerView';
import { commanderNames } from './scryfall';
import { TournamentPlayerStatus } from './tournament/TournamentPlayerStatus';
import { LimitedPlayerPanel } from './limited/LimitedPlayerPanel';
import { RoundPlayerStatus } from './rounds/RoundPlayerStatus';
import { eventHasLimitedQueues } from './event-mode';
import { shouldShowLimitedPlayerPanel } from './event-screens';
import { TreacheryRoleDialog } from './TreacheryRoleDialog';
import { useEventLive } from './useEventLive';
import { forgetActiveMatch, rememberActiveMatch } from './active-match';
import { removeRecentEvent } from './recent-events';
import { readStored, removeStored, writeStored } from './device-storage';
import {
  getSessionDiagnosticId,
  recordJoinBreadcrumb,
} from './join-diagnostics';
import {
  enqueuePending,
  clearPending,
  flushPending,
  isOfflineError,
  type PendingOp,
} from './offline-queue';

function joinDraftStorageKey(joinCode: string): string {
  return `podyguard.join.draft.${joinCode.trim().toUpperCase()}`;
}

function loadJoinDraft(joinCode: string): {
  displayName: string;
  decks: DeckFormRow[];
} {
  const raw = readStored(joinDraftStorageKey(joinCode));
  if (!raw) {
    return { displayName: '', decks: defaultDeckRows() };
  }
  try {
    const parsed = JSON.parse(raw) as {
      displayName?: string;
      decks?: DeckFormRow[];
    };
    return {
      displayName:
        typeof parsed.displayName === 'string' ? parsed.displayName : '',
      decks:
        Array.isArray(parsed.decks) && parsed.decks.length > 0
          ? parsed.decks
          : defaultDeckRows(),
    };
  } catch {
    return { displayName: '', decks: defaultDeckRows() };
  }
}

type HostShellBridge = {
  active: boolean;
  onOpenDesk: () => void;
  onTrackerActiveChange?: (active: boolean) => void;
};

type JoinPageProps = {
  /** Host desk embeds Play here so the organiser can join their own event. */
  embeddedHost?: HostShellBridge;
};

export function JoinPage(props: JoinPageProps = {}) {
  const { joinCode = '' } = useParams();
  const [search] = useSearchParams();
  const scope = props.embeddedHost ? '' : playerScope(search.get('seat'));
  // Give each identity a fresh form, role dialogs and connection lifecycle.
  return <PlayerJoinPage key={`${joinCode}:${scope}`} {...props} scope={scope} />;
}

function PlayerJoinPage({
  embeddedHost,
  scope,
}: JoinPageProps & { scope: string }) {
  const { t } = useTranslation();
  const { joinCode = '' } = useParams();
  const storageCode = playerStorageCode(joinCode, scope);
  useEffect(() => {
    if (embeddedHost) return;
    const name = playerTabName(joinCode, scope);
    window.name = name;
    return () => { if (window.name === name) window.name = ''; };
  }, [joinCode, scope, embeddedHost]);
  const navigate = useNavigate();
  const seatPath = playerPath(joinCode, scope);
  const hostPlayPath = `/host/${joinCode}?tab=play`;
  const resumePath = embeddedHost ? hostPlayPath : seatPath;
  const onOpenDesk = embeddedHost?.onOpenDesk ??
    (loadHostToken(joinCode) ? () => void navigate(`/host/${joinCode}`) : undefined);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [displayName, setDisplayName] = useState(
    () => loadJoinDraft(storageCode).displayName,
  );
  const [decks, setDeckRows] = useState<DeckFormRow[]>(
    () => loadJoinDraft(storageCode).decks,
  );
  const [participant, setParticipant] = useState<PublicParticipant | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [trackerGameId, setTrackerGameId] = useState<string | null>(null);
  const matchTable = tableForParticipant(snapshot, participant);
  const showTracker = Boolean(trackerGameId && trackerGameId === matchTable?.gameId && (embeddedHost?.active ?? true));
  const [trackerIntent, setTrackerIntent] = useState<TrackerIntent>({ mode: 'claim' });
  const [askRating, setAskRating] = useState(false);
  const [treacheryRole, setTreacheryRole] =
    useState<TreacheryRoleAssignment | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const rolePod = useRef<string | null>(null);
  const joinDraftKey = joinDraftStorageKey(storageCode);

  // Returning-player / playgroup identity state
  const [accountSession] = useState(() => scope ? null : loadAccountSession());
  const [suggestions, setSuggestions] = useState<JoinGuestSuggestion[]>([]);
  const [suggestionMode, setSuggestionMode] = useState<
    'none' | 'list' | 'search'
  >('none');
  const [suggestionSearch, setSuggestionSearch] = useState('');
  const [joinStep, setJoinStep] = useState<
    'choose-identity' | 'returning-decks' | 'new-player'
  >('new-player');
  const [selectedGuest, setSelectedGuest] =
    useState<JoinGuestSuggestion | null>(null);
  const [savedDecks, setSavedDecks] = useState<JoinSavedDeckSuggestion[]>([]);
  const [selectedSavedDeckId, setSelectedSavedDeckId] = useState<string | null>(
    null,
  );
  const [useDifferentDeck, setUseDifferentDeck] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    if (!joinCode || participant) {
      return;
    }
    writeStored(joinDraftKey, JSON.stringify({ displayName, decks }));
  }, [decks, displayName, joinCode, joinDraftKey, participant]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setEvent(null);
    setParticipant(null);
    setToken(null);
    const existing = loadPlayerSession(joinCode, scope);
    recordJoinBreadcrumb('EVENT_LOOKUP_STARTED');
    void getEvent(joinCode)
      .then(async (loaded) => {
        if (cancelled) {
          return;
        }
        recordJoinBreadcrumb('EVENT_LOOKUP_OK');
        const me = existing
          ? await getMe(loaded.joinCode, existing.token).catch((caught: unknown) => {
              if (caught instanceof ApiError && (caught.status === 401 || caught.status === 404)) return null;
              throw caught;
            })
          : null;
        if (cancelled) return;
        if (!existing || !me || me.participant.status === 'left') {
          if (existing) {
            if (loadPlayerSession(joinCode, scope)?.token === existing.token) {
              clearPlayerSession(joinCode, scope);
              clearPending(storageCode);
              removeRecentEvent(seatPath);
              forgetActiveMatch(resumePath);
            }
            setDisplayName(existing.displayName);
          }
          if (loaded.playgroupId && loaded.showReturningPlayerSuggestions !== false) {
            try {
              const sug = await getJoinSuggestions(loaded.joinCode);
              if (!cancelled && (sug.suggestions.length > 0 || sug.mode === 'search')) {
                setSuggestions(sug.suggestions);
                setSuggestionMode(sug.mode);
                setJoinStep('choose-identity');
              }
            } catch {
              /* Fall back to the standard join form. */
            }
          }
          if (!cancelled) setEvent(loaded);
          return;
        }
        const [roster, tableList] = await Promise.all([
          listParticipants(loaded.joinCode),
          listTables(loaded.joinCode),
        ]);
        if (!cancelled) {
          if (existing.eventName !== loaded.name) savePlayerSession(loaded.joinCode, { ...existing, eventName: loaded.name }, scope);
          setEvent(loaded);
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
          const restoredTable = tableForParticipant(
            { event: loaded, participants: roster.participants, tables: tableList.tables },
            me.participant,
          );
          const restoredTrackerKey = `podyguard.tracker.${loaded.joinCode}.${restoredTable?.id ?? me.participant.id}.${restoredTable?.playingStartedAt ?? 'pending'}${scope ? `.seat.${scope}` : ''}`;
          if (
            me.participant.status === 'playing' &&
            me.participant.trackerUsed === true &&
            // Table-wide tracker use is not evidence that THIS phone owns it.
            // Restore only a tracker snapshot already saved on this device.
            restoredTable?.gameId &&
            readStored(restoredTrackerKey) !== null &&
            (readStored(`${restoredTrackerKey}:controller-game`) ?? restoredTable.gameId) === restoredTable.gameId
          ) {
            setTrackerGameId(restoredTable.gameId);
          }
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        recordJoinBreadcrumb(
          'EVENT_LOOKUP_FAILED',
          caught instanceof ApiError ? caught.code : 'unknown',
        );
        if (caught instanceof ApiError && caught.status === 404) {
          for (const saved of listPlayerSessions(joinCode)) {
            clearPlayerSession(joinCode, saved.scope);
            clearPending(playerStorageCode(joinCode, saved.scope));
            const path = playerPath(joinCode, saved.scope);
            removeRecentEvent(path);
            forgetActiveMatch(path);
          }
          forgetActiveMatch(hostPlayPath);
          removeRecentEvent(seatPath);
          void navigate('/', { replace: true, state: { staleJoin: true } });
          return;
        }
        setError(
          caught instanceof ApiError
            ? `${caught.message} (${t('join.reference', { id: getSessionDiagnosticId() })})`
            : `${t('common.errors.eventNotFound')} (${t('join.reference', { id: getSessionDiagnosticId() })})`,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [joinCode, navigate, t, scope, storageCode, seatPath, resumePath, hostPlayPath]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${participant?.displayName ?? event?.name ?? 'PodyGuard'} · PodyGuard`;
    return () => { document.title = previous; };
  }, [participant?.displayName, event?.name]);

  const onSnapshot = useCallback((next: EventSnapshot) => {
    setSnapshot(next);
    setEvent(next.event);
    setParticipant((current) => {
      if (!current) {
        return current;
      }
      return next.participants.find((row) => row.id === current.id) ?? { ...current, status: 'left' };
    });
  }, []);

  useEffect(() => {
    if (participant?.status !== 'left') return;
    clearPlayerSession(joinCode, scope);
    clearPending(storageCode);
    removeRecentEvent(seatPath);
    forgetActiveMatch(resumePath);
    setParticipant(null);
    setToken(null);
  }, [participant?.status, joinCode, scope, storageCode, seatPath, resumePath]);

  const [liveRetryNonce, setLiveRetryNonce] = useState(0);

  // Tracker choice belongs to this game, not every future game at the table.
  useEffect(() => {
    if (participant?.status !== 'playing') setTrackerGameId(null);
  }, [participant?.status]);
  const liveStatus = useEventLive(
    event?.joinCode,
    Boolean(event && token),
    onSnapshot,
    liveRetryNonce,
  );

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
    const path = resumePath;
    if (participant.status === 'playing' && showTracker) {
      rememberActiveMatch(path, {
        format:
          event.rulesFormat === 'commander'
            ? `${event.gameMode} · Commander`
            : event.gameMode,
        eventName: event.name,
        tableLabel: participant.tableLabel,
        players: (snapshot?.participants ?? [])
          .filter((row) => row.tableLabel === participant.tableLabel)
          .map((row) => row.displayName),
      });
    } else if (participant.status !== 'playing') {
      forgetActiveMatch(path);
    }
  }, [event, participant, showTracker, snapshot, resumePath]);

  useEffect(() => {
    const onActiveChange = embeddedHost?.onTrackerActiveChange;
    onActiveChange?.(
      Boolean(
        participant &&
          participant.status === 'playing' &&
          showTracker,
      ),
    );
    return () => onActiveChange?.(false);
  }, [embeddedHost?.onTrackerActiveChange, participant?.status, showTracker]);

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
    void flushPending(storageCode, send);
    const onOnline = () => {
      void flushPending(storageCode, send);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [event, token, storageCode]);

  useEffect(() => {
    if (
      !event?.joinCode ||
      suggestionMode !== 'search' ||
      joinStep !== 'choose-identity'
    ) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getJoinSuggestions(event.joinCode, suggestionSearch)
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res.suggestions);
          }
        })
        .catch(() => {
          /* ignore search error */
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [event?.joinCode, joinStep, suggestionMode, suggestionSearch]);

  async function onPickGuestIdentity(guest: JoinGuestSuggestion) {
    if (!event) return;
    setError(null);
    setSelectedGuest(guest);
    setDisplayName(guest.displayName);
    setSelectedSavedDeckId(null);
    setUseDifferentDeck(false);
    try {
      const res = await getJoinGuestDecks(event.joinCode, guest.id);
      setSavedDecks(res.decks);
      const preferred =
        res.decks.find((d) => d.preferred) ?? res.decks[0] ?? null;
      if (preferred) {
        applySavedDeckSelection(preferred);
      } else {
        setUseDifferentDeck(true);
      }
      setJoinStep('returning-decks');
    } catch {
      setSavedDecks([]);
      setUseDifferentDeck(true);
      setJoinStep('returning-decks');
    }
  }

  function applySavedDeckSelection(deck: JoinSavedDeckSuggestion) {
    setSelectedSavedDeckId(deck.id);
    setUseDifferentDeck(false);
    setDeckRows([
      {
        name: deck.deckName ?? deck.commanderName ?? '',
        poolId: deck.poolId,
        preference: 'preferred',
        commanders: deck.commanders,
      },
    ]);
  }

  function onChooseDifferentDeck() {
    setSelectedSavedDeckId(null);
    setUseDifferentDeck(true);
    setDeckRows(defaultDeckRows());
  }

  function onChooseNewPlayer() {
    setSelectedGuest(null);
    setSelectedSavedDeckId(null);
    setUseDifferentDeck(false);
    setDisplayName('');
    setDeckRows(defaultDeckRows());
    setJoinStep('new-player');
  }

  async function onJoin(submit: FormEvent) {
    submit.preventDefault();
    if (busy || !event || !displayName.trim()) {
      return;
    }
    if (
      !limitedQueues &&
      commanderRules &&
      !selectedSavedDeckId &&
      decks.some((deck) => deck.commanders.length === 0)
    ) {
      setError(t('common.errors.chooseCommander'));
      return;
    }
    setBusy(true);
    setError(null);
    recordJoinBreadcrumb('JOIN_STARTED');
    try {
      const result = await joinEvent(
        event.joinCode,
        displayName,
        limitedQueues ? undefined : decks,
        {
          guestProfileId: selectedGuest?.id,
          savedDeckProfileId: selectedSavedDeckId ?? undefined,
          rememberMe: event.playgroupId ? rememberMe : undefined,
          accountToken: scope ? undefined : loadAccountToken() ?? undefined,
        },
      );
      recordJoinBreadcrumb('JOIN_OK');
      // Two fresh invitation tabs can submit before either has a saved seat.
      // The second response must not overwrite the first tab's recovery key.
      const joinedScope = loadPlayerSession(event.joinCode, scope) ? createPlayerScope() : scope;
      savePlayerSession(event.joinCode, {
        token: result.token,
        displayName: result.participant.displayName,
        eventName: event.name,
      }, joinedScope);
      removeStored(joinDraftKey);
      if (!mounted.current) return;
      if (joinedScope !== scope) {
        void navigate(playerPath(event.joinCode, joinedScope), { replace: true });
        return;
      }
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
      recordJoinBreadcrumb(
        'JOIN_FAILED',
        caught instanceof ApiError ? caught.code : 'unknown',
      );
      setError(
        caught instanceof ApiError
          ? `${caught.message} (${t('join.reference', { id: getSessionDiagnosticId() })})`
          : `${t('common.errors.joinEvent')} (${t('join.reference', { id: getSessionDiagnosticId() })})`,
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
      // Readiness must refer to the deck currently shown in the form. Saving is
      // deliberately awaited: a failed bracket/Commander update must not queue
      // the participant using their previous deck.
      if (ready && !limitedQueues) {
        if (commanderRules && decks.some(deck => deck.commanders.length === 0)) {
          setError(t('common.errors.chooseCommander'));
          return;
        }
        await setDecks(event.joinCode, token, decks);
      }
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
    clearPlayerSession(code, scope);
    clearPending(storageCode);
    forgetActiveMatch(resumePath);
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
      if (trackerUsed && matchTable?.gameId) {
        setTrackerIntent({ mode: 'claim' });
        setTrackerGameId(matchTable.gameId);
      }
    } catch (caught) {
      if (isOfflineError(caught)) {
        if (trackerUsed) {
          setError(t('eventTracker.offline'));
          return;
        }
        enqueuePending(storageCode, {
          type: 'tracker-choice',
          trackerUsed,
        });
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
    saved?: { participant: PublicParticipant },
  ) {
    if (!event || !token) {
      throw new Error(t('common.errors.sessionUnavailable'));
    }
    try {
      const result = saved ?? await reportGameResult(
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
      enqueuePending(storageCode, {
        type: 'result',
        winnerParticipantId: winnerId,
        durationSeconds,
      });
    }
    setTrackerGameId(null);
    setAskRating(true);
    forgetActiveMatch(resumePath);
  }

  const limitedQueues = eventHasLimitedQueues(event ?? {});
  const commanderRules =
    !limitedQueues &&
    usesCommanderRules(event?.gameMode ?? 'commander', event?.rulesFormat);
  const isReady = participant?.status === 'ready';
  const isPaused = participant?.status === 'paused';
  const hasLeft = participant?.status === 'left';
  const seated = Boolean(participant?.tableLabel);
  const decksComplete =
    decks.length > 0 &&
    (commanderRules
      ? decks.every((deck) => deck.commanders.length > 0)
      : decks.every((deck) => deck.poolId.trim().length > 0));
  // Limited nights only need a display name — Sealed/Draft have no commanders.
  const canJoin =
    Boolean(event) &&
    displayName.trim().length > 0 &&
    (limitedQueues || decksComplete);
  // A physical table is reused throughout the evening. Each started game needs
  // its own saved tracker, while refreshes during that game keep the same key.
  const trackerKey = `podyguard.tracker.${event?.joinCode ?? ''}.${matchTable?.id ?? participant?.id ?? ''}.${matchTable?.playingStartedAt ?? 'pending'}${scope ? `.seat.${scope}` : ''}`;
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
      enqueuePending(storageCode, {
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
  if (participant && token && seated && participant.status === 'playing' && matchTable?.gameId && showTracker) {
    return (
      <>
        <EventTrackerSession key={`${trackerKey}:${matchTable?.gameId}:${trackerIntent.mode}:${trackerIntent.generation ?? ''}`}
          joinCode={event!.joinCode} token={token} storageKey={trackerKey} intent={trackerIntent}
          gameId={matchTable.gameId}
          players={(snapshot?.participants ?? []).filter(row => row.tableLabel === participant.tableLabel).map(row => ({ id: row.id, name: row.displayName, commanders: row.assignedCommanders ?? [] }))}
          gameMode={event!.gameMode} rulesFormat={event!.rulesFormat}
          onClose={() => setTrackerGameId(null)}>
        {controller => <TrackerView
          controller={controller}
          key={trackerKey}
          playerControls={<DevicePlayers joinCode={joinCode} scope={scope} displayName={participant.displayName} onOpenDesk={embeddedHost?.onOpenDesk} />}
          resumePath={resumePath}
          eventContext={event && token ? { joinCode: event.joinCode, token } : undefined}
          storageKey={trackerKey}
          players={(snapshot?.participants ?? [])
            .filter((row) => row.tableLabel === participant.tableLabel)
            .map((row) => ({
              id: row.id,
              name: row.displayName,
              commanders: row.assignedCommanders ?? [],
            }))}
          finishLabel={event?.tournament ? t('tracker.recordGameResult') : undefined}
          onFinish={async (winner, duration) => onTrackerFinished(winner, duration, await controller.finish(winner, duration))}
          onQuit={() => {
            if (embeddedHost) {
              setTrackerGameId(null);
              embeddedHost.onOpenDesk();
              return;
            }
            void navigate('/');
          }}
          onOpenDesk={onOpenDesk && (() => {
            setTrackerGameId(null);
            onOpenDesk();
          })}
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
        />}
        </EventTrackerSession>
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
      {!embeddedHost ? (
        <ThemeToggleCorner
          feedbackContext={{
            ...(participant ? { participantStatus: participant.status } : {}),
            ...(event ? { gameMode: event.gameMode } : {}),
          }}
        />
      ) : null}
      {!embeddedHost && <header>
        <Brand className="mb-6" />
        <h1 className="font-display mb-2 text-3xl font-bold tracking-tight">
          {event?.name ?? t('join.joinEvent')}
        </h1>
        <p className="text-muted mb-8 font-mono text-sm tracking-[0.28em] uppercase">
          {event?.joinCode ?? joinCode.toUpperCase()}
        </p>
      </header>}

      <Agreement agreement={event?.pregameAgreement} />

      {event && <DevicePlayers joinCode={event.joinCode} scope={scope} displayName={participant?.displayName} onOpenDesk={embeddedHost?.onOpenDesk} />}

      {participant && token ? (
        <Panel
          title={participant.displayName}
          aside={<Badge tone={statusTone(participant.status)}>{participant.status}</Badge>}
        >
          {liveStatus === 'failed' || liveStatus === 'reconnecting' ? (
            <div className="border-warning/40 bg-warning/10 mb-4 rounded-xl border px-3 py-2 text-sm">
              <p className="text-warning mb-2">
                {liveStatus === 'reconnecting'
                  ? t('join.liveReconnecting')
                  : t('join.liveUnavailable')}
              </p>
              <p className="text-muted mb-2 text-xs">
                {t('join.reference', { id: getSessionDiagnosticId() })}
              </p>
              <Button
                variant="glass"
                size="sm"
                onClick={() => setLiveRetryNonce((value) => value + 1)}
              >
                {t('join.retryLive')}
              </Button>
            </div>
          ) : null}
          {event?.tournament ? (
            <TournamentPlayerStatus
              event={event}
              participant={participant}
              tables={snapshot?.tables ?? []}
            />
          ) : null}
          {event && parseEventOperationMode(event.operationMode) === 'ROUNDS' ? (
            <RoundPlayerStatus
              event={event}
              participant={participant}
              participants={snapshot?.participants ?? [participant]}
              busy={busy}
              onLeave={() => void onLeave()}
            />
          ) : null}
          {(participant.status === 'joined' ||
            participant.status === 'paused') &&
          !limitedQueues &&
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
                  {event && token && matchTable?.gameId ? (
                    <EventTableLink joinCode={event.joinCode} token={token} gameId={matchTable.gameId} storageKey={trackerKey} busy={busy}
                      onStart={() => void onChooseTracker(true)}
                      onView={() => { setTrackerIntent({ mode: 'view' }); setTrackerGameId(matchTable.gameId!); }}
                      onTransfer={(generation, id) => { setTrackerIntent({ mode: 'transfer', generation, id }); setTrackerGameId(matchTable.gameId!); }}
                      onWithout={participant.trackerUsed === undefined ? () => void onChooseTracker(false) : undefined} />
                  ) : null}
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
          ) : parseEventOperationMode(event?.operationMode) === 'ROUNDS' ? null : limitedQueues ? (
            <>
              <p className="text-muted mb-4 text-sm">
                The Limited panel below is the step you are on. The host sees you as soon as you join.
              </p>
              <Button
                variant="ghost"
                block
                disabled={busy}
                onClick={() => void onLeave()}
              >
                {t('join.leaveEvent')}
              </Button>
            </>
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
                                enqueuePending(storageCode, {
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
          ) : isPaused && !limitedQueues ? (
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
          ) : participant.status === 'joined' && !limitedQueues ? (
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
      ) : joinStep === 'choose-identity' &&
        (suggestions.length > 0 || suggestionMode === 'search') ? (
        <Panel
          title={`Welcome to ${event?.name ?? t('join.joinEvent')}`}
          aside={event?.playgroupName ?? 'Played here before?'}
        >
          <p className="text-muted mb-3 text-sm font-medium">
            Played here before? Who are you?
          </p>
          {suggestionMode === 'search' ? (
            <Field
              label="Search your name"
              value={suggestionSearch}
              onChange={(e) => setSuggestionSearch(e.target.value)}
              placeholder="Start typing your name..."
              autoComplete="off"
            />
          ) : null}
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {suggestions.map((guest) => (
              <button
                key={guest.id}
                type="button"
                onClick={() => void onPickGuestIdentity(guest)}
                className="border-muted/25 bg-void/60 hover:border-neon hover:bg-neon/10 flex items-center justify-between rounded-xl border px-4 py-3 text-left text-base font-semibold transition"
              >
                <span>{guest.displayName}</span>
                <span className="text-neon text-xs">Select →</span>
              </button>
            ))}
          </div>
          {accountSession ? (
            <Button
              type="button"
              variant="glass"
              block
              className="mb-2"
              onClick={() => {
                setSelectedGuest(null);
                setSelectedSavedDeckId(null);
                setDisplayName(accountSession.account.displayName);
                setJoinStep('new-player');
              }}
            >
              Join as {accountSession.account.displayName} (Host / Account)
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            block
            onClick={onChooseNewPlayer}
          >
            I&apos;m new here
          </Button>
        </Panel>
      ) : joinStep === 'returning-decks' && selectedGuest ? (
        <Panel
          title={`Welcome back, ${selectedGuest.displayName}`}
          aside="Returning player"
          onSubmit={onJoin}
        >
          {!limitedQueues && savedDecks.length > 0 && !useDifferentDeck ? (
            <div className="mb-4 space-y-2.5">
              <p className="text-muted text-sm">What are you playing tonight?</p>
              <div className="grid gap-2">
                {savedDecks.map((deck) => {
                  const active = selectedSavedDeckId === deck.id;
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      onClick={() => applySavedDeckSelection(deck)}
                      className={cx(
                        'flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition',
                        active
                          ? 'border-neon bg-neon/15 shadow-[0_0_24px_-12px_var(--color-neon)]'
                          : 'border-muted/20 bg-void/60 hover:border-muted/40',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-display truncate text-base font-bold">
                          {commanderNames(deck.commanders, deck.commanderName || deck.deckName || 'Saved Deck')}
                        </p>
                        <p className="text-muted text-xs">
                          {deck.bracket
                            ? `Bracket ${deck.bracket}`
                            : poolLabel(deck.poolId)}
                          {deck.deckName && deck.commanderName
                            ? ` · ${deck.deckName}`
                            : ''}
                          {deck.lastUsedAt
                            ? ` · Last used ${new Date(
                                deck.lastUsedAt,
                              ).toLocaleDateString()}`
                            : ''}
                        </p>
                      </div>
                      <Badge tone={active ? 'live' : 'idle'}>
                        {deck.bracket
                          ? `B${deck.bracket}`
                          : poolLabel(deck.poolId)}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onChooseDifferentDeck}
              >
                Different deck
              </Button>
            </div>
          ) : !limitedQueues ? (
            <div className="mb-4">
              {savedDecks.length > 0 ? (
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-muted text-xs">
                    Registering a new deck for {selectedGuest.displayName}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const first = savedDecks[0];
                      if (first) applySavedDeckSelection(first);
                    }}
                  >
                    ← Use saved deck
                  </Button>
                </div>
              ) : null}
              <DeckEditor
                decks={decks}
                onChange={setDeckRows}
                disabled={busy}
                requireCommanders={commanderRules}
                searchProfile={
                  event ? commanderSearchProfile(event.gameMode) : 'commander'
                }
              />
            </div>
          ) : (
            <p className="text-muted mb-4 text-sm">{t('join.limitedNameOnly')}</p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              variant="neon"
              size="lg"
              block
              disabled={busy || (!selectedSavedDeckId && !canJoin)}
            >
              {busy ? t('common.joining') : t('join.joinEventButton')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setJoinStep('choose-identity')}
            >
              Not {selectedGuest.displayName}? Switch player
            </Button>
          </div>
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
              {suggestions.length > 0 || suggestionMode === 'search' ? (
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="text-muted">Joining as a new player</span>
                  <button
                    type="button"
                    className="text-neon font-semibold hover:underline"
                    onClick={() => setJoinStep('choose-identity')}
                  >
                    ← Played here before?
                  </button>
                </div>
              ) : null}
              {accountSession && !displayName ? (
                <div className="mb-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="glass"
                    onClick={() =>
                      setDisplayName(accountSession.account.displayName)
                    }
                  >
                    Use my account name ({accountSession.account.displayName})
                  </Button>
                </div>
              ) : null}
              <Field
                label={t('join.displayName')}
                value={displayName}
                onChange={(change) => setDisplayName(change.target.value)}
                placeholder={t('join.displayNamePlaceholder')}
                autoComplete="nickname"
                required
              />
              {limitedQueues ? (
                <p className="text-muted mb-4 text-sm">{t('join.limitedNameOnly')}</p>
              ) : (
                <DeckEditor
                  decks={decks}
                  onChange={setDeckRows}
                  disabled={busy}
                  requireCommanders={commanderRules}
                  searchProfile={
                    event ? commanderSearchProfile(event.gameMode) : 'commander'
                  }
                />
              )}
              {event?.playgroupId ? (
                <label className="text-muted mb-4 flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="accent-neon"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Remember me for future games with this group
                </label>
              ) : null}
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

      {shouldShowLimitedPlayerPanel(event, {
        participant,
        token,
        snapshot,
      }) ? (
        <LimitedPlayerPanel
          onOpenDesk={onOpenDesk}
          snapshot={snapshot!}
          participant={participant!}
          token={token!}
          onSnapshot={onSnapshot}
          onError={setError}
          onReady={onReady}
        />
      ) : null}

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
        {embeddedHost ? (
          <button
            type="button"
            className="hover:text-ink"
            onClick={embeddedHost.onOpenDesk}
          >
            {t('host.deskTab')}
          </button>
        ) : (
          <Link
            className="hover:text-ink"
            to={`/host/${event?.joinCode ?? joinCode}`}
          >
            {t('join.imTheHost')}
          </Link>
        )}
      </p>
    </>
  );
}

function treacheryRoleSeenKey(podId: string, participantId: string): string {
  return `podyguard.treachery-role-seen.${podId}.${participantId}`;
}
