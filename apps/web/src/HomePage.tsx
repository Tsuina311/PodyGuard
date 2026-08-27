import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ASSASSIN_POD_SIZES,
  TREACHERY_POD_SIZES,
  type AssassinPodSize,
  type GameMode,
  type TreacheryPodSize,
} from '@podyguard/shared';
import { Play, QrCode, Radio } from 'lucide-react';
import { ApiError, createEvent, saveHostToken } from './api';
import { activeMatchPath } from './active-match';
import {
  loadMatchConfig,
  saveMatchConfig,
  seatCountForMode,
  seatCountsForMode,
  STANDALONE_GAME_MODES,
  type StandaloneGameMode,
} from './match-config';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';
import { QrScannerDialog } from './ui/QrScannerDialog';
import { ThemeToggleCorner } from './ui/ThemeToggle';

type ExpandedSection = 'play' | 'host' | null;

export function HomePage() {
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
  const [allowThreePods, setAllowThreePods] = useState(true);
  const [allowFivePods, setAllowFivePods] = useState(false);
  const [preferredPodSize, setPreferredPodSize] = useState<TreacheryPodSize>(4);
  const [assassinPodSize, setAssassinPodSize] = useState<AssassinPodSize>(5);
  const [lifetimeHours, setLifetimeHours] = useState('24');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trackerMode, setTrackerMode] = useState<StandaloneGameMode>(
    () => loadMatchConfig().gameMode,
  );
  const [trackerSeats, setTrackerSeats] = useState(
    () => loadMatchConfig().seatCount,
  );
  const trackerSeatOptions = seatCountsForMode(trackerMode);
  const trackerHint = STANDALONE_GAME_MODES.find(
    (mode) => mode.id === trackerMode,
  );

  function toggle(section: ExpandedSection) {
    setExpanded((current) => (current === section ? null : section));
    setError(null);
  }

  function pickTrackerMode(mode: StandaloneGameMode) {
    setTrackerMode(mode);
    setTrackerSeats((seats) => seatCountForMode(mode, seats));
  }

  function startTracker() {
    const config = loadMatchConfig();
    saveMatchConfig({
      ...config,
      gameMode: trackerMode,
      seatCount: trackerSeats,
      resetCount: config.resetCount + 1,
    });
    void navigate('/match');
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await createEvent(name, hostPin, Number(tableCount), {
        gameMode,
        allowThreePods: gameMode === 'commander' && allowThreePods,
        allowFivePods,
        preferredPodSize:
          gameMode === 'treachery'
            ? preferredPodSize
            : gameMode === 'assassin'
              ? assassinPodSize
              : gameMode === 'emperor'
                ? 6
                : gameMode === 'star'
                  ? 5
                  : 4,
        lifetimeHours: Number(lifetimeHours),
      });
      saveHostToken(result.event.joinCode, result.hostToken);
      void navigate(`/host/${result.event.joinCode}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not create event.',
      );
    } finally {
      setBusy(false);
    }
  }

  function onLookup(event: FormEvent) {
    event.preventDefault();
    const code = joinCode.trim();
    if (!code) {
      setError('Enter a join code.');
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
          Your next{' '}
          <span className="from-beam via-neon to-plasma bg-gradient-to-r bg-clip-text text-transparent">
            pod
          </span>
          , sorted.
        </h1>
      </header>

      <div className="grid gap-2">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Play size={18} aria-hidden />
              Start playing
            </span>
          }
          aside={ongoingMatch ? 'ongoing game' : 'no event needed'}
          expanded={expanded === 'play'}
          onToggle={() => toggle('play')}
        >
            <p className="text-muted mb-3 text-sm">
              Open a battle screen on this device. Leave and come back without
              losing an unfinished game.
            </p>
            <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
              Game
            </p>
            <div className="mb-2 grid grid-cols-2 gap-2">
              {STANDALONE_GAME_MODES.map((mode) => (
                <label
                  key={mode.id}
                  className={`cursor-pointer rounded-xl border p-2.5 text-center text-sm font-semibold transition ${
                    trackerMode === mode.id
                      ? 'border-neon bg-neon/10 text-neon'
                      : 'border-muted/20 text-muted hover:border-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="trackerMode"
                    value={mode.id}
                    checked={trackerMode === mode.id}
                    onChange={() => pickTrackerMode(mode.id)}
                    className="sr-only"
                  />
                  {mode.label}
                </label>
              ))}
            </div>
            <p className="text-muted mb-3 text-xs">{trackerHint?.hint}</p>
            <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
              Players
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
                Always {trackerSeatOptions[0]} players in this mode.
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
                  Resume game
                </Button>
                <Button
                  type="button"
                  variant="glass"
                  size="lg"
                  block
                  className="mt-2"
                  onClick={startTracker}
                >
                  Start a new game
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
                Start a game
              </Button>
            )}
            <p className="text-muted/70 mt-3 text-xs">
              <Link className="hover:text-ink" to="/match-config">
                Advanced match config
              </Link>
            </p>
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Radio size={18} aria-hidden />
              Host event
            </span>
          }
          aside="new"
          expanded={expanded === 'host'}
          onToggle={() => toggle('host')}
          onSubmit={onCreate}
        >            <fieldset className="mb-4">
              <legend className="text-muted mb-2 text-sm">Game</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['commander', 'Commander'],
                    ['treachery', 'Treachery'],
                    ['two-headed-giant', 'Two-Headed Giant'],
                    ['archenemy-commander', 'Archenemy Commander'],
                    ['emperor', 'Emperor'],
                    ['star', 'Star'],
                    ['assassin', 'Assassin'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-xl border p-2.5 text-center text-sm font-semibold transition ${
                      gameMode === value
                        ? 'border-neon bg-neon/10 text-neon'
                        : 'border-muted/20 text-muted hover:border-muted/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="gameMode"
                      value={value}
                      checked={gameMode === value}
                      onChange={() => setGameMode(value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {gameMode === 'treachery' ? (
                <p className="text-muted mt-2 text-xs">
                  Secret roles for Commander pods. Matching fills your chosen
                  table size first; leftovers can sit as small as four.
                </p>
              ) : gameMode === 'two-headed-giant' ? (
                <p className="text-muted mt-2 text-xs">
                  Strict 4-player Commander pods. Two teams share 60 life and
                  take their turns together.
                </p>
              ) : gameMode === 'archenemy-commander' ? (
                <p className="text-muted mt-2 text-xs">
                  Strict 4-player Commander pods. One 60-life Archenemy faces a
                  three-player team with 60 shared life and a 40-card scheme
                  deck.
                </p>
              ) : gameMode === 'emperor' ? (
                <p className="text-muted mt-2 text-xs">
                  Strict 6-player Commander pods. Two teams each place an
                  Emperor between two Generals and play with limited range of
                  influence.
                </p>
              ) : gameMode === 'star' ? (
                <p className="text-muted mt-2 text-xs">
                  Strict 5-player Commander pods. Adjacent players are allies;
                  each player wins by outlasting both opponents across the
                  circle.
                </p>
              ) : gameMode === 'assassin' ? (
                <p className="text-muted mt-2 text-xs">
                  Secret contracts for 3–8 players. Score by eliminating your
                  mark, then inherit their target.
                </p>
              ) : null}
            </fieldset>
            <Field
              label="Event name"
              value={name}
              onChange={(change) => setName(change.target.value)}
              placeholder="Friday Commander"
              autoComplete="off"
              required
            />
            <Field
              label="Tables"
              hint="How many physical tables are free for this event."
              value={tableCount}
              onChange={(change) => setTableCount(change.target.value)}
              type="number"
              inputMode="numeric"
              min={1}
              max={40}
              required
            />
            {gameMode === 'commander' ? (
              <label className="text-muted mb-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowThreePods}
                  onChange={(change) => setAllowThreePods(change.target.checked)}
                />
                Allow 3-player pods
              </label>
            ) : gameMode === 'treachery' ? (
              <fieldset className="mb-4">
                <legend className="text-muted mb-2 text-sm">
                  Target table size
                </legend>
                <div className="grid grid-cols-5 gap-2">
                  {TREACHERY_POD_SIZES.map((size) => (
                    <label
                      key={size}
                      className={`cursor-pointer rounded-xl border p-2 text-center text-sm font-semibold transition ${
                        preferredPodSize === size
                          ? 'border-neon bg-neon/10 text-neon'
                          : 'border-muted/20 text-muted hover:border-muted/40'
                      }`}
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
                <p className="text-muted mt-2 text-xs">
                  {preferredPodSize >= 5
                    ? `Matchmaking prefers ${String(preferredPodSize)}-player tables.`
                    : 'Matchmaking prefers 4-player tables.'}
                </p>
              </fieldset>
            ) : gameMode === 'assassin' ? (
              <fieldset className="mb-4">
                <legend className="text-muted mb-2 text-sm">
                  Target table size
                </legend>
                <div className="grid grid-cols-6 gap-2">
                  {ASSASSIN_POD_SIZES.map((size) => (
                    <label
                      key={size}
                      className={`cursor-pointer rounded-xl border p-2 text-center text-sm font-semibold transition ${
                        assassinPodSize === size
                          ? 'border-neon bg-neon/10 text-neon'
                          : 'border-muted/20 text-muted hover:border-muted/40'
                      }`}
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
                <p className="text-muted mt-2 text-xs">
                  Matching prefers {assassinPodSize}-player tables; leftovers
                  can form contracts with as few as three.
                </p>
              </fieldset>
            ) : gameMode === 'emperor' ? (
              <p className="text-muted mb-4 text-sm">
                Emperor games always seat exactly six players.
              </p>
            ) : gameMode === 'star' ? (
              <p className="text-muted mb-4 text-sm">
                Star games always seat exactly five players.
              </p>
            ) : gameMode === 'archenemy-commander' ? (
              <p className="text-muted mb-4 text-sm">
                Archenemy Commander games always seat exactly four players.
              </p>
            ) : (
              <p className="text-muted mb-4 text-sm">
                Two-Headed Giant games always seat exactly four players.
              </p>
            )}
            {gameMode === 'commander' ? (
              <label className="text-muted mb-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowFivePods}
                  onChange={(change) => setAllowFivePods(change.target.checked)}
                />
                Allow 5-player pods
              </label>
            ) : null}
            <Field
              label="Event lasts"
              hint="Join code dies after this many hours. Use 48 or 72 for a weekend."
              value={lifetimeHours}
              onChange={(change) => setLifetimeHours(change.target.value)}
              type="number"
              inputMode="numeric"
              min={1}
              max={168}
              required
            />
            <Field
              label="Host PIN"
              hint="4 to 8 digits — reopens the host desk later."
              value={hostPin}
              onChange={(change) => setHostPin(change.target.value)}
              inputMode="numeric"
              autoComplete="off"
              required
            />
            <Button type="submit" size="lg" block disabled={busy}>
              {busy ? 'Creating…' : 'Create event'}
            </Button>
        </Panel>
      </div>

      <Panel title="Join with a code" aside="player">
        <form onSubmit={onLookup}>
          <Field
            label="Join code"
            value={joinCode}
            onChange={(change) => setJoinCode(change.target.value)}
            placeholder="AB23CD"
            autoComplete="off"
            className="font-mono tracking-[0.3em] uppercase"
            required
            wrapperClassName="mb-3"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="submit" variant="neon" size="lg" block>
              Join
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
              Scan QR
            </Button>
          </div>
        </form>
      </Panel>

      {staleJoin ? (
        <p className="text-muted text-sm">
          That event is gone. Join with a new code, or host a new night.
        </p>
      ) : null}
      {error ? <p className="text-danger text-sm">{error}</p> : null}

      {scannerOpen
        ? (
            <QrScannerDialog
              onClose={() => setScannerOpen(false)}
              onDetect={(code) => {
                setScannerOpen(false);
                void navigate(`/e/${code}`);
              }}
            />
          )
        : null}
    </>
  );
}
