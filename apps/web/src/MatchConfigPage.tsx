import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { COMMANDER_POOLS, usesCommanderRules } from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import {
  CommanderSeatPickers,
  commandersCompleteForSeats,
} from './CommanderSeatPickers';
import {
  CONSTRUCTED_BASE_MODES,
  baseModeFromGameMode,
  baseModeRequiresCommander,
  commanderSearchProfileForConfig,
  defaultSeatNames,
  isCommanderEnabled,
  loadMatchConfig,
  matchPlayers,
  resolveConstructedMode,
  saveMatchConfig,
  seatCountForMode,
  seatCountsForMode,
  trackerStorageKey,
  type ConstructedBaseMode,
  type MatchConfig,
} from './match-config';
import { removeStored } from './device-storage';
import { Badge } from './ui/Badge';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import { ThemeToggleCorner } from './ui/ThemeToggle';
import { cx } from './ui/cx';

const inputClass =
  'h-10 w-full rounded-lg border border-muted/20 bg-void/70 px-3 text-sm outline-none placeholder:text-muted/50 focus:border-neon/70';

/**
 * Setup step between Home and `/match`. Mode and seat count are chosen on Home;
 * this screen collects player names, commanders, and optional sandbox chrome.
 */
export function MatchConfigPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [config, setConfig] = useState<MatchConfig>(() => loadMatchConfig());
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const players = matchPlayers(config);
  const commanderRules = usesCommanderRules(config.gameMode, config.rulesFormat);
  const commandersReady = commandersCompleteForSeats(
    config.seatCount,
    config.commanders,
  );
  const baseMode = baseModeFromGameMode(config.gameMode);
  const commanderOn = isCommanderEnabled(config.gameMode, config.rulesFormat);

  function update(patch: Partial<MatchConfig>) {
    setConfig((current) => {
      const next = { ...current, ...patch };
      saveMatchConfig(next);
      return next;
    });
  }

  function applyConstructed(base: ConstructedBaseMode, commander: boolean) {
    if (baseModeRequiresCommander(base) && !commander) {
      return;
    }
    const resolvedBase =
      !commander && baseModeRequiresCommander(base) ? 'duel' : base;
    const resolved = resolveConstructedMode(resolvedBase, commander);
    update({
      gameMode: resolved.gameMode,
      rulesFormat: resolved.rulesFormat,
      seatCount: seatCountForMode(resolved.gameMode, config.seatCount),
    });
  }

  function resetGame() {
    removeStored(trackerStorageKey(config));
    update({ resetCount: config.resetCount + 1 });
  }

  function renameSeat(index: number, value: string) {
    const names = [...config.names];
    while (names.length < config.seatCount) {
      names.push(defaultSeatNames(8)[names.length] ?? '');
    }
    names[index] = value;
    update({ names });
  }

  function setSeatCommanders(commanders: MatchConfig['commanders']) {
    update({ commanders });
  }

  function startGame() {
    removeStored(trackerStorageKey(config));
    const next = { ...config, resetCount: config.resetCount + 1 };
    saveMatchConfig(next);
    setConfig(next);
    void navigate('/match');
  }

  return (
    <>
      <ThemeToggleCorner />
      <header>
        <Brand className="mb-6" />
        <h1 className="font-display mb-2 text-3xl font-bold tracking-tight">
          {t('matchConfig.title')}
        </h1>
        <p className="text-muted mb-8 text-sm">{t('matchConfig.description')}</p>
      </header>

      <Panel
        title={t(`modes.${config.gameMode}.label`)}
        aside={t('matchConfig.seatsCount', { count: config.seatCount })}
      >
        <p className="text-muted mb-4 text-xs">
          {t(`modes.${config.gameMode}.hint`)}
        </p>

        <details className="border-muted/20 mb-4 rounded-xl border">
          <summary className="text-muted cursor-pointer px-3 py-2 text-xs font-medium tracking-[0.14em] uppercase">
            {t('matchConfig.changeMode')}
          </summary>
          <div className="border-muted/15 space-y-3 border-t px-3 py-3">
            <div
              role="group"
              aria-label={t('home.rulesFormat')}
              className="border-muted/20 grid grid-cols-2 gap-1 rounded-xl border p-1"
            >
              <button
                type="button"
                aria-pressed={!commanderOn}
                onClick={() =>
                  applyConstructed(
                    baseModeRequiresCommander(baseMode) ? 'duel' : baseMode,
                    false,
                  )
                }
                className={cx(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition',
                  !commanderOn
                    ? 'bg-neon/15 text-neon'
                    : 'text-muted hover:text-ink',
                )}
              >
                {t('home.classicRules')}
              </button>
              <button
                type="button"
                aria-pressed={commanderOn}
                onClick={() => applyConstructed(baseMode, true)}
                className={cx(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition',
                  commanderOn
                    ? 'bg-neon/15 text-neon'
                    : 'text-muted hover:text-ink',
                )}
              >
                {t('home.commanderRules')}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CONSTRUCTED_BASE_MODES.map((mode) => {
                const disabled =
                  baseModeRequiresCommander(mode) && !commanderOn;
                return (
                  <Button
                    key={mode}
                    size="sm"
                    variant={baseMode === mode ? 'neon' : 'glass'}
                    disabled={disabled}
                    title={
                      disabled
                        ? t('home.brawlRequiresCommander')
                        : undefined
                    }
                    onClick={() => applyConstructed(mode, commanderOn)}
                  >
                    {t(`modes.${mode}.label`)}
                  </Button>
                );
              })}
            </div>
            <div>
              <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
                {t('matchConfig.seats')}
              </p>
              <div className="flex flex-wrap gap-1.5">
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
            </div>
          </div>
        </details>

        {commanderRules ? (
          <>
            <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
              {t('matchConfig.bracket')}
            </p>
            <div className="mb-6 flex flex-wrap gap-1.5">
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

            <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
              {t('home.commanderSetup')}
            </p>
            <p className="text-muted mb-3 text-sm">
              {t('home.commanderSetupHint')}
            </p>
            <div className="mb-6">
              <CommanderSeatPickers
                seatCount={config.seatCount}
                commanders={config.commanders}
                names={config.names}
                onRename={renameSeat}
                layout="stack"
                onChange={setSeatCommanders}
                searchProfile={commanderSearchProfileForConfig(config)}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
              {t('common.players')}
            </p>
            <div className="mb-6 grid gap-3">
              {players.map((player, index) => (
                <input
                  key={player.id}
                  className={inputClass}
                  value={config.names[index] ?? ''}
                  placeholder={t('common.player', { number: index + 1 })}
                  onChange={(change) => renameSeat(index, change.target.value)}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="neon"
            size="lg"
            disabled={commanderRules && !commandersReady}
            onClick={startGame}
          >
            {t('matchConfig.startGame')}
          </Button>
          <Button variant="glass" size="lg" onClick={resetGame}>
            {t('matchConfig.resetGameState')}
          </Button>
        </div>
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            {t('matchConfig.sandboxTitle')}
            <Badge tone="dev">{t('common.dev')}</Badge>
          </span>
        }
        expanded={sandboxOpen}
        onToggle={() => setSandboxOpen((open) => !open)}
      >
        <p className="text-muted mb-4 text-xs">{t('matchConfig.sandboxHint')}</p>
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
      </Panel>

      <p className="text-muted/70 text-xs">
        <Link className="hover:text-ink" to="/">
          {t('common.home')}
        </Link>
      </p>
    </>
  );
}
