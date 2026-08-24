import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, createEvent, saveHostToken } from './api';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';
import { ThemeToggleCorner } from './ui/ThemeToggle';

export function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [hostPin, setHostPin] = useState('');
  const [tableCount, setTableCount] = useState('8');
  const [allowThreePods, setAllowThreePods] = useState(true);
  const [allowFivePods, setAllowFivePods] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await createEvent(name, hostPin, Number(tableCount), {
        allowThreePods,
        allowFivePods,
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
          Matchmaking for the{' '}
          <span className="from-beam via-neon to-plasma bg-gradient-to-r bg-clip-text text-transparent">
            table
          </span>
          .
        </h1>
        <p className="text-muted mb-8 max-w-md leading-relaxed">
          Set the tables you have tonight, pick a host PIN, share the join code,
          and let players queue from their phone. No accounts, no downloads.
        </p>
      </header>

      <Panel title="Host an event" aside="new" onSubmit={onCreate}>
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
        <label className="text-muted mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowThreePods}
            onChange={(change) => setAllowThreePods(change.target.checked)}
          />
          Allow 3-player pods
        </label>
        <label className="text-muted mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowFivePods}
            onChange={(change) => setAllowFivePods(change.target.checked)}
          />
          Allow 5-player pods
        </label>
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

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <p className="text-muted/70 text-xs">
        Host desk shows a QR for <code className="text-beam">#/e/JOINCODE</code>.{' '}
        <Link className="hover:text-ink" to="/match-config">
          Match sandbox
        </Link>
      </p>
    </>
  );
}
