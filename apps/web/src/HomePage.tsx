import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ASSASSIN_POD_SIZES,
  TREACHERY_POD_SIZES,
  type AssassinPodSize,
  type GameMode,
  type TreacheryPodSize,
} from '@podyguard/shared';
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
import { ThemeToggleCorner } from './ui/ThemeToggle';

export function HomePage() {
  const navigate = useNavigate();
  const staleJoin =
    (useLocation().state as { staleJoin?: boolean } | null)?.staleJoin === true;
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
  const ongoingMatch = activeMatchPath();
  const [trackerMode, setTrackerMode] = useState<StandaloneGameMode>(
    () => loadMatchConfig().gameMode,
  );
  const [trackerSeats, setTrackerSeats] = useState(
    () => loadMatchConfig().seatCount,
  );
  const trackerSeatOptions = seatCountsForMode(trackerMode);

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
      <header>
        <Brand className="mb-6" />
        <h1 className="font-display mb-3 text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
          Your next{' '}
          <span className="from-beam via-neon to-plasma bg-gradient-to-r bg-clip-text text-transparent">
            pod
          </span>
          , sorted.
        </h1>
        <ul className="text-muted mb-8 max-w-md space-y-2 leading-relaxed">
          <li>Create an event now.</li>
          <li>One host. One QR.</li>
          <li>No account. No bullshit.</li>
        </ul>
      </header>

      <Panel title="Life tracker" aside={ongoingMatch ? 'ongoing game' : 'no event needed'}>
        <p className="text-muted mb-4 text-sm">
          Open a battle screen immediately. You can leave it and return without
          losing an unfinished game.
        </p>
        <p className="text-muted mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          Game
        </p>
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STANDALONE_GAME_MODES.map((mode) => (
            <label
              key={mode.id}
              className={`cursor-pointer rounded-xl border p-3 text-center text-sm font-semibold transition ${
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
        <p className="text-muted mb-4 text-xs">
          {STANDALONE_GAME_MODES.find((mode) => mode.id === trackerMode)?.hint}
        </p>
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
      </Panel>

      <Panel title="Host an event" aside="new" onSubmit={onCreate}>
        <fieldset className="mb-5">
          <legend className="text-muted mb-2 text-sm">Game</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                className={`cursor-pointer rounded-xl border p-3 text-center text-sm font-semibold transition ${
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
                  onChange={() => {
                    setGameMode(value);
                  }}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
          {gameMode === 'treachery' ? (
            <p className="text-muted mt-2 text-xs">
              Secret roles for Commander pods. Matching fills your chosen table
              size first; leftovers can sit as small as four.
            </p>
          ) : gameMode === 'two-headed-giant' ? (
            <p className="text-muted mt-2 text-xs">
              Strict 4-player Commander pods. Two teams share 60 life and take
              their turns together.
            </p>
          ) : gameMode === 'archenemy-commander' ? (
            <p className="text-muted mt-2 text-xs">
              Strict 4-player Commander pods. One 60-life Archenemy faces a
              three-player team with 60 shared life and a 40-card scheme deck.
            </p>
          ) : gameMode === 'emperor' ? (
            <p className="text-muted mt-2 text-xs">
              Strict 6-player Commander pods. Two teams each place an Emperor
              between two Generals and play with limited range of influence.
            </p>
          ) : gameMode === 'star' ? (
            <p className="text-muted mt-2 text-xs">
              Strict 5-player Commander pods. Adjacent players are allies; each
              player wins by outlasting both opponents across the circle.
            </p>
          ) : gameMode === 'assassin' ? (
            <p className="text-muted mt-2 text-xs">
              Secret contracts for 3–8 players. Score by eliminating your mark,
              then inherit their target.
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
              Matching prefers {assassinPodSize}-player tables; leftovers can
              form contracts with as few as three.
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
          />
          <Button type="submit" variant="neon" size="lg" block>
            Open join page
          </Button>
        </form>
      </Panel>

      {staleJoin ? (
        <p className="text-muted text-sm">
          That event is gone. Join with a new code, or host a new night.
        </p>
      ) : null}
      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <p className="text-muted/70 text-xs">
        Host desk shows a QR for <code className="text-beam">#/e/JOINCODE</code>.{' '}
        <Link className="hover:text-ink" to="/match-config">
          Configure standalone game
        </Link>
      </p>
    </>
  );
}
