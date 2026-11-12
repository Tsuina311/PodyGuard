import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Playgroup, PlaygroupOverview } from '@podyguard/shared';
import { getAdminPlaygroup, getAdminPlaygroups } from './api';

export function AdminPage() {
  const [token, setToken] = useState('');
  const [groups, setGroups] = useState<Playgroup[]>([]);
  const [overview, setOverview] = useState<PlaygroupOverview | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(offset = 0) {
    setBusy(true); setError(''); setOverview(null);
    try {
      const result = await getAdminPlaygroups(token, offset);
      setGroups(result.playgroups); setNextOffset(result.nextOffset); setConnected(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load playgroups.'); }
    finally { setBusy(false); }
  }
  async function inspect(id: string) {
    setBusy(true); setError(''); setOverview(null);
    try { setOverview((await getAdminPlaygroup(token, id)).overview); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load playgroup.'); }
    finally { setBusy(false); }
  }
  function disconnect() { setToken(''); setGroups([]); setOverview(null); setConnected(false); setError(''); }
  return <section className="flex flex-col gap-5">
    <Link to="/">Back to PodyGuard</Link>
    <h1 className="font-display text-3xl">Playgroup administration</h1>
    <p>Read-only access to saved players, Commanders, results and statistics.</p>
    {!connected ? <form className="flex flex-col gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void load(); }}>
      <label>Admin access token<input className="block w-full rounded bg-void p-3" type="password" autoComplete="off" required value={token} onChange={event => setToken(event.target.value)} /></label>
      <button disabled={busy} type="submit">Open administration</button>
    </form> : <div className="flex gap-5"><button disabled={busy} onClick={() => void load()}>Refresh playgroups</button><button disabled={busy} onClick={disconnect}>Lock administration</button></div>}
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Loading playgroup data…</p>}
    {connected && !busy && groups.length === 0 && <p>No playgroups found.</p>}
    <ul className="flex flex-col gap-3">{groups.map(group => <li key={group.id}><button disabled={busy} onClick={() => void inspect(group.id)}>{group.name}</button><p className="text-xs text-muted">Owner {group.ownerUserId} · Updated {new Date(group.updatedAt).toLocaleString()}</p></li>)}</ul>
    {nextOffset !== null && <button disabled={busy} onClick={() => void load(nextOffset)}>Next playgroups</button>}
    {overview && <section className="flex flex-col gap-4" aria-label="Playgroup details">
      <h2 className="text-2xl">{overview.playgroup.name}</h2>
      <p>{overview.playerCount} players · {overview.recordedGamesCount} recorded games</p>
      {overview.guests.map(({ guest, savedDecks, stats }) => <article key={guest.id} className="rounded border border-muted/30 p-4">
        <h3 className="text-xl">{guest.displayName}</h3>
        <p>{stats.gamesPlayed} games · {stats.wins} wins · {stats.losses} losses · {stats.draws} draws · {stats.completedNoWinner} without a winner</p>
        <p>Commanders: {savedDecks.map(deck => `${deck.commanderName ?? deck.deckName ?? 'Unnamed deck'} (B${deck.bracket ?? '?'})`).join(', ') || 'None saved'}</p>
        <p>Played with: {stats.mostPlayedWith.map(player => `${player.displayName} (${player.gamesTogether})`).join(', ') || 'No recorded opponents'}</p>
      </article>)}
      <h3 className="text-xl">Recent games</h3>
      {overview.recentGames.map(game => <article key={game.id} className="rounded border border-muted/30 p-3"><p>{game.gameMode} · {new Date(game.endedAt ?? game.createdAt).toLocaleString()}</p><ul>{game.participants.map(player => <li key={player.id}>{player.displayNameSnapshot} · {player.commanderNameSnapshot ?? 'No commander recorded'} · {player.resultType ?? 'No result recorded'}</li>)}</ul></article>)}
    </section>}
  </section>;
}
