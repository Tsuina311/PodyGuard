import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ASSASSIN_POD_SIZES,
  defaultLimitedEventModeConfig,
  LIMITED_MODES,
  TREACHERY_POD_SIZES,
  type AssassinPodSize,
  type GameMode,
  type LimitedEventModeConfig,
  type LimitedMode,
  type RulesFormat,
  type SeriesLength,
  type TournamentFormat,
  type TreacheryPodSize,
} from '@podyguard/shared';
import { Play, QrCode, Radio } from 'lucide-react';
import { ApiError, createEvent, saveHostToken } from './api';
import { activeMatchPath } from './active-match';
import {
  baseModeFromGameMode,
  baseModeRequiresCommander,
  CONSTRUCTED_BASE_MODES,
  defaultSeatNames,
  isCommanderEnabled,
  loadMatchConfig,
  resolveConstructedMode,
  saveMatchConfig,
  seatCountForMode,
  seatCountsForMode,
  type ConstructedBaseMode,
} from './match-config';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';
import { QrScannerDialog } from './ui/QrScannerDialog';
import { ThemeToggleCorner } from './ui/ThemeToggle';
import { cx } from './ui/cx';
import { LIMITED_MODE_LABELS } from './limited/limited-view';
import {
  createLocalLimitedSession,
  defaultLocalLimitedConfig,
  loadLocalLimitedConfig,
  loadLocalLimitedSession,
  localLimitedSessionActive,
  saveLocalLimitedConfig,
  type LocalLimitedConfig,
} from './limited/local-limited';

type HomeTab = 'play' | 'host' | 'scan';
type FormatTab = 'constructed' | 'limited';

function disabledLimitedConfigs(): LimitedEventModeConfig[] {
  return LIMITED_MODES.map((mode) => ({
    ...defaultLimitedEventModeConfig(mode),
    enabled: false,
  }));
}

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const staleJoin =
    (useLocation().state as { staleJoin?: boolean } | null)?.staleJoin === true;
  const ongoingMatch = activeMatchPath();
  const [tab, setTab] = useState<HomeTab>('play');
  const [formatTab, setFormatTab] = useState<FormatTab>('constructed');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [name, setName] = useState('');
  const [hostPin, setHostPin] = useState('');
  const [tableCount, setTableCount] = useState('8');
  const [playBaseMode, setPlayBaseMode] = useState<ConstructedBaseMode>(() =>
    baseModeFromGameMode(loadMatchConfig().gameMode),
  );
  const [playCommander, setPlayCommander] = useState(() => {
    const saved = loadMatchConfig();
    return isCommanderEnabled(saved.gameMode, saved.rulesFormat);
  });
  const [hostBaseMode, setHostBaseMode] =
    useState<ConstructedBaseMode>('multiplayer');
  const [hostCommander, setHostCommander] = useState(true);
  const playResolved = resolveConstructedMode(playBaseMode, playCommander);
  const hostResolved = resolveConstructedMode(hostBaseMode, hostCommander);
  const gameMode = hostResolved.gameMode;
  const [commanderPodSize, setCommanderPodSize] = useState(4);
  const [preferredPodSize, setPreferredPodSize] = useState<TreacheryPodSize>(4);
  const [assassinPodSize, setAssassinPodSize] = useState<AssassinPodSize>(5);
  const [multiplayerPodSize, setMultiplayerPodSize] = useState(4);
  const [lifetimeHours, setLifetimeHours] = useState('24');
  const [tournamentFormat, setTournamentFormat] =
    useState<TournamentFormat | null>(null);
  const [tournamentMatchSize, setTournamentMatchSize] = useState(2);
  const [defaultBestOf, setDefaultBestOf] = useState<SeriesLength>(1);
  const [finalBestOf, setFinalBestOf] = useState<SeriesLength>(3);
  const [swissRounds, setSwissRounds] = useState('3');
  const [limitedConfigs, setLimitedConfigs] = useState<LimitedEventModeConfig[]>(
    () => disabledLimitedConfigs(),
  );
  const [playLimited, setPlayLimited] = useState<LocalLimitedConfig>(() =>
    loadLocalLimitedConfig(),
  );
  const ongoingLimited = localLimitedSessionActive(loadLocalLimitedSession());
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trackerSeats, setTrackerSeats] = useState(() => {
    const saved = loadMatchConfig();
    return seatCountForMode(
      resolveConstructedMode(
        baseModeFromGameMode(saved.gameMode),
        isCommanderEnabled(saved.gameMode, saved.rulesFormat),
      ).gameMode,
      saved.seatCount,
    );
  });
  const trackerSeatOptions = seatCountsForMode(playResolved.gameMode);
  const eventPodSize =
    gameMode === 'commander'
      ? commanderPodSize
      : gameMode === 'treachery'
        ? preferredPodSize
        : gameMode === 'assassin'
          ? assassinPodSize
          : gameMode === 'multiplayer'
            ? multiplayerPodSize
            : gameMode === 'duel' ||
                gameMode === 'duel-commander' ||
                gameMode === 'brawl'
              ? 2
              : gameMode === 'emperor'
                ? 6
                : gameMode === 'star'
                  ? 5
                  : 4;
  const tournamentEligible =
    gameMode !== 'two-headed-giant' &&
    gameMode !== 'archenemy-commander' &&
    gameMode !== 'emperor';
  const limitedEnabled = limitedConfigs.some((config) => config.enabled);

  function selectTab(next: HomeTab) {
    setTab(next);
    setError(null);
  }

  function pickPlayBaseMode(base: ConstructedBaseMode) {
    if (baseModeRequiresCommander(base) && !playCommander) {
      return;
    }
    setPlayBaseMode(base);
    const next = resolveConstructedMode(base, playCommander);
    setTrackerSeats((seats) => seatCountForMode(next.gameMode, seats));
  }

  function pickHostBaseMode(base: ConstructedBaseMode) {
    if (baseModeRequiresCommander(base) && !hostCommander) {
      return;
    }
    setHostBaseMode(base);
  }

  function setPlayCommanderToggle(on: boolean) {
    const base =
      !on && baseModeRequiresCommander(playBaseMode) ? 'duel' : playBaseMode;
    if (base !== playBaseMode) {
      setPlayBaseMode(base);
    }
    setPlayCommander(on);
    const next = resolveConstructedMode(base, on);
    setTrackerSeats((seats) => seatCountForMode(next.gameMode, seats));
  }

  function setHostCommanderToggle(on: boolean) {
    if (!on && baseModeRequiresCommander(hostBaseMode)) {
      setHostBaseMode('duel');
    }
    setHostCommander(on);
  }

  function startTracker() {
    setError(null);
    const config = loadMatchConfig();
    const seatCount = trackerSeats;
    saveMatchConfig({
      ...config,
      gameMode: playResolved.gameMode,
      rulesFormat: playResolved.rulesFormat,
      seatCount,
      names: defaultSeatNames(Math.max(seatCount, 8)),
    });
    void navigate('/match-config');
  }

  function updatePlayLimited(patch: Partial<LocalLimitedConfig>) {
    setPlayLimited((current) => {
      const mode = patch.mode ?? current.mode;
      const defaults = defaultLocalLimitedConfig(mode);
      const next: LocalLimitedConfig =
        patch.mode && patch.mode !== current.mode
          ? defaults
          : {
              ...current,
              ...patch,
              mode,
              playerCount: defaults.playerCount,
              names: defaultSeatNames(Math.max(defaults.playerCount, 8)).map(
                (name, index) => current.names[index] ?? name,
              ),
            };
      saveLocalLimitedConfig(next);
      return next;
    });
  }

  function startLocalLimited() {
    setError(null);
    saveLocalLimitedConfig(playLimited);
    createLocalLimitedSession(playLimited);
    void navigate('/limited');
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (formatTab === 'limited' && !limitedEnabled) {
      setError(t('home.limitedEnableOne'));
      return;
    }
    setBusy(true);
    try {
      const isLimited = formatTab === 'limited';
      const createMode: GameMode = isLimited ? 'commander' : gameMode;
      const rulesFormat: RulesFormat = isLimited
        ? 'commander'
        : hostResolved.rulesFormat;
      const result = await createEvent(name, hostPin, Number(tableCount), {
        gameMode: createMode,
        rulesFormat,
        allowThreePods:
          createMode === 'multiplayer' || createMode === 'assassin'
            ? true
            : undefined,
        allowFivePods:
          createMode === 'multiplayer'
            ? multiplayerPodSize >= 5
            : undefined,
        preferredPodSize: isLimited ? 4 : eventPodSize,
        lifetimeHours: Number(lifetimeHours),
        tournamentFormat:
          !isLimited && tournamentEligible
            ? tournamentFormat ?? undefined
            : undefined,
        tournamentOptions:
          !isLimited && tournamentEligible && tournamentFormat
            ? {
                matchSize: tournamentMatchSize,
                defaultBestOf,
                finalBestOf:
                  tournamentFormat === 'single-elimination'
                    ? finalBestOf
                    : defaultBestOf,
                swissRounds:
                  tournamentFormat === 'swiss'
                    ? Math.max(1, Number(swissRounds) || 1)
                    : undefined,
              }
            : undefined,
        limitedModeConfigs: isLimited
          ? limitedConfigs
          : disabledLimitedConfigs(),
      });
      saveHostToken(result.event.joinCode, result.hostToken);
      void navigate(`/host/${result.event.joinCode}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('common.errors.createEvent'),
      );
    } finally {
      setBusy(false);
    }
  }

  function onLookup(event: FormEvent) {
    event.preventDefault();
    const code = joinCode.trim();
    if (!code) {
      setError(t('common.errors.enterJoinCode'));
      return;
    }
    void navigate(`/e/${code}`);
  }

  return (
    <>
      <ThemeToggleCorner />
      <header className="mb-1">
        <Brand className="mb-3" />
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-tight text-balance sm:text-4xl">
          {t('home.taglineBefore')}{' '}
          <span className="from-beam via-neon to-plasma bg-gradient-to-r bg-clip-text text-transparent">
            {t('home.taglineHighlight')}
          </span>
          {t('home.taglineAfter')}
        </h1>
      </header>

      <div
        role="tablist"
        aria-label={t('home.menu')}
        className="border-muted/20 mb-3 grid grid-cols-3 gap-1 rounded-2xl border bg-hull/50 p-1"
      >
        {(
          [
            { id: 'play', label: t('home.startPlaying'), icon: Play },
            { id: 'host', label: t('home.hostEvent'), icon: Radio },
            { id: 'scan', label: t('home.scanQr'), icon: QrCode },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectTab(item.id)}
              className={cx(
                'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-center transition sm:flex-row sm:gap-1.5 sm:px-2',
                selected
                  ? 'bg-neon/15 text-neon shadow-[0_0_24px_-12px_var(--color-neon)]'
                  : 'text-muted hover:text-ink',
              )}
            >
              <Icon size={16} aria-hidden className="shrink-0" />
              <span className="font-display text-[0.7rem] leading-tight font-semibold sm:text-xs">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'play' || tab === 'host' ? (
        <div
          role="tablist"
          aria-label={t('home.formatMenu')}
          className="border-muted/20 mb-3 grid grid-cols-2 gap-1 rounded-2xl border bg-hull/40 p-1"
        >
          {(
            [
              { id: 'constructed', label: t('home.constructed') },
              { id: 'limited', label: t('home.limited') },
            ] as const
          ).map((item) => {
            const selected = formatTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setFormatTab(item.id);
                  setError(null);
                }}
                className={cx(
                  'min-h-10 rounded-xl px-3 py-2 text-center text-sm font-semibold transition',
                  selected
                    ? 'bg-neon/15 text-neon'
                    : 'text-muted hover:text-ink',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {tab === 'play' && formatTab === 'constructed' ? (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Play size={18} aria-hidden />
              {t('home.constructed')}
            </span>
          }
          aside={
            ongoingMatch ? t('home.ongoingGame') : t('home.noEventNeeded')
          }
        >
          <p className="text-muted mb-3 text-sm">{t('home.startPlayingHint')}</p>
          <CommanderRulesSwitch
            value={playCommander}
            onChange={setPlayCommanderToggle}
          />
          <ConstructedModeGrid
            value={playBaseMode}
            name="trackerBaseMode"
            commander={playCommander}
            onChange={pickPlayBaseMode}
          />
          <p className="text-muted mb-3 text-xs">
            {t(
              modeHintKey(playResolved.gameMode, playResolved.rulesFormat),
            )}
          </p>
          <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
            {t('common.players')}
          </p>
          {trackerSeatOptions.length > 1 ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {trackerSeatOptions.map((count) => (
                <Button
                  key={count}
                  size="sm"
                  variant={trackerSeats === count ? 'neon' : 'glass'}
                  onClick={() => setTrackerSeats(count)}
                >
                  {count}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-muted mb-4 text-xs">
              {t('home.alwaysPlayers', {
                count: trackerSeatOptions[0],
              })}
            </p>
          )}
          {ongoingMatch ? (
            <>
              <Button
                type="button"
                variant="neon"
                size="lg"
                block
                onClick={() => void navigate(ongoingMatch)}
              >
                {t('home.resumeGame')}
              </Button>
              <Button
                type="button"
                variant="glass"
                size="lg"
                block
                className="mt-2"
                onClick={startTracker}
              >
                {t('home.startNewGame')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="neon"
              size="lg"
              block
              onClick={startTracker}
            >
              {t('home.startGame')}
            </Button>
          )}
        </Panel>
      ) : null}

      {tab === 'play' && formatTab === 'limited' ? (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Play size={18} aria-hidden />
              {t('home.limited')}
            </span>
          }
          aside={t('home.noEventNeeded')}
        >
          <p className="text-muted mb-3 text-sm">{t('home.limitedPlayHint')}</p>
          {ongoingLimited ? (
            <Button
              type="button"
              variant="neon"
              size="lg"
              block
              className="mb-4"
              onClick={() => void navigate('/limited')}
            >
              {t('home.resumeLimited')}
            </Button>
          ) : null}
          <fieldset className="mb-3">
            <legend className="text-muted mb-2 text-sm">
              {t('home.limitedFormat')}
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {LIMITED_MODES.map((mode) => (
                <label
                  key={mode}
                  className={cx(
                    'cursor-pointer rounded-xl border p-2.5 text-center text-sm font-semibold transition',
                    playLimited.mode === mode
                      ? 'border-neon bg-neon/10 text-neon'
                      : 'border-muted/20 text-muted hover:border-muted/40',
                  )}
                >
                  <input
                    type="radio"
                    name="playLimitedMode"
                    value={mode}
                    checked={playLimited.mode === mode}
                    onChange={() => updatePlayLimited({ mode })}
                    className="sr-only"
                  />
                  {LIMITED_MODE_LABELS[mode]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-muted mb-4 text-xs">
            {t('home.alwaysPlayers', { count: playLimited.playerCount })}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-muted text-xs">
              {t('home.limitedMatch')}
              <select
                className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
                value={playLimited.matchStructure}
                onChange={(event) =>
                  updatePlayLimited({
                    matchStructure: event.target.value as 'BO1' | 'BO3',
                  })
                }
              >
                <option value="BO1">BO1</option>
                <option value="BO3">BO3</option>
              </select>
            </label>
            <label className="text-muted text-xs">
              {t('home.limitedRounds')}
              <input
                className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
                type="number"
                min={1}
                value={
                  playLimited.totalRounds === 'AUTO'
                    ? ''
                    : playLimited.totalRounds
                }
                placeholder={t('home.limitedRoundsAuto')}
                onChange={(event) =>
                  updatePlayLimited({
                    totalRounds: event.target.value
                      ? Number(event.target.value)
                      : 'AUTO',
                  })
                }
              />
            </label>
            <label className="text-muted text-xs">
              {t('home.limitedRoundMinutes')}
              <input
                className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
                type="number"
                min={1}
                value={playLimited.roundMinutes}
                onChange={(event) =>
                  updatePlayLimited({
                    roundMinutes: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="text-muted text-xs">
              {t('home.limitedDeckMinutes')}
              <input
                className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
                type="number"
                min={1}
                value={playLimited.deckbuildingMinutes}
                onChange={(event) =>
                  updatePlayLimited({
                    deckbuildingMinutes: Number(event.target.value),
                  })
                }
              />
            </label>
            {playLimited.mode !== 'SEALED' ? (
              <label className="text-muted text-xs">
                {t('home.limitedDraftMinutes')}
                <input
                  className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
                  type="number"
                  min={1}
                  value={playLimited.draftMinutes ?? 50}
                  onChange={(event) =>
                    updatePlayLimited({
                      draftMinutes: Number(event.target.value),
                    })
                  }
                />
              </label>
            ) : null}
          </div>
          <Button
            type="button"
            variant="neon"
            size="lg"
            block
            onClick={startLocalLimited}
          >
            {ongoingLimited
              ? t('home.startNewLimited')
              : t('home.startLimited')}
          </Button>
        </Panel>
      ) : null}

      {tab === 'host' && formatTab === 'constructed' ? (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Radio size={18} aria-hidden />
              {t('home.hostEvent')}
            </span>
          }
          aside={t('home.new')}
          onSubmit={onCreate}
        >
          <fieldset className="mb-4">
            <legend className="text-muted mb-2 text-sm">{t('common.game')}</legend>
            <CommanderRulesSwitch
              value={hostCommander}
              onChange={setHostCommanderToggle}
            />
            <ConstructedModeGrid
              value={hostBaseMode}
              name="hostBaseMode"
              commander={hostCommander}
              onChange={pickHostBaseMode}
            />
            <p className="text-muted mt-2 text-xs">
              {t(
                modeHostHintKey(
                  hostResolved.gameMode,
                  hostResolved.rulesFormat,
                ),
              )}
            </p>
          </fieldset>
          {!tournamentEligible ? (
            <p className="text-muted mb-4 text-xs">
              {t('tournament.teamModeUnavailable')}
            </p>
          ) : null}
          <Field
            label={t('home.eventName')}
            value={name}
            onChange={(change) => setName(change.target.value)}
            placeholder={t('home.eventNamePlaceholder')}
            autoComplete="off"
            required
          />
          <Field
            label={t('home.tables')}
            hint={t('home.tablesHint')}
            value={tableCount}
            onChange={(change) => setTableCount(change.target.value)}
            type="number"
            inputMode="numeric"
            min={1}
            max={40}
            required
          />
          {tournamentEligible ? (            <fieldset className="mb-4">
              <legend className="text-muted mb-2 text-sm">
                {t('tournament.eventStructure')}
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                <label
                  className={cx(
                    'cursor-pointer rounded-xl border p-3 transition',
                    tournamentFormat === null
                      ? 'border-neon bg-neon/10'
                      : 'border-muted/20 hover:border-muted/40',
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="tournamentFormat"
                    checked={tournamentFormat === null}
                    onChange={() => setTournamentFormat(null)}
                  />
                  <span className="block text-sm font-semibold">
                    {t('tournament.casual')}
                  </span>
                  <span className="text-muted mt-1 block text-xs">
                    {t('tournament.casualHint')}
                  </span>
                </label>
                <label
                  className={cx(
                    'cursor-pointer rounded-xl border p-3 transition',
                    tournamentFormat === 'single-elimination'
                      ? 'border-neon bg-neon/10'
                      : 'border-muted/20 hover:border-muted/40',
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="tournamentFormat"
                    checked={tournamentFormat === 'single-elimination'}
                    onChange={() =>
                      setTournamentFormat('single-elimination')
                    }
                  />
                  <span className="block text-sm font-semibold">
                    {t('tournament.singleElimination')}
                  </span>
                  <span className="text-muted mt-1 block text-xs">
                    {t('tournament.singleEliminationHint', {
                      size: tournamentMatchSize,
                    })}
                  </span>
                </label>
                <label
                  className={cx(
                    'cursor-pointer rounded-xl border p-3 transition',
                    tournamentFormat === 'swiss'
                      ? 'border-neon bg-neon/10'
                      : 'border-muted/20 hover:border-muted/40',
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="tournamentFormat"
                    checked={tournamentFormat === 'swiss'}
                    onChange={() => setTournamentFormat('swiss')}
                  />
                  <span className="block text-sm font-semibold">
                    {t('tournament.swiss')}
                  </span>
                  <span className="text-muted mt-1 block text-xs">
                    {t('tournament.swissHint')}
                  </span>
                </label>
              </div>
              {tournamentFormat ? (
                <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-3">
                  <fieldset>
                    <legend className="text-muted mb-2 text-xs tracking-wide uppercase">
                      {t('tournament.matchSize')}
                    </legend>
                    <div className="grid grid-cols-4 gap-2">
                      {[2, 3, 4, 5].map((size) => (
                        <label
                          key={size}
                          className={cx(
                            'cursor-pointer rounded-lg border p-2 text-center text-sm font-semibold transition',
                            tournamentMatchSize === size
                              ? 'border-neon bg-neon/10 text-neon'
                              : 'border-muted/20 text-muted hover:border-muted/40',
                          )}
                        >
                          <input
                            type="radio"
                            name="tournamentMatchSize"
                            value={size}
                            checked={tournamentMatchSize === size}
                            onChange={() => setTournamentMatchSize(size)}
                            className="sr-only"
                          />
                          {size}
                        </label>
                      ))}
                    </div>
                    <p className="text-muted mt-2 text-xs">
                      {tournamentMatchSize === 2
                        ? t('tournament.matchSizeDuelHint')
                        : t('tournament.matchSizePodHint', {
                            size: tournamentMatchSize,
                          })}
                    </p>
                  </fieldset>
                  <fieldset>
                    <legend className="text-muted mb-2 text-xs tracking-wide uppercase">
                      {tournamentFormat === 'single-elimination'
                        ? t('tournament.openingBestOf')
                        : t('tournament.roundBestOf')}
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                      {([1, 3, 5] as SeriesLength[]).map((bestOf) => (
                        <label
                          key={bestOf}
                          className={cx(
                            'cursor-pointer rounded-lg border p-2 text-center text-sm font-semibold transition',
                            defaultBestOf === bestOf
                              ? 'border-neon bg-neon/10 text-neon'
                              : 'border-muted/20 text-muted hover:border-muted/40',
                          )}
                        >
                          <input
                            type="radio"
                            name="defaultBestOf"
                            value={bestOf}
                            checked={defaultBestOf === bestOf}
                            onChange={() => setDefaultBestOf(bestOf)}
                            className="sr-only"
                          />
                          {t('tournament.bestOf', { count: bestOf })}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {tournamentFormat === 'single-elimination' ? (
                    <fieldset>
                      <legend className="text-muted mb-2 text-xs tracking-wide uppercase">
                        {t('tournament.finalBestOf')}
                      </legend>
                      <div className="grid grid-cols-3 gap-2">
                        {([1, 3, 5] as SeriesLength[]).map((bestOf) => (
                          <label
                            key={bestOf}
                            className={cx(
                              'cursor-pointer rounded-lg border p-2 text-center text-sm font-semibold transition',
                              finalBestOf === bestOf
                                ? 'border-neon bg-neon/10 text-neon'
                                : 'border-muted/20 text-muted hover:border-muted/40',
                            )}
                          >
                            <input
                              type="radio"
                              name="finalBestOf"
                              value={bestOf}
                              checked={finalBestOf === bestOf}
                              onChange={() => setFinalBestOf(bestOf)}
                              className="sr-only"
                            />
                            {t('tournament.bestOf', { count: bestOf })}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
                    <Field
                      label={t('tournament.swissRounds')}
                      hint={t('tournament.swissRoundsHint')}
                      value={swissRounds}
                      onChange={(change) => setSwissRounds(change.target.value)}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={16}
                      required
                    />
                  )}
                </div>
              ) : null}
            </fieldset>
          ) : null}
          {gameMode === 'commander' ? (
            <fieldset className="mb-4">
              <legend className="text-muted mb-2 text-sm">
                {t('home.targetTableSize')}
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {[3, 4, 5].map((size) => (
                  <label
                    key={size}
                    className={cx(
                      'cursor-pointer rounded-xl border p-2 text-center text-sm font-semibold transition',
                      commanderPodSize === size
                        ? 'border-neon bg-neon/10 text-neon'
                        : 'border-muted/20 text-muted hover:border-muted/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="commanderPodSize"
                      value={size}
                      checked={commanderPodSize === size}
                      onChange={() => setCommanderPodSize(size)}
                      className="sr-only"
                    />
                    {size}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : gameMode === 'multiplayer' ? (
            <fieldset className="mb-4">
              <legend className="text-muted mb-2 text-sm">
                {t('home.targetTableSize')}
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {[3, 4, 5, 6].map((size) => (
                  <label
                    key={size}
                    className={cx(
                      'cursor-pointer rounded-xl border p-2 text-center text-sm font-semibold transition',
                      multiplayerPodSize === size
                        ? 'border-neon bg-neon/10 text-neon'
                        : 'border-muted/20 text-muted hover:border-muted/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="multiplayerPodSize"
                      value={size}
                      checked={multiplayerPodSize === size}
                      onChange={() => setMultiplayerPodSize(size)}
                      className="sr-only"
                    />
                    {size}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : gameMode === 'treachery' ? (
            <fieldset className="mb-4">
              <legend className="text-muted mb-2 text-sm">
                {t('home.targetTableSize')}
              </legend>
              <div className="grid grid-cols-5 gap-2">
                {TREACHERY_POD_SIZES.map((size) => (
                  <label
                    key={size}
                    className={cx(
                      'cursor-pointer rounded-xl border p-2 text-center text-sm font-semibold transition',
                      preferredPodSize === size
                        ? 'border-neon bg-neon/10 text-neon'
                        : 'border-muted/20 text-muted hover:border-muted/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="preferredPodSize"
                      value={size}
                      checked={preferredPodSize === size}
                      onChange={() => setPreferredPodSize(size)}
                      className="sr-only"
                    />
                    {size}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : gameMode === 'assassin' ? (
            <fieldset className="mb-4">
              <legend className="text-muted mb-2 text-sm">
                {t('home.targetTableSize')}
              </legend>
              <div className="grid grid-cols-6 gap-2">
                {ASSASSIN_POD_SIZES.map((size) => (
                  <label
                    key={size}
                    className={cx(
                      'cursor-pointer rounded-xl border p-2 text-center text-sm font-semibold transition',
                      assassinPodSize === size
                        ? 'border-neon bg-neon/10 text-neon'
                        : 'border-muted/20 text-muted hover:border-muted/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="assassinPodSize"
                      value={size}
                      checked={assassinPodSize === size}
                      onChange={() => setAssassinPodSize(size)}
                      className="sr-only"
                    />
                    {size}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : gameMode === 'duel' ||
            gameMode === 'duel-commander' ||
            gameMode === 'brawl' ? (
            <p className="text-muted mb-4 text-sm">
              {gameMode === 'duel'
                ? t('home.duelFixedSeats')
                : gameMode === 'duel-commander'
                  ? t('home.duelCommanderFixedSeats')
                  : t('home.brawlFixedSeats')}
            </p>
          ) : gameMode === 'emperor' ? (
            <p className="text-muted mb-4 text-sm">
              {t('home.emperorFixedSeats')}
            </p>
          ) : gameMode === 'star' ? (
            <p className="text-muted mb-4 text-sm">{t('home.starFixedSeats')}</p>
          ) : gameMode === 'archenemy-commander' ? (
            <p className="text-muted mb-4 text-sm">
              {t('home.archenemyFixedSeats')}
            </p>
          ) : gameMode === 'two-headed-giant' ? (
            <p className="text-muted mb-4 text-sm">
              {t('home.twoHeadedFixedSeats')}
            </p>
          ) : null}
          <Field
            label={t('home.eventLasts')}
            hint={t('home.eventLastsHint')}
            value={lifetimeHours}
            onChange={(change) => setLifetimeHours(change.target.value)}
            type="number"
            inputMode="numeric"
            min={1}
            max={168}
            required
          />
          <Field
            label={t('home.hostPin')}
            hint={t('home.hostPinHint')}
            value={hostPin}
            onChange={(change) => setHostPin(change.target.value)}
            inputMode="numeric"
            autoComplete="off"
            required
          />
          <Button type="submit" size="lg" block disabled={busy}>
            {busy ? t('common.creating') : t('home.createEvent')}
          </Button>
        </Panel>
      ) : null}

      {tab === 'host' && formatTab === 'limited' ? (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Radio size={18} aria-hidden />
              {t('home.limited')}
            </span>
          }
          aside={t('home.new')}
          onSubmit={onCreate}
        >
          <p className="text-muted mb-4 text-sm">{t('home.limitedHostHint')}</p>
          <Field
            label={t('home.eventName')}
            value={name}
            onChange={(change) => setName(change.target.value)}
            placeholder={t('home.eventNamePlaceholder')}
            autoComplete="off"
            required
          />
          <Field
            label={t('home.tables')}
            hint={t('home.tablesHint')}
            value={tableCount}
            onChange={(change) => setTableCount(change.target.value)}
            type="number"
            inputMode="numeric"
            min={1}
            max={40}
            required
          />
          <fieldset className="mb-4">
            <legend className="text-muted mb-2 text-sm">
              {t('home.limitedQueues')}
            </legend>
            <p className="text-muted mb-3 text-xs">
              {t('home.limitedQueuesHint')}
            </p>
            <div className="space-y-2">
              {limitedConfigs.map((config) => (
                <LimitedModeConfigurator
                  key={config.mode}
                  config={config}
                  onChange={(next) =>
                    setLimitedConfigs((current) =>
                      current.map((row) =>
                        row.mode === next.mode ? next : row,
                      ),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
          <Field
            label={t('home.eventLasts')}
            hint={t('home.eventLastsHint')}
            value={lifetimeHours}
            onChange={(change) => setLifetimeHours(change.target.value)}
            type="number"
            inputMode="numeric"
            min={1}
            max={168}
            required
          />
          <Field
            label={t('home.hostPin')}
            hint={t('home.hostPinHint')}
            value={hostPin}
            onChange={(change) => setHostPin(change.target.value)}
            inputMode="numeric"
            autoComplete="off"
            required
          />
          <Button
            type="submit"
            size="lg"
            block
            disabled={busy || !limitedEnabled}
          >
            {busy ? t('common.creating') : t('home.createEvent')}
          </Button>
        </Panel>
      ) : null}

      {tab === 'scan' ? (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <QrCode size={18} aria-hidden />
              {t('home.scanQr')}
            </span>
          }
          aside={t('home.playerAside')}
        >
          <p className="text-muted mb-4 text-sm">{t('home.scanQrHint')}</p>
          <Button
            type="button"
            variant="neon"
            size="lg"
            block
            className="mb-4"
            onClick={() => {
              setError(null);
              setScannerOpen(true);
            }}
          >
            <QrCode size={18} aria-hidden />
            {t('home.openScanner')}
          </Button>
          <form onSubmit={onLookup}>
            <Field
              label={t('home.joinCode')}
              hint={t('home.joinCodeHint')}
              value={joinCode}
              onChange={(change) => setJoinCode(change.target.value)}
              placeholder={t('home.joinCodePlaceholder')}
              autoComplete="off"
              className="font-mono tracking-[0.3em] uppercase"
              required
              wrapperClassName="mb-3"
            />
            <Button type="submit" variant="glass" size="lg" block>
              {t('home.join')}
            </Button>
          </form>
        </Panel>
      ) : null}

      {staleJoin ? (
        <p className="text-muted text-sm">{t('home.staleJoin')}</p>
      ) : null}
      {error ? <p className="text-danger text-sm">{error}</p> : null}

      {scannerOpen ? (
        <QrScannerDialog
          onClose={() => setScannerOpen(false)}
          onDetect={(code) => {
            setScannerOpen(false);
            void navigate(`/e/${code}`);
          }}
        />
      ) : null}
    </>
  );
}

const limitedLabels: Record<LimitedMode, string> = {
  BOOSTER_DRAFT: 'Booster Draft',
  PICK_TWO_DRAFT: 'Pick-Two Draft',
  SEALED: 'Sealed',
};

function LimitedModeConfigurator({
  config,
  onChange,
}: {
  config: LimitedEventModeConfig;
  onChange: (config: LimitedEventModeConfig) => void;
}) {
  return (
    <div className="rounded-xl border border-muted/20 p-3">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold">
            {limitedLabels[config.mode]}
          </span>
          <span className="text-muted block text-xs">
            {config.preferredCohortSize ?? config.minCohortSize} players ·{' '}
            {config.roundMinutes} minute rounds
          </span>
        </span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(event) =>
            onChange({ ...config, enabled: event.target.checked })
          }
          className="size-5 accent-[var(--color-neon)]"
        />
      </label>
      {config.enabled ? (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 sm:grid-cols-4">
          <label className="text-muted text-xs">
            Match
            <select
              className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
              value={config.matchStructure}
              onChange={(event) =>
                onChange({
                  ...config,
                  matchStructure: event.target.value as 'BO1' | 'BO3',
                })
              }
            >
              <option value="BO1">BO1</option>
              <option value="BO3">BO3</option>
            </select>
          </label>
          <label className="text-muted text-xs">
            Rounds
            <input
              className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
              type="number"
              min={1}
              value={config.totalRounds === 'AUTO' ? '' : config.totalRounds}
              placeholder="Auto"
              onChange={(event) =>
                onChange({
                  ...config,
                  totalRounds: event.target.value
                    ? Number(event.target.value)
                    : 'AUTO',
                })
              }
            />
          </label>
          <label className="text-muted text-xs">
            Round minutes
            <input
              className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
              type="number"
              min={1}
              value={config.roundMinutes}
              onChange={(event) =>
                onChange({
                  ...config,
                  roundMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="text-muted text-xs">
            Deckbuilding minutes
            <input
              className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
              type="number"
              min={1}
              value={config.deckbuildingMinutes}
              onChange={(event) =>
                onChange({
                  ...config,
                  deckbuildingMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          {config.mode !== 'SEALED' ? (
            <label className="text-muted text-xs">
              Draft minutes
              <input
                className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
                type="number"
                min={1}
                value={config.draftMinutes ?? 50}
                onChange={(event) =>
                  onChange({
                    ...config,
                    draftMinutes: Number(event.target.value),
                  })
                }
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function modeHintKey(mode: GameMode, rulesFormat: RulesFormat): string {
  if (rulesFormat === 'normal' && mode !== 'duel' && mode !== 'multiplayer') {
    return `modes.${mode}.normal.hint`;
  }
  return `modes.${mode}.hint`;
}

function modeHostHintKey(mode: GameMode, rulesFormat: RulesFormat): string {
  if (mode === 'commander') {
    return 'home.targetTableSize';
  }
  if (rulesFormat === 'normal' && mode !== 'duel' && mode !== 'multiplayer') {
    return `modes.${mode}.normal.hostHint`;
  }
  return `modes.${mode}.hostHint`;
}

function CommanderRulesSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (commander: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t('home.rulesFormat')}
      className="border-muted/20 mb-3 grid grid-cols-2 gap-1 rounded-xl border p-1"
    >
      <button
        type="button"
        aria-pressed={!value}
        onClick={() => onChange(false)}
        className={cx(
          'rounded-lg px-3 py-2 text-sm font-semibold transition',
          !value
            ? 'bg-neon/15 text-neon'
            : 'text-muted hover:text-ink',
        )}
      >
        {t('home.classicRules')}
      </button>
      <button
        type="button"
        aria-pressed={value}
        onClick={() => onChange(true)}
        className={cx(
          'rounded-lg px-3 py-2 text-sm font-semibold transition',
          value
            ? 'bg-neon/15 text-neon'
            : 'text-muted hover:text-ink',
        )}
      >
        {t('home.commanderRules')}
      </button>
    </div>
  );
}

function ConstructedModeGrid({
  value,
  name,
  commander,
  onChange,
}: {
  value: ConstructedBaseMode;
  name: string;
  commander: boolean;
  onChange: (mode: ConstructedBaseMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mb-2 grid grid-cols-2 gap-2">
      {CONSTRUCTED_BASE_MODES.map((mode) => {
        const disabled = baseModeRequiresCommander(mode) && !commander;
        return (
          <label
            key={mode}
            title={
              disabled ? t('home.brawlRequiresCommander') : undefined
            }
            className={cx(
              'rounded-xl border p-2.5 text-center text-sm font-semibold transition',
              disabled
                ? 'border-muted/15 text-muted/40 cursor-not-allowed'
                : 'cursor-pointer',
              !disabled && value === mode
                ? 'border-neon bg-neon/10 text-neon'
                : !disabled
                  ? 'border-muted/20 text-muted hover:border-muted/40'
                  : null,
            )}
          >
            <input
              type="radio"
              name={name}
              value={mode}
              checked={value === mode}
              disabled={disabled}
              onChange={() => onChange(mode)}
              className="sr-only"
            />
            {t(`modes.${mode}.label`)}
          </label>
        );
      })}
    </div>
  );
}
