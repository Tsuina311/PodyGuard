import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  challengeById,
  poolLabel,
  type PublicParticipant,
} from '@podyguard/shared';
import { loadMatchConfig, matchPlayers, trackerStorageKey } from './match-config';
import { assignedDeckLine } from './match-view';
import { TrackerView } from './tracker/TrackerView';
import { Badge, statusTone } from './ui/Badge';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import { ThemeToggleCorner } from './ui/ThemeToggle';
import { forgetActiveMatch, rememberActiveMatch } from './active-match';

/**
 * The seated-player screen with a fabricated pod behind it, so the real thing
 * can be checked on a phone without hosting an event or running the matcher.
 * Markup mirrors the playing state of JoinPage; every setting lives on
 * `/match-config` so nothing dev-only reaches this route.
 */
export function MatchSandboxPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = useMemo(() => loadMatchConfig(), []);
  const players = matchPlayers(config);
  const [showTracker, setShowTracker] = useState(true);
  const [challengeProgress, setChallengeProgress] = useState<
    Record<string, { points: number; completedChallengeIds: string[] }>
  >({});

  useEffect(() => {
    if (showTracker) {
      rememberActiveMatch('/match');
    }
  }, [showTracker]);

  const participant: PublicParticipant = {
    id: players[0]?.id ?? 'sandbox-1',
    displayName: players[0]?.name ?? 'Player 1',
    status: 'playing',
    isBot: false,
    tableLabel: config.tableLabel,
    decks: [],
    assignedPoolId: config.poolId,
    assignedDeckName: config.deckName.trim() || undefined,
    assignedCommanders: players[0]?.commanders ?? [],
    flexCredits: 0,
    challengePoints: 0,
    challengeCompletions: [],
  };

  // Mirrors JoinPage: a running game hands the whole screen to the tracker.
  if (showTracker) {
    return (
      <TrackerView
        storageKey={trackerStorageKey(config)}
        gameMode={config.gameMode}
        rulesFormat={config.rulesFormat}
        dealTreachery={config.gameMode === 'treachery'}
        players={players}
        requeueOnFinish={false}
        onFinish={async () => {
          forgetActiveMatch('/match');
          void navigate('/');
        }}
        onQuit={() => void navigate('/')}
        challengeProgress={challengeProgress}
        onChallengeComplete={async (challengeId, participantId) => {
          const challenge = challengeById(challengeId);
          if (!challenge) {
            return false;
          }
          const row = challengeProgress[participantId] ?? {
            points: 0,
            completedChallengeIds: [],
          };
          if (row.completedChallengeIds.includes(challengeId)) {
            return false;
          }
          setChallengeProgress({
            ...challengeProgress,
            [participantId]: {
              points: row.points + challenge.points,
              completedChallengeIds: [...row.completedChallengeIds, challengeId],
            },
          });
          return true;
        }}
      />
    );
  }

  return (
    <>
      <ThemeToggleCorner
        feedbackContext={{
          participantStatus: participant.status,
          gameMode: config.gameMode,
        }}
      />
      <header>
        <Brand className="mb-6" />
        <h1 className="font-display mb-2 text-3xl font-bold tracking-tight">
          {config.eventName}
        </h1>
        <p className="text-muted mb-8 font-mono text-sm tracking-[0.28em] uppercase">
          {config.joinCode.toUpperCase()}
        </p>
      </header>

      <Panel
        title={participant.displayName}
        aside={
          <Badge tone={statusTone(participant.status)}>
            {participant.status}
          </Badge>
        }
      >
        <div className="border-neon/30 from-neon/10 mb-4 rounded-xl border bg-gradient-to-br to-transparent p-5">
          <p className="text-muted mb-1 text-center text-xs tracking-[0.2em] uppercase">
            {t('join.matchFound')}
          </p>
          <p className="font-display text-neon mb-1 text-center text-3xl font-bold">
            {participant.tableLabel}
          </p>
          <p className="mb-4 text-center text-sm">{poolLabel(config.poolId)}</p>
          <ul className="mb-4 space-y-1 text-center text-sm">
            {players.map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
          </ul>
          <p className="text-muted mb-1 text-center text-xs tracking-[0.16em] uppercase">
            {t('join.yourDeck')}
          </p>
          <p className="mb-4 text-center text-base font-medium">
            {assignedDeckLine(participant)}
          </p>
          <p className="text-muted mb-3 text-center text-sm">
            {t('join.stayAtTable')}
          </p>
          <Button
            variant="neon"
            size="lg"
            block
            onClick={() => setShowTracker(true)}
          >
            {t('join.useGameTracker')}
          </Button>
        </div>
      </Panel>

      <p className="text-muted/70 text-xs">
        <Link className="hover:text-ink" to="/">
          {t('common.home')}
        </Link>
        <span className="mx-2">·</span>
        <Link className="hover:text-ink" to={`/host/${config.joinCode}`}>
          {t('join.imTheHost')}
        </Link>
      </p>
    </>
  );
}
