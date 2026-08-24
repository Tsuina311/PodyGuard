import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { COMMANDER_POOLS } from '@podyguard/shared';
import { CommanderPicker } from './CommanderPicker';
import {
  loadMatchConfig,
  matchPlayers,
  saveMatchConfig,
  trackerStorageKey,
  SEAT_COUNTS,
  type MatchConfig,
} from './match-config';
import { Badge } from './ui/Badge';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import { ThemeToggleCorner } from './ui/ThemeToggle';
import { cx } from './ui/cx';
import { canHaveSecondCommander } from './scryfall';

const inputClass =
  'h-10 w-full rounded-lg border border-muted/20 bg-void/70 px-3 text-sm outline-none placeholder:text-muted/50 focus:border-neon/70';

/**
 * Every knob for the local match harness. Kept on its own route so `/match`
 * renders nothing a real seated player would not see.
 */
export function MatchConfigPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MatchConfig>(() => loadMatchConfig());
  const players = matchPlayers(config);

  function update(patch: Partial<MatchConfig>) {
    setConfig((current) => {
      const next = { ...current, ...patch };
      saveMatchConfig(next);
      return next;
    });
  }

  function resetGame() {
    sessionStorage.removeItem(trackerStorageKey(config));
    update({ resetCount: config.resetCount + 1 });
  }

  function renameSeat(index: number, value: string) {
    const names = [...config.names];
    names[index] = value;
    update({ names });
  }

  function setSeatCommanders(
    index: number,
    commanders: MatchConfig['commanders'][number],
  ) {
    const next = [...config.commanders];
    next[index] = commanders;
    update({ commanders: next });
  }

  return (
    <>
      <ThemeToggleCorner />
      <header>
        <Brand className="mb-6" />
        <div className="mb-2 flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Match config
          </h1>
          <Badge tone="dev">dev</Badge>
        </div>
        <p className="text-muted mb-8 text-sm">
          Sets up the fake seated pod behind <code>/match</code>. Nothing here
          touches the server, and none of it appears on the battle screen, so
          that route can be checked on a phone as-is.
        </p>
      </header>

      <Panel title="Pod setup" aside={`${String(config.seatCount)} seats`}>
        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          Seats
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {SEAT_COUNTS.map((count) => (
            <Button
              key={count}
              size="sm"
              variant={config.seatCount === count ? 'neon' : 'glass'}
              onClick={() => update({ seatCount: count })}
            >
              {count}
            </Button>
          ))}
        </div>

        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          Bracket
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[...COMMANDER_POOLS, { id: 'open', short: 'Open' }].map((pool) => (
            <button
              key={pool.id}
              type="button"
              className={cx(
                'rounded-lg border px-2 py-1 font-mono text-xs tracking-wide',
                config.poolId === pool.id
                  ? 'border-neon/60 bg-neon/15 text-neon'
                  : 'border-muted/20 text-muted hover:border-muted/35 hover:text-ink',
              )}
              onClick={() => update({ poolId: pool.id })}
            >
              {pool.short}
            </button>
          ))}
        </div>

        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          Players
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {players.map((player, index) => (
            <div key={player.id} className="space-y-2">
              <input
                className={inputClass}
                value={config.names[index] ?? ''}
                placeholder={`Player ${String(index + 1)}`}
                onChange={(change) => renameSeat(index, change.target.value)}
              />
              <CommanderPicker
                label="Commander"
                value={player.commanders[0] ?? null}
                onChange={(commander) =>
                  setSeatCommanders(index, commander ? [commander] : [])
                }
              />
              {player.commanders[0] &&
              (player.commanders[1] ||
                canHaveSecondCommander(player.commanders[0])) ? (
                <CommanderPicker
                  label="Second commander"
                  value={player.commanders[1] ?? null}
                  partnerFor={player.commanders[0]}
                  onChange={(commander) =>
                    setSeatCommanders(
                      index,
                      commander
                        ? [player.commanders[0]!, commander]
                        : [player.commanders[0]!],
                    )
                  }
                />
              ) : null}
            </div>
          ))}
        </div>

        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          Header
        </p>
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            value={config.eventName}
            placeholder="Event name"
            onChange={(change) => update({ eventName: change.target.value })}
          />
          <input
            className={cx(inputClass, 'font-mono tracking-[0.2em] uppercase')}
            value={config.joinCode}
            placeholder="Join code"
            onChange={(change) => update({ joinCode: change.target.value })}
          />
        </div>

        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          Match card
        </p>
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            value={config.tableLabel}
            placeholder="Table label"
            onChange={(change) => update({ tableLabel: change.target.value })}
          />
          <input
            className={inputClass}
            value={config.deckName}
            placeholder="Assigned deck"
            onChange={(change) => update({ deckName: change.target.value })}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="neon"
            size="lg"
            onClick={() => void navigate('/match')}
          >
            Open battle screen
          </Button>
          <Button variant="glass" size="lg" onClick={resetGame}>
            Reset game state
          </Button>
        </div>
      </Panel>

      <p className="text-muted/70 text-xs">
        <Link className="hover:text-ink" to="/">
          Home
        </Link>
      </p>
    </>
  );
}
