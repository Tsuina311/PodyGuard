import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  draftPackDirection,
  limitedModeConfig,
  type LimitedMatchOutcome,
} from '@podyguard/shared';
import { Brand } from '../ui/Brand';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Panel } from '../ui/Panel';
import { ThemeToggleCorner } from '../ui/ThemeToggle';
import { LimitedTimerDisplay } from './LimitedTimerDisplay';
import { LIMITED_MODE_LABELS } from './limited-view';
import {
  cancelLocalLimitedSession,
  clearLocalLimitedSession,
  completeLocalLimitedSession,
  finishLocalDraft,
  launchLocalLimitedSession,
  loadLocalLimitedSession,
  localLimitedSessionActive,
  localLimitedStandings,
  pauseLocalLimitedTimer,
  renameLocalParticipant,
  reportLocalLimitedResult,
  resumeLocalLimitedTimer,
  startLocalLimitedRound,
  type LocalLimitedSession,
} from './local-limited';

function playerName(
  session: LocalLimitedSession,
  participantId: string | undefined,
): string {
  if (!participantId) {
    return 'Bye';
  }
  return (
    session.participants.find(
      (participant) => participant.participantId === participantId,
    )?.displayName ?? 'Unknown player'
  );
}

export function LocalLimitedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [session, setSession] = useState<LocalLimitedSession | null>(() =>
    loadLocalLimitedSession(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      void navigate('/', { replace: true });
    }
  }, [navigate, session]);

  if (!session) {
    return null;
  }

  function apply(next: () => LocalLimitedSession) {
    setError(null);
    try {
      setSession(next());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('common.errors.generic'),
      );
    }
  }

  const modeConfig = limitedModeConfig(session.config.mode);
  const standings = localLimitedStandings(session);
  const activeRound = session.rounds.find(
    (round) => round.number === session.currentRound,
  );
  const active = localLimitedSessionActive(session);

  return (
    <>
      <ThemeToggleCorner />
      <header>
        <Brand className="mb-6" />
        <h1 className="font-display mb-2 text-3xl font-bold tracking-tight">
          {LIMITED_MODE_LABELS[session.config.mode]}
        </h1>
        <p className="text-muted mb-6 text-sm">
          {t('localLimited.summary', {
            count: session.config.playerCount,
            structure: session.config.matchStructure,
            rounds: session.totalRounds,
          })}
        </p>
      </header>

      {session.timer ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <LimitedTimerDisplay timer={session.timer} />
          {session.timer.status === 'RUNNING' ? (
            <Button
              size="sm"
              variant="glass"
              onClick={() => apply(() => pauseLocalLimitedTimer(session))}
            >
              {t('localLimited.pauseTimer')}
            </Button>
          ) : null}
          {session.timer.status === 'PAUSED' ? (
            <Button
              size="sm"
              variant="glass"
              onClick={() => apply(() => resumeLocalLimitedTimer(session))}
            >
              {t('localLimited.resumeTimer')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {session.status === 'FORMING' || session.status === 'SEATING' ? (
        <Panel title={t('localLimited.roster')} aside={t('localLimited.noTables')}>
          <p className="text-muted mb-3 text-sm">
            {t('localLimited.rosterHint')}
          </p>
          <div className="mb-4 space-y-2">
            {session.participants.map((participant, index) => (
              <Field
                key={participant.participantId}
                label={t('common.player', { number: index + 1 })}
                value={participant.displayName}
                onChange={(event) =>
                  apply(() =>
                    renameLocalParticipant(
                      session,
                      participant.participantId,
                      event.target.value,
                    ),
                  )
                }
              />
            ))}
          </div>
          <Button
            variant="neon"
            size="lg"
            block
            onClick={() => apply(() => launchLocalLimitedSession(session))}
          >
            {modeConfig.hasDraftPhase
              ? t('localLimited.startDraft')
              : t('localLimited.startDeckbuilding')}
          </Button>
        </Panel>
      ) : null}

      {session.status === 'DRAFTING' ? (
        <Panel title={t('localLimited.drafting')} aside={t('localLimited.passPacks')}>
          <p className="text-muted mb-3 text-sm">
            {t('localLimited.draftHint', {
              packs: modeConfig.boosterPacksPerPlayer,
              cards: modeConfig.cardsPerPick ?? 1,
            })}
          </p>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">
            {session.draftPod?.seats
              .slice()
              .sort((left, right) => left.seat - right.seat)
              .map((seat) => (
                <li key={seat.participantId}>
                  {playerName(session, seat.participantId)}{' '}
                  <span className="text-muted">
                    ({t('localLimited.seat', { seat: seat.seat })})
                  </span>
                </li>
              ))}
          </ol>
          <p className="text-muted mb-4 text-xs">
            {t('localLimited.packDirections', {
              one: draftPackDirection(1),
              two: draftPackDirection(2),
              three: draftPackDirection(3),
            })}
          </p>
          <Button
            variant="neon"
            size="lg"
            block
            onClick={() => apply(() => finishLocalDraft(session))}
          >
            {t('localLimited.finishDraft')}
          </Button>
        </Panel>
      ) : null}

      {session.status === 'DECKBUILDING' ? (
        <Panel title={t('localLimited.deckbuilding')}>
          <p className="text-muted mb-4 text-sm">
            {t('localLimited.deckbuildingHint', {
              cards: modeConfig.minimumDeckCards,
            })}
          </p>
          <Button
            variant="neon"
            size="lg"
            block
            onClick={() => apply(() => startLocalLimitedRound(session))}
          >
            {t('localLimited.startRound', { round: 1 })}
          </Button>
        </Panel>
      ) : null}

      {session.status === 'BETWEEN_ROUNDS' ? (
        <Panel title={t('localLimited.betweenRounds')}>
          <StandingsList standings={standings} />
          <Button
            variant="neon"
            size="lg"
            block
            className="mt-4"
            onClick={() => apply(() => startLocalLimitedRound(session))}
          >
            {t('localLimited.startRound', {
              round: (session.currentRound ?? 0) + 1,
            })}
          </Button>
        </Panel>
      ) : null}

      {session.status === 'ROUND_ACTIVE' && activeRound ? (
        <Panel
          title={t('localLimited.roundTitle', {
            round: activeRound.number,
            total: session.totalRounds,
          })}
        >
          <div className="mb-4 space-y-3">
            {activeRound.matches.map((match) => {
              const a = playerName(session, match.playerAId);
              const b = match.playerBId
                ? playerName(session, match.playerBId)
                : t('localLimited.bye');
              return (
                <div
                  key={match.id}
                  className="rounded-xl border border-white/10 p-3"
                >
                  <p className="mb-2 text-sm font-semibold">
                    {a}{' '}
                    <span className="text-muted font-normal">
                      {t('common.versus')}
                    </span>{' '}
                    {b}
                  </p>
                  {match.outcome === 'BYE' ? (
                    <p className="text-muted text-xs">{t('localLimited.bye')}</p>
                  ) : match.status === 'COMPLETED' ? (
                    <p className="text-xs">
                      {match.outcome === 'PLAYER_A_WIN'
                        ? t('localLimited.winner', { name: a })
                        : match.outcome === 'PLAYER_B_WIN'
                          ? t('localLimited.winner', { name: b })
                          : match.outcome === 'DRAW'
                            ? t('localLimited.draw')
                            : t('localLimited.doubleLoss')}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ['PLAYER_A_WIN', a],
                          ['PLAYER_B_WIN', b],
                          ['DRAW', t('localLimited.draw')],
                          ['DOUBLE_LOSS', t('localLimited.doubleLoss')],
                        ] as const
                      ).map(([outcome, label]) => (
                        <Button
                          key={outcome}
                          size="sm"
                          variant="glass"
                          onClick={() =>
                            apply(() =>
                              reportLocalLimitedResult(
                                session,
                                match.id,
                                outcome as Exclude<LimitedMatchOutcome, 'BYE'>,
                              ),
                            )
                          }
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <StandingsList standings={standings} />
        </Panel>
      ) : null}

      {session.status === 'COMPLETED' || session.status === 'CANCELLED' ? (
        <Panel
          title={
            session.status === 'COMPLETED'
              ? t('localLimited.completed')
              : t('localLimited.cancelled')
          }
        >
          <StandingsList standings={standings} />
          <Button
            variant="neon"
            size="lg"
            block
            className="mt-4"
            onClick={() => {
              clearLocalLimitedSession();
              void navigate('/');
            }}
          >
            {t('common.home')}
          </Button>
        </Panel>
      ) : null}

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      {active ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {session.status === 'ROUND_ACTIVE' ? (
            <Button
              size="sm"
              variant="glass"
              onClick={() =>
                apply(() => completeLocalLimitedSession(session))
              }
            >
              {t('localLimited.endEarly')}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="glass"
            onClick={() => {
              apply(() => cancelLocalLimitedSession(session));
              clearLocalLimitedSession();
              void navigate('/');
            }}
          >
            {t('localLimited.cancelPod')}
          </Button>
          <Link className="text-muted self-center text-xs hover:underline" to="/">
            {t('common.home')}
          </Link>
        </div>
      ) : null}
    </>
  );
}

function StandingsList({
  standings,
}: {
  standings: ReturnType<typeof localLimitedStandings>;
}) {
  const { t } = useTranslation();
  if (standings.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
        {t('localLimited.standings')}
      </p>
      <ol className="space-y-1 text-sm">
        {standings.map((row) => (
          <li key={row.participantId} className="flex justify-between gap-3">
            <span>
              {row.rank}. {row.displayName}
            </span>
            <span className="text-muted font-mono text-xs">
              {row.points} pts · {row.matchWins}-{row.matchLosses}-{row.draws}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
