import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  gameNightCalendar,
  type GameNight,
  type NightView,
  type NightRsvp,
} from '@podyguard/shared';
import { loadAccountToken, saveHostToken } from '../api';
import { readStored, writeStored } from '../device-storage';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Panel } from '../ui/Panel';
import { Agreement } from './Agreement';
import {
  cancelNight,
  createNight,
  getNight,
  listNights,
  rsvpNight,
  startNight,
} from './api';

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Could not save. Please try again.';
}
function when(night: GameNight) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: night.timeZone,
  }).format(new Date(night.startsAt));
}
function download(night: GameNight) {
  const url = URL.createObjectURL(
    new Blob([gameNightCalendar(night)], {
      type: 'text/calendar;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'podyguard-night.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function GameNightsPanel({
  playgroupId,
  token,
}: {
  playgroupId: string;
  token: string;
}) {
  const [nights, setNights] = useState<GameNight[]>([]);
  const [name, setName] = useState('Commander night');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [seats, setSeats] = useState('4');
  const [pace, setPace] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {
    let active = true;
    setNights([]);
    setError('');
    void listNights(playgroupId, token)
      .then((r) => {
        if (active) setNights(r.nights);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [playgroupId, token]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { night } = await createNight(playgroupId, token, {
        name,
        startsAt: new Date(date).toISOString(),
        timeZone,
        location,
        seatTarget: Number(seats),
        agreement: {
          ...(pace ? { pace: pace as 'relaxed' | 'focused' } : {}),
          ...(duration ? { durationMinutes: Number(duration) } : {}),
          ...(notes.trim() ? { notes } : {}),
        },
      });
      setNights((previous) => [night, ...previous]);
      setDate('');
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Plan the next night">
      <p className="mb-3 text-sm text-muted">
        Share an invitation with friends. RSVPs do not reserve a table or mark
        players ready. Anyone with the invitation link can see the location and
        responses.
      </p>
      <form onSubmit={(e) => void submit(e)}>
        <Field
          label="Night name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label={`Date and time (${timeZone})`}
          type="datetime-local"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field
          label="Location note"
          maxLength={200}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <Field
          label="Seat target"
          type="number"
          min={2}
          max={100}
          required
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
        />
        <details className="mb-4">
          <summary>Optional pregame agreement</summary>
          <label className="my-3 block">
            Pace{' '}
            <select
              className="rounded border p-2 bg-void"
              aria-label="Pace"
              value={pace}
              onChange={(e) => setPace(e.target.value)}
            >
              <option value="">Discuss at the table</option>
              <option value="relaxed">Relaxed</option>
              <option value="focused">Focused</option>
            </select>
          </label>
          <Field
            label="Target game length (minutes)"
            type="number"
            min={15}
            max={480}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
          <Field
            label="Table preferences (combos, extra turns, anything to discuss)"
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </details>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Create invitation'}
        </Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      <ul className="mt-4 space-y-3">
        {nights.map((n) => (
          <li key={n.id}>
            <Link className="text-neon underline" to={`/nights/${n.id}`}>
              {n.name}
            </Link>
            <p className="text-sm">
              {when(n)} ({n.timeZone})
              {n.cancelled
                ? ' · Cancelled'
                : n.eventJoinCode
                  ? ' · Started'
                  : ''}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
export function GameNightPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<NightView | null>(null);
  const [name, setName] = useState('');
  const [response, setResponse] = useState<NightRsvp['response']>('yes');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [owns, setOwns] = useState(false);
  const token = loadAccountToken();
  async function refresh() {
    setView(await getNight(id));
  }
  useEffect(() => {
    let active = true;
    setView(null);
    setOwns(false);
    setError('');
    setMessage('');
    setName('');
    setResponse('yes');
    const stored = readStored(`podyguard.night.answer.${id}`);
    if (stored) {
      try {
        const a = JSON.parse(stored) as NightRsvp;
        if (
          typeof a.displayName === 'string' &&
          ['yes', 'maybe', 'no'].includes(a.response)
        ) {
          setName(a.displayName);
          setResponse(a.response);
        }
      } catch {
        /* start a fresh response */
      }
    }
    void getNight(id)
      .then(async (v) => {
        if (!active) return;
        setView(v);
        if (token) {
          try {
            await listNights(v.night.playgroupId, token);
            if (active) setOwns(true);
          } catch {
            /* invitation viewer is not the owner */
          }
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [id, token]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!view)
    return (
      <Panel title="Game night">
        {error ? <p role="alert">{error}</p> : <p>Loading invitation…</p>}
        <Link to="/">Home</Link>
      </Panel>
    );
  const { night, responses } = view;
  const closed =
    night.cancelled ||
    Boolean(night.eventJoinCode) ||
    Date.now() >= Date.parse(night.startsAt) + 24 * 3600_000;
  return (
    <Panel title={night.name}>
      <p>
        {when(night)} ({night.timeZone})
      </p>
      <p className="break-words">{night.location}</p>
      <p>
        {responses.filter((r) => r.response === 'yes').length} Yes ·{' '}
        {responses.filter((r) => r.response === 'maybe').length} Maybe ·{' '}
        {responses.filter((r) => r.response === 'no').length} No · Target{' '}
        {night.seatTarget}
      </p>
      <Agreement agreement={night.agreement} />
      <div className="my-3 flex flex-wrap gap-2">
        <Button onClick={() => download(night)}>Add to calendar</Button>
        <Button
          onClick={() =>
            void act(async () => {
              await navigator.clipboard.writeText(window.location.href);
              setMessage('Invitation link copied.');
            })
          }
        >
          Copy invitation
        </Button>
        <Button disabled={busy} onClick={() => void act(refresh)}>
          Refresh responses
        </Button>
      </div>
      <p className="text-sm text-muted">
        Anyone with this link can view these responses. Use a first name or
        nickname. Your response key stays on this browser so you can change your
        answer.
      </p>
      <ul className="my-3">
        {responses.map((r, index) => (
          <li key={index}>
            {r.displayName}: {r.response}
          </li>
        ))}
      </ul>
      {closed ? (
        <p role="status">
          {night.cancelled
            ? 'This night was cancelled.'
            : night.eventJoinCode
              ? 'This night has started.'
              : 'This invitation has expired.'}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const key = `podyguard.night.key.${id}`;
              let secret = readStored(key);
              if (!secret || !/^[a-zA-Z0-9_-]{32,128}$/.test(secret)) {
                secret = crypto.randomUUID().replaceAll('-', '');
                writeStored(key, secret);
              }
              await rsvpNight(id, secret, { displayName: name, response });
              writeStored(
                `podyguard.night.answer.${id}`,
                JSON.stringify({ displayName: name, response }),
              );
              await refresh();
              setMessage('Response saved.');
            });
          }}
        >
          <Field
            label="Your name"
            required
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="mb-3 block">
            Your response{' '}
            <select
              className="bg-void rounded border p-2"
              value={response}
              onChange={(e) =>
                setResponse(e.target.value as NightRsvp['response'])
              }
            >
              <option value="yes">Yes</option>
              <option value="maybe">Maybe</option>
              <option value="no">No</option>
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            Save response
          </Button>
        </form>
      )}
      {night.eventJoinCode ? (
        <p className="my-3">
          <Link
            className="text-neon underline"
            to={`/e/${night.eventJoinCode}`}
          >
            Join event
          </Link>
          {owns ? (
            <>
              {' '}
              ·{' '}
              <Link
                className="text-neon underline"
                to={`/host/${night.eventJoinCode}`}
              >
                Host desk
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {owns && !closed && token ? (
        <section className="mt-5 border-t border-muted/30 pt-4">
          <h3>Host controls</h3>
          <Field
            label="Host PIN"
            type="password"
            inputMode="numeric"
            minLength={4}
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <Button
            disabled={busy || !/^\d{4,8}$/.test(pin)}
            onClick={() =>
              void act(async () => {
                const result = await startNight(id, token, pin);
                saveHostToken(result.event.joinCode, result.hostToken);
                navigate(`/host/${result.event.joinCode}`);
              })
            }
          >
            Start event
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Cancel this game night?'))
                void act(async () => {
                  await cancelNight(id, token);
                  await refresh();
                });
            }}
          >
            Cancel night
          </Button>
          <p className="text-sm text-muted">
            Starting creates a Commander event. Friends still join and mark
            themselves ready.
          </p>
        </section>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <p className="mt-4">
        <Link className="text-neon underline" to="/account">
          My playgroups
        </Link>
      </p>
    </Panel>
  );
}
