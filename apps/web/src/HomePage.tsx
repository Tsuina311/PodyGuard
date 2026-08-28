import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ASSASSIN_POD_SIZES,
  TREACHERY_POD_SIZES,
  type AssassinPodSize,
  type GameMode,
  type GameModeFamily,
  type TournamentFormat,
  type TreacheryPodSize,
} from '@podyguard/shared';
import { ChevronDown, Play, QrCode, Radio } from 'lucide-react';
import { ApiError, createEvent, saveHostToken } from './api';
import { activeMatchPath } from './active-match';
import {
  defaultSeatNames,
  loadMatchConfig,
  modeUsesFamily,
  modesForFamily,
  saveMatchConfig,
  seatCountForMode,
  seatCountsForMode,
  type StandaloneGameMode,
} from './match-config';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';
import { QrScannerDialog } from './ui/QrScannerDialog';
import { ThemeToggleCorner } from './ui/ThemeToggle';
import { cx } from './ui/cx';

type ExpandedSection = 'play' | 'host' | null;

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const staleJoin =
    (useLocation().state as { staleJoin?: boolean } | null)?.staleJoin === true;
  const ongoingMatch = activeMatchPath();
  const [expanded, setExpanded] = useState<ExpandedSection>(() =>
    ongoingMatch ? 'play' : null,
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [name, setName] = useState('');
  const [hostPin, setHostPin] = useState('');
  const [tableCount, setTableCount] = useState('8');
  const [gameMode, setGameMode] = useState<GameMode>('commander');
  const [hostFamily, setHostFamily] = useState<GameModeFamily | null>(
    'commander',
  );
  const [allowThreePods, setAllowThreePods] = useState(true);
  const [allowFivePods, setAllowFivePods] = useState(false);
  const [preferredPodSize, setPreferredPodSize] = useState<TreacheryPodSize>(4);
  const [assassinPodSize, setAssassinPodSize] = useState<AssassinPodSize>(5);
  const [multiplayerPodSize, setMultiplayerPodSize] = useState(4);
  const [lifetimeHours, setLifetimeHours] = useState('24');
  const [tournamentFormat, setTournamentFormat] =
    useState<TournamentFormat | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trackerMode, setTrackerMode] = useState<StandaloneGameMode>(
    () => loadMatchConfig().gameMode,
  );
  const [playFamily, setPlayFamily] = useState<GameModeFamily | null>(() =>
    loadMatchConfig().rulesFormat,
  );
  const [trackerSeats, setTrackerSeats] = useState(
    () => loadMatchConfig().seatCount,
  );
  const trackerSeatOptions = seatCountsForMode(trackerMode);
  const eventPodSize =
    gameMode === 'treachery'
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

  function toggle(section: ExpandedSection) {
    setExpanded((current) => (current === section ? null : section));
    setError(null);
  }

  function pickTrackerMode(mode: StandaloneGameMode) {
    setTrackerMode(mode);
    setTrackerSeats((seats) => seatCountForMode(mode, seats));
  }

  function pickPlayFamily(family: GameModeFamily) {
    setPlayFamily((current) => (current === family ? null : family));
    const modes = modesForFamily(family);
    if (!modes.some((mode) => mode.id === trackerMode)) {
      const first = modes[0];
      if (first) {
        pickTrackerMode(first.id);
      }
    }
  }

  function pickHostFamily(family: GameModeFamily) {
    setHostFamily((current) => (current === family ? null : family));
    const modes = modesForFamily(family);
    if (!modes.some((mode) => mode.id === gameMode)) {
      const first = modes[0];
      if (first) {
        setGameMode(first.id);
      }
    }
  }

  function startTracker() {
    setError(null);
    const config = loadMatchConfig();
    const seatCount = trackerSeats;
    const rulesFormat = playFamily ?? config.rulesFormat;
    saveMatchConfig({
      ...config,
      gameMode: trackerMode,
      rulesFormat,
      seatCount,
      names: defaultSeatNames(Math.max(seatCount, 8)),
    });
    void navigate('/match-config');
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const rulesFormat = hostFamily ?? 'commander';
      const result = await createEvent(name, hostPin, Number(tableCount), {
        gameMode,
        rulesFormat,
        allowThreePods:
          gameMode === 'commander'
            ? allowThreePods
            : gameMode === 'multiplayer' || gameMode === 'assassin',
        allowFivePods:
          gameMode === 'commander'
            ? allowFivePods
            : gameMode === 'multiplayer'
              ? multiplayerPodSize >= 5
              : undefined,
        preferredPodSize: eventPodSize,
        lifetimeHours: Number(lifetimeHours),
        tournamentFormat: tournamentEligible
          ? tournamentFormat ?? undefined
          : undefined,
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

      <div className="grid gap-2">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Play size={18} aria-hidden />
              {t('home.startPlaying')}
            </span>
          }
          aside={
            ongoingMatch ? t('home.ongoingGame') : t('home.noEventNeeded')
          }
          expanded={expanded === 'play'}
          onToggle={() => toggle('play')}
        >
          <p className="text-muted mb-3 text-sm">{t('home.startPlayingHint')}</p>
          <FormatFamilyPicker
            selected={playFamily}
            onSelect={pickPlayFamily}
            modesFor={(family) => (
              <>
                <ModeGrid
                  modes={modesForFamily(family)}
                  value={trackerMode}
                  name="trackerMode"
                  onChange={pickTrackerMode}
                />
                {playFamily === family &&
                modeUsesFamily(trackerMode, family) ? (
                  <>
                    <p className="text-muted mb-3 text-xs">
                      {t(modeHintKey(trackerMode, family))}
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
                  </>
                ) : null}
              </>
            )}
          />
          {playFamily ? (
            ongoingMatch ? (
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
            )
          ) : null}
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Radio size={18} aria-hidden />
              {t('home.hostEvent')}
            </span>
          }
          aside={t('home.new')}
          expanded={expanded === 'host'}
          onToggle={() => toggle('host')}
          onSubmit={onCreate}
        >
          {tournamentEligible ? (
          <fieldset className="mb-4">
            <legend className="text-muted mb-2 text-sm">{t('common.game')}</legend>
            <FormatFamilyPicker
              selected={hostFamily}
              onSelect={pickHostFamily}
              modesFor={(family) => (
                <>
                  <ModeGrid
                    modes={modesForFamily(family)}
                    value={gameMode}
                    name="gameMode"
                    onChange={setGameMode}
                  />
                  {hostFamily === family &&
                  modeUsesFamily(gameMode, family) ? (
                    <p className="text-muted mt-2 text-xs">
                      {t(modeHostHintKey(gameMode, family))}
                    </p>
                  ) : null}
                </>
              )}
            />
          </fieldset>
          ) : (
            <p className="text-muted mb-4 text-xs">
              {t('tournament.teamModeUnavailable')}
            </p>
          )}
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
              {t('tournament.eventStructure')}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
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
                    count: Math.max(1, Number(tableCount) || 1) * eventPodSize,
                  })}
                </span>
              </label>
            </div>
          </fieldset>
          {gameMode === 'commander' ? (
            <>
              <label className="text-muted mb-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowThreePods}
                  onChange={(change) => setAllowThreePods(change.target.checked)}
                />
                {t('home.allowThreePods')}
              </label>
              <label className="text-muted mb-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowFivePods}
                  onChange={(change) => setAllowFivePods(change.target.checked)}
                />
                {t('home.allowFivePods')}
              </label>
            </>
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
          <Button type="submit" size="lg" block disabled={busy || !hostFamily}>
            {busy ? t('common.creating') : t('home.createEvent')}
          </Button>
        </Panel>
      </div>

      <Panel title={t('home.joinWithCode')} aside={t('home.playerAside')}>
        <form onSubmit={onLookup}>
          <Field
            label={t('home.joinCode')}
            value={joinCode}
            onChange={(change) => setJoinCode(change.target.value)}
            placeholder={t('home.joinCodePlaceholder')}
            autoComplete="off"
            className="font-mono tracking-[0.3em] uppercase"
            required
            wrapperClassName="mb-3"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="submit" variant="neon" size="lg" block>
              {t('home.join')}
            </Button>
            <Button
              type="button"
              variant="glass"
              size="lg"
              block
              onClick={() => {
                setError(null);
                setScannerOpen(true);
              }}
            >
              <QrCode size={18} aria-hidden />
              {t('home.scanQr')}
            </Button>
          </div>
        </form>
      </Panel>

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

function modeHintKey(mode: GameMode, family: GameModeFamily): string {
  if (family === 'normal' && mode !== 'duel' && mode !== 'multiplayer') {
    return `modes.${mode}.normal.hint`;
  }
  return `modes.${mode}.hint`;
}

function modeHostHintKey(mode: GameMode, family: GameModeFamily): string {
  if (family === 'normal' && mode !== 'duel' && mode !== 'multiplayer') {
    return `modes.${mode}.normal.hostHint`;
  }
  return `modes.${mode}.hostHint`;
}

function FormatFamilyPicker({
  selected,
  onSelect,
  modesFor,
}: {
  selected: GameModeFamily | null;
  onSelect: (family: GameModeFamily) => void;
  modesFor: (family: GameModeFamily) => ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="mb-3 flex flex-col gap-2">
      {(['normal', 'commander'] as const).map((family) => {
        const open = selected === family;
        return (
          <div key={family} className="border-muted/20 overflow-hidden rounded-xl border">
            <button
              type="button"
              onClick={() => onSelect(family)}
              className={cx(
                'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold transition',
                open
                  ? 'bg-neon/10 text-neon'
                  : 'text-muted hover:bg-ink/5 hover:text-ink',
              )}
              aria-expanded={open}
            >
              {t(`families.${family}`)}
              <ChevronDown
                size={16}
                className={cx('shrink-0 transition', open && 'rotate-180')}
                aria-hidden
              />
            </button>
            {open ? <div className="border-muted/15 border-t p-3">{modesFor(family)}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function ModeGrid({
  modes,
  value,
  name,
  onChange,
}: {
  modes: ReadonlyArray<{ id: StandaloneGameMode }>;
  value: StandaloneGameMode;
  name: string;
  onChange: (mode: StandaloneGameMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mb-2 grid grid-cols-2 gap-2">
      {modes.map((mode) => (
        <label
          key={mode.id}
          className={cx(
            'cursor-pointer rounded-xl border p-2.5 text-center text-sm font-semibold transition',
            value === mode.id
              ? 'border-neon bg-neon/10 text-neon'
              : 'border-muted/20 text-muted hover:border-muted/40',
          )}
        >
          <input
            type="radio"
            name={name}
            value={mode.id}
            checked={value === mode.id}
            onChange={() => onChange(mode.id)}
            className="sr-only"
          />
          {t(`modes.${mode.id}.label`)}
        </label>
      ))}
    </div>
  );
}
