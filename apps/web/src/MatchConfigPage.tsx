import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { COMMANDER_POOLS, usesCommanderRules, type RulesFormat } from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { CommanderPicker } from './CommanderPicker';
import {
  loadMatchConfig,
  matchPlayers,
  modesForFamily,
  saveMatchConfig,
  seatCountForMode,
  seatCountsForMode,
  trackerStorageKey,
  type MatchConfig,
  type StandaloneGameMode,
} from './match-config';
import { Badge } from './ui/Badge';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { LanguageSwitcherCorner } from './ui/LanguageSwitcher';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [config, setConfig] = useState<MatchConfig>(() => loadMatchConfig());
  const players = matchPlayers(config);
  const commanderRules = usesCommanderRules(config.gameMode, config.rulesFormat);

  function update(patch: Partial<MatchConfig>) {
    setConfig((current) => {
      const next = { ...current, ...patch };
      saveMatchConfig(next);
      return next;
    });
  }

  function setGameMode(gameMode: StandaloneGameMode, rulesFormat: RulesFormat) {
    update({
      gameMode,
      rulesFormat,
      seatCount: seatCountForMode(gameMode, config.seatCount),
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
      <LanguageSwitcherCorner />
      <ThemeToggleCorner />
      <header>
        <Brand className="mb-6" />
        <div className="mb-2 flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t('matchConfig.title')}
          </h1>
          <Badge tone="dev">{t('common.dev')}</Badge>
        </div>
        <p className="text-muted mb-8 text-sm">{t('matchConfig.description')}</p>
      </header>

      <Panel
        title={t('matchConfig.podSetup')}
        aside={t('matchConfig.seatsCount', { count: config.seatCount })}
      >
        {(
          [
            ['normal', 'families.normal'],
            ['commander', 'families.commander'],
          ] as const
        ).map(([family, labelKey]) => (
          <div key={family} className="mb-4">
            <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
              {t(labelKey)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {modesForFamily(family).map((mode) => (
                <Button
                  key={`${family}-${mode.id}`}
                  size="sm"
                  variant={
                    config.gameMode === mode.id &&
                    config.rulesFormat === family
                      ? 'neon'
                      : 'glass'
                  }
                  onClick={() => setGameMode(mode.id, family)}
                >
                  {t(`modes.${mode.id}.label`)}
                </Button>
              ))}
            </div>
          </div>
        ))}

        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          {t('matchConfig.seats')}
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {seatCountsForMode(config.gameMode).map((count) => (
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

        {commanderRules ? (
          <>
            <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
              {t('matchConfig.bracket')}
            </p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {[...COMMANDER_POOLS, { id: 'open', short: t('common.open') }].map(
                (pool) => (
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
                ),
              )}
            </div>
          </>
        ) : null}

        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          {t('common.players')}
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {players.map((player, index) => (
            <div key={player.id} className="space-y-2">
              <input
                className={inputClass}
                value={config.names[index] ?? ''}
                placeholder={t('common.player', { number: index + 1 })}
                onChange={(change) => renameSeat(index, change.target.value)}
              />
              {commanderRules ? (
                <>
                  <CommanderPicker
                    label={t('matchConfig.commander')}
                    value={player.commanders[0] ?? null}
                    onChange={(commander) =>
                      setSeatCommanders(index, commander ? [commander] : [])
                    }
                  />
                  {player.commanders[0] &&
                  (player.commanders[1] ||
                    canHaveSecondCommander(player.commanders[0])) ? (
                    <CommanderPicker
                      label={t('matchConfig.secondCommander')}
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
                </>
              ) : null}
            </div>
          ))}
        </div>

        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          {t('matchConfig.header')}
        </p>
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            value={config.eventName}
            placeholder={t('matchConfig.eventNamePlaceholder')}
            onChange={(change) => update({ eventName: change.target.value })}
          />
          <input
            className={cx(inputClass, 'font-mono tracking-[0.2em] uppercase')}
            value={config.joinCode}
            placeholder={t('matchConfig.joinCodePlaceholder')}
            onChange={(change) => update({ joinCode: change.target.value })}
          />
        </div>

        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          {t('matchConfig.matchCard')}
        </p>
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            value={config.tableLabel}
            placeholder={t('matchConfig.tableLabelPlaceholder')}
            onChange={(change) => update({ tableLabel: change.target.value })}
          />
          <input
            className={inputClass}
            value={config.deckName}
            placeholder={t('matchConfig.assignedDeckPlaceholder')}
            onChange={(change) => update({ deckName: change.target.value })}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="neon"
            size="lg"
            onClick={() => void navigate('/match')}
          >
            {t('matchConfig.openBattleScreen')}
          </Button>
          <Button variant="glass" size="lg" onClick={resetGame}>
            {t('matchConfig.resetGameState')}
          </Button>
        </div>
      </Panel>

      <p className="text-muted/70 text-xs">
        <Link className="hover:text-ink" to="/">
          {t('common.home')}
        </Link>
      </p>
    </>
  );
}
