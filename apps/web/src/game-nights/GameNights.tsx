import { rememberRecentEvent } from '../recent-events';
import { useTranslation } from 'react-i18next';
import { ThemeToggleCorner } from '../ui/ThemeToggle';
import { Check, Clock3, LockKeyhole, UsersRound, X } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  gameNightCalendar,
  gameNightEventType,
  type GameNight,
  type NightView,
  type NightRsvp,
} from '@podyguard/shared';
import { loadAccountToken, saveHostToken } from '../api';
import { readStored, writeStored } from '../device-storage';
import { createPlayerScope } from '../player-sessions';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Panel } from '../ui/Panel';
import { Agreement } from './Agreement';
import { cx } from '../ui/cx';
import {
  cancelNight,
  createNight,
  getNight,
  listNights,
  rsvpNight,
  startNight,
} from './api';

const attendanceStyles = {
  yes: { icon: Check, className: 'border-gain/25 bg-gain/15' },
  maybe: { icon: Clock3, className: 'border-warning/25 bg-warning/15' },
  no: { icon: X, className: 'border-muted/25 bg-ink/5' },
};

function InvitationAttendance({ responses, seatTarget }: Pick<NightView, 'responses'> & {
  seatTarget: number;
}) {
  const { t } = useTranslation();
  const confirmed = responses.filter(row => row.response === 'yes').length;
  const filled = Math.min(confirmed, seatTarget);
  const full = confirmed >= seatTarget;

  return (
    <section aria-label={t('invitationPlan.attendance.title')} className="my-4 rounded-2xl border border-muted/25 bg-void/80 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <UsersRound size={20} aria-hidden />
          {t('invitationPlan.attendance.title')}
        </h3>
        {full && <span className="rounded-lg bg-gain/15 px-2.5 py-1 text-xs font-semibold text-ink">{t('invitationPlan.attendance.full')}</span>}
      </div>
      <p aria-live="polite" className="mt-2 text-sm text-muted">
        <span className="font-display text-3xl font-bold tabular-nums text-ink">{confirmed}</span>{' '}
        {t('invitationPlan.attendance.capacity', { total: seatTarget })}
      </p>
      <div
        role="progressbar"
        aria-label={t('invitationPlan.attendance.progress')}
        aria-valuemin={0}
        aria-valuemax={seatTarget}
        aria-valuenow={filled}
        className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10"
      >
        <div className="h-full rounded-full bg-gain" style={{ width: `${filled / seatTarget * 100}%` }} />
      </div>
      {responses.length ? (
        <ul className="mt-3 divide-y divide-muted/20">
          {responses.map((row, index) => {
            const { icon: Icon, className } = attendanceStyles[row.response];
            return (
              <li key={index} className="flex items-center gap-3 py-2.5">
                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neon/15 text-sm font-bold text-ink">
                  {Array.from(row.displayName.trim())[0]?.toLocaleUpperCase()}
                </span>
                <span className="min-w-0 flex-1 break-words text-sm font-semibold text-ink">{row.displayName}</span>
                <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold text-ink', className)}>
                  <Icon size={14} aria-hidden />
                  {t(`invitationPlan.attendance.${row.response}`)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{t('invitationPlan.attendance.empty')}</p>
      )}
      <p className="mt-3 flex items-start gap-2 text-xs text-muted">
        <LockKeyhole size={14} aria-hidden className="shrink-0" />
        {t('invitationPlan.attendance.visibility')}
      </p>
    </section>
  );
}

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
      rememberRecentEvent(`/nights/${night.id}`, night.name);
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
  const { t } = useTranslation();
  const nameHintId = useId();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<NightView | null>(null);
  const [name, setName] = useState('');
  const [response, setResponse] = useState<NightRsvp['response']>('yes');
  const [guestProfileId, setGuestProfileId] = useState('');
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
    setGuestProfileId('');
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
          setGuestProfileId(a.guestProfileId ?? '');
        }
      } catch {
        /* start a fresh response */
      }
    }
    void getNight(id)
      .then(async (v) => {
        if (!active) return;
        setView(v);
        rememberRecentEvent(`/nights/${id}`, v.night.name);
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
  useEffect(() => {
    let active = true;
    let pending = false;
    const check = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const latest = await getNight(id);
        if (active) setView(latest);
      } catch {
        // Keep the invitation and retry when the connection returns.
      } finally {
        pending = false;
      }
    };
    const timer = window.setInterval(() => void check(), 5000);
    const refresh = () => void check();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [id]);
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
    <>
      <ThemeToggleCorner />
    <Panel title={night.name}>
      <Link to="/" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-muted/30 px-4 font-semibold text-ink hover:border-neon/50">
        <span aria-hidden>←</span>{t('navigation.home')}
      </Link>
      {night.eventJoinCode && !night.cancelled ? <div className="mb-4 rounded-xl border border-neon/40 p-3">
        <p className="mb-2 font-semibold">The event is live. Join your friends at the table.</p>
        <Link className="inline-flex min-h-11 items-center rounded-xl border border-neon/40 px-4 text-neon" to={`/e/${night.eventJoinCode}`}>Join event</Link>
        {owns ? <Link className="ml-3 inline-flex min-h-11 items-center text-neon underline" to={`/host/${night.eventJoinCode}`}>Host desk</Link> : null}
      </div> : null}
      <p>
        {when(night)} ({night.timeZone})
      </p>
      <p className="break-words">{night.location}</p>
      <p className="my-2 font-semibold">{t('invitationPlan.eventType')}: {gameNightEventType(night)}</p>
      {night.invitees?.length ? <section className="my-3">
        <h3 className="font-semibold">{t('invitationPlan.invited')}</h3>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {night.invitees.map(person => <li key={person.guestProfileId}>{person.displayName}</li>)}
        </ul>
      </section> : null}
      {owns && night.eventSetup && !night.eventJoinCode && <p className="my-2 text-sm text-muted">{t('invitationPlan.savedSetup')}</p>}
      <Agreement agreement={night.agreement} />
      <div className="my-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => download(night)}>Add to calendar</Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void act(async () => {
              await navigator.clipboard.writeText(window.location.href);
              setMessage('Invitation link copied.');
            })
          }
        >
          Copy invitation
        </Button>
        <Button size="sm" variant="glass" disabled={busy} onClick={() => void act(refresh)}>
          Refresh responses
        </Button>
      </div>
      <InvitationAttendance responses={responses} seatTarget={night.seatTarget} />
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
                secret = createPlayerScope().replaceAll('-', '');
                writeStored(key, secret);
              }
              const answer: NightRsvp = { displayName: name, response, ...(guestProfileId ? { guestProfileId } : {}) };
              await rsvpNight(id, secret, answer);
              writeStored(
                `podyguard.night.answer.${id}`,
                JSON.stringify(answer),
              );
              await refresh();
              setMessage('Response saved.');
            });
          }}
        >
          {night.invitees?.length ? <label className="mb-3 block text-sm">
            <span className="mb-1 block">{t('invitationPlan.choosePlayer')}</span>
            <select aria-label={t('invitationPlan.choosePlayer')} className="w-full rounded-xl border border-muted/30 bg-void px-3 py-2 text-base" value={guestProfileId}
              onChange={event => {
                setGuestProfileId(event.target.value);
                const selected = night.invitees?.find(person => person.guestProfileId === event.target.value);
                if (selected) setName(selected.displayName);
              }}>
              <option value="">{t('invitationPlan.anotherName')}</option>
              {night.invitees.map(person => <option key={person.guestProfileId} value={person.guestProfileId}>{person.displayName}</option>)}
            </select>
            <span className="mt-1 block text-xs text-muted">{t('invitationPlan.nicknameHint')}</span>
          </label> : null}
          <p id={nameHintId} className="mb-2 text-xs text-muted">{t('invitationPlan.attendance.nameHint')}</p>
          <Field
            label="Your name"
            aria-describedby={nameHintId}
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
                saveHostToken(result.event.joinCode, result.hostToken, result.event.name);
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
            {t('invitationPlan.startHint', { type: gameNightEventType(night) })}
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
    </>
  );
}
