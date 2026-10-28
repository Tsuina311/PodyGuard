import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  COMMANDER_POOLS,
  poolShortLabel,
  type DerivedStats,
  type GameRecord,
  type GuestProfile,
  type Playgroup,
  type PlaygroupGuestOverview,
  type PlaygroupOverview,
  type SavedDeckProfile,
  type UserAccount,
} from '@podyguard/shared';
import {
  Plus,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  History,
  LogOut,
  Check,
} from 'lucide-react';
import {
  ApiError,
  claimGuestHistory,
  clearAccountSession,
  createGuestProfile,
  createPlaygroup,
  createSavedDeckProfile,
  deleteGuestProfile,
  deleteMyAccount,
  deletePlaygroup,
  deleteSavedDeckProfile,
  getMyAccount,
  getPlaygroupOverview,
  loadAccountSession,
  loadPreferredPlaygroupId,
  mergeGuestProfiles,
  saveAccountSession,
  savePreferredPlaygroupId,
  startEmailAuth,
  updateGuestProfile,
  updateMyAccount,
  updatePlaygroup,
  updateSavedDeckProfile,
  verifyEmailAuth,
} from './api';
import { CommanderPicker } from './CommanderPicker';
import type { CommanderSelection } from './scryfall';
import { Badge } from './ui/Badge';
import { Brand } from './ui/Brand';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';
import { ThemeToggleCorner } from './ui/ThemeToggle';
import { cx } from './ui/cx';

const inputClass =
  'h-10 w-full rounded-lg border border-muted/20 bg-void/70 px-3 text-sm outline-none placeholder:text-muted/50 focus:border-neon/70';

export function AccountPage() {
  const navigate = useNavigate();
  const { playgroupId: routePlaygroupId } = useParams();
  const [session, setSession] = useState(() => loadAccountSession());
  const [account, setAccount] = useState<UserAccount | null>(
    () => loadAccountSession()?.account ?? null,
  );
  const [playgroups, setPlaygroups] = useState<Playgroup[]>([]);
  const [selectedPlaygroupId, setSelectedPlaygroupId] = useState<string | null>(
    () => routePlaygroupId ?? loadPreferredPlaygroupId(),
  );
  const [overview, setOverview] = useState<PlaygroupOverview | null>(null);
  const [personalStats, setPersonalStats] = useState<DerivedStats | null>(null);
  const [personalGames, setPersonalGames] = useState<GameRecord[]>([]);
  const [claimableGuests, setClaimableGuests] = useState<
    Array<{ guest: GuestProfile; playgroupName: string }>
  >([]);

  // Auth form state
  const [authEmail, setAuthEmail] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
  const [authCode, setAuthCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);

  // Playgroup & guest form state
  const [newPlaygroupName, setNewPlaygroupName] = useState('');
  const [showNewPlaygroupForm, setShowNewPlaygroupForm] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [duplicateArmedName, setDuplicateArmedName] = useState<string | null>(
    null,
  );
  const [expandedGuestId, setExpandedGuestId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState(false);
  const [accountNameDraft, setAccountNameDraft] = useState('');
  const [deleteAccountArmed, setDeleteAccountArmed] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlaygroup = useCallback(
    async (token: string, pgId: string) => {
      try {
        const res = await getPlaygroupOverview(token, pgId);
        setOverview(res.overview);
        savePreferredPlaygroupId(pgId);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 404) {
          setOverview(null);
        } else {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Could not load playgroup.',
          );
        }
      }
    },
    [],
  );

  const refreshDashboard = useCallback(
    async (token: string, preferredPgId?: string | null) => {
      try {
        const me = await getMyAccount(token);
        setAccount(me.account);
        saveAccountSession({ token, account: me.account });
        setPlaygroups(me.playgroups);
        setPersonalStats(me.stats);
        setPersonalGames(me.recentGames);
        setClaimableGuests(me.claimableGuests);

        const targetPgId =
          (preferredPgId &&
          me.playgroups.some((pg) => pg.id === preferredPgId)
            ? preferredPgId
            : null) ??
          me.playgroups[0]?.id ??
          null;
        setSelectedPlaygroupId(targetPgId);
        if (targetPgId) {
          await loadPlaygroup(token, targetPgId);
        } else {
          setOverview(null);
        }
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          clearAccountSession();
          setSession(null);
          setAccount(null);
          return;
        }
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Could not load account.',
        );
      }
    },
    [loadPlaygroup],
  );

  useEffect(() => {
    if (!session?.token) return;
    void refreshDashboard(
      session.token,
      routePlaygroupId ?? loadPreferredPlaygroupId(),
    );
  }, [refreshDashboard, routePlaygroupId, session?.token]);

  async function onStartAuth(submit: FormEvent) {
    submit.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await startEmailAuth(authEmail, authDisplayName);
      setAuthStep('code');
      if (res.devCode) {
        setDevCode(res.devCode);
        setAuthCode(res.devCode);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not start sign-in.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyAuth(submit: FormEvent) {
    submit.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await verifyEmailAuth(authEmail, authCode, authDisplayName);
      const nextSession = { token: res.token, account: res.account };
      saveAccountSession(nextSession);
      setSession(nextSession);
      setAccount(res.account);
      setAuthStep('email');
      setAuthCode('');
      setDevCode(null);
      await refreshDashboard(res.token);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not verify code.',
      );
    } finally {
      setBusy(false);
    }
  }

  function onSignOut() {
    clearAccountSession();
    setSession(null);
    setAccount(null);
    setPlaygroups([]);
    setOverview(null);
    setPersonalStats(null);
    setPersonalGames([]);
  }

  async function onCreatePlaygroup(submit: FormEvent) {
    submit.preventDefault();
    if (!session?.token || !newPlaygroupName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createPlaygroup(session.token, newPlaygroupName.trim());
      setNewPlaygroupName('');
      setShowNewPlaygroupForm(false);
      await refreshDashboard(session.token, res.playgroup.id);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not create playgroup.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSelectPlaygroup(pgId: string) {
    if (!session?.token) return;
    setSelectedPlaygroupId(pgId);
    setError(null);
    await loadPlaygroup(session.token, pgId);
  }

  async function onAddGuest(submit: FormEvent, allowDuplicate = false) {
    submit.preventDefault();
    if (!session?.token || !selectedPlaygroupId || !newGuestName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createGuestProfile(
        session.token,
        selectedPlaygroupId,
        newGuestName.trim(),
        allowDuplicate,
      );
      setNewGuestName('');
      setDuplicateArmedName(null);
      setExpandedGuestId(res.guest.id);
      await loadPlaygroup(session.token, selectedPlaygroupId);
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.code === 'DUPLICATE_GUEST_NAME'
      ) {
        setDuplicateArmedName(newGuestName.trim());
      }
      setError(
        caught instanceof ApiError ? caught.message : 'Could not add player.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onClaimGuest(guestProfileId: string) {
    if (!session?.token) return;
    setBusy(true);
    setError(null);
    try {
      await claimGuestHistory(session.token, guestProfileId);
      await refreshDashboard(session.token, selectedPlaygroupId);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not claim guest history.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAccountName(submit: FormEvent) {
    submit.preventDefault();
    if (!session?.token || !accountNameDraft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await updateMyAccount(session.token, accountNameDraft.trim());
      setAccount(res.account);
      saveAccountSession({ token: session.token, account: res.account });
      setEditingAccountName(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not update display name.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAccount() {
    if (!session?.token) return;
    if (!deleteAccountArmed) {
      setDeleteAccountArmed(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(session.token);
      onSignOut();
      void navigate('/');
    } catch (caught) {
      setDeleteAccountArmed(false);
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not delete account.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!session || !account) {
    return (
      <>
        <ThemeToggleCorner />
        <header>
          <Brand className="mb-6" />
          <h1 className="font-display mb-2 text-3xl font-bold tracking-tight">
            Host Account & Playgroups
          </h1>
          <p className="text-muted mb-6 text-sm">
            Create or sign in to a persistent account to manage playgroups, seed
            saved guests and their Commanders, and track game history. Players
            joining your events never need an account.
          </p>
        </header>

        {authStep === 'email' ? (
          <Panel
            title="Sign in or create account"
            aside="Low-friction email code"
            onSubmit={onStartAuth}
          >
            <Field
              label="Email"
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <Field
              label="Display name"
              hint="Shown when you host or play in events"
              value={authDisplayName}
              onChange={(e) => setAuthDisplayName(e.target.value)}
              placeholder="Alex"
              autoComplete="nickname"
            />
            <Button type="submit" variant="neon" size="lg" block disabled={busy}>
              {busy ? 'Sending code...' : 'Continue with email'}
            </Button>
          </Panel>
        ) : (
          <Panel
            title="Enter verification code"
            aside={authEmail}
            onSubmit={onVerifyAuth}
          >
            {devCode ? (
              <div className="border-neon/40 bg-neon/10 mb-4 rounded-xl border p-3 text-xs">
                <p className="text-neon font-semibold">
                  Verification code ready: <span className="font-mono">{devCode}</span>
                </p>
                <p className="text-muted mt-1">
                  Code pre-filled below for instant sign-in.
                </p>
              </div>
            ) : null}
            <Field
              label="6-digit code"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              className="font-mono tracking-[0.3em]"
              required
            />
            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                variant="neon"
                size="lg"
                block
                disabled={busy}
              >
                {busy ? 'Signing in...' : 'Verify & sign in'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                onClick={() => {
                  setAuthStep('email');
                  setError(null);
                }}
              >
                Use a different email
              </Button>
            </div>
          </Panel>
        )}

        {error ? <p className="text-danger text-sm">{error}</p> : null}

        <p className="text-muted/70 text-xs">
          <Link className="hover:text-ink" to="/">
            Home
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <ThemeToggleCorner />
      <header>
        <Brand className="mb-6" />
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {account.displayName}
            </h1>
            {account.email ? (
              <p className="text-muted text-xs">{account.email}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="glass"
              onClick={() => {
                setAccountNameDraft(account.displayName);
                setEditingAccountName((v) => !v);
              }}
            >
              Edit profile
            </Button>
            <Button size="sm" variant="ghost" onClick={onSignOut}>
              <LogOut size={14} aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {editingAccountName ? (
        <Panel title="Profile" onSubmit={onSaveAccountName}>
          <Field
            label="Display name"
            value={accountNameDraft}
            onChange={(e) => setAccountNameDraft(e.target.value)}
            required
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="neon" disabled={busy}>
              Save name
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditingAccountName(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              className="ml-auto"
              onClick={() => void onDeleteAccount()}
              onBlur={() => setDeleteAccountArmed(false)}
            >
              {deleteAccountArmed
                ? 'Confirm delete account'
                : 'Delete account'}
            </Button>
          </div>
        </Panel>
      ) : null}

      {claimableGuests.length > 0 ? (
        <Panel title="Claim saved player history" aside="Identity link">
          <div className="space-y-2">
            {claimableGuests.map(({ guest, playgroupName }) => (
              <div
                key={guest.id}
                className="border-neon/30 bg-neon/5 flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
              >
                <div>
                  <p className="font-semibold">
                    This saved player looks like you: {guest.displayName}
                  </p>
                  <p className="text-muted text-xs">
                    Playgroup: {playgroupName}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="neon"
                  disabled={busy}
                  onClick={() => void onClaimGuest(guest.id)}
                >
                  <UserCheck size={14} aria-hidden />
                  Claim history
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Users size={18} aria-hidden />
            My Playgroups
          </span>
        }
        aside={`${playgroups.length}`}
      >
        {playgroups.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {playgroups.map((pg) => (
              <button
                key={pg.id}
                type="button"
                onClick={() => void onSelectPlaygroup(pg.id)}
                className={cx(
                  'rounded-xl border px-3 py-2 text-sm font-semibold transition',
                  selectedPlaygroupId === pg.id
                    ? 'border-neon bg-neon/15 text-neon'
                    : 'border-muted/20 text-muted hover:border-muted/40 hover:text-ink',
                )}
              >
                {pg.name}
              </button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowNewPlaygroupForm((v) => !v)}
            >
              <Plus size={14} aria-hidden />
              New playgroup
            </Button>
          </div>
        ) : (
          <p className="text-muted mb-4 text-sm">
            Create your first playgroup (for example, &ldquo;Friday Friends&rdquo;)
            to seed your friends&apos; names and their Commanders before tonight&apos;s
            game.
          </p>
        )}

        {playgroups.length === 0 || showNewPlaygroupForm ? (
          <form onSubmit={onCreatePlaygroup} className="space-y-3">
            <Field
              label="Playgroup name"
              value={newPlaygroupName}
              onChange={(e) => setNewPlaygroupName(e.target.value)}
              placeholder="Friday Friends"
              required
            />
            <div className="flex gap-2">
              <Button type="submit" variant="neon" disabled={busy}>
                Create playgroup
              </Button>
              {playgroups.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowNewPlaygroupForm(false)}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </Panel>

      {overview ? (
        <PlaygroupDetailSection
          token={session.token}
          overview={overview}
          newGuestName={newGuestName}
          setNewGuestName={(v) => {
            setNewGuestName(v);
            setDuplicateArmedName(null);
          }}
          duplicateArmedName={duplicateArmedName}
          onAddGuest={onAddGuest}
          expandedGuestId={expandedGuestId}
          setExpandedGuestId={setExpandedGuestId}
          busy={busy}
          onRefresh={() => loadPlaygroup(session.token, overview.playgroup.id)}
          onDeletedPlaygroup={() => refreshDashboard(session.token, null)}
          onError={setError}
        />
      ) : null}

      {personalStats && personalStats.gamesPlayed > 0 ? (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <History size={18} aria-hidden />
              My Personal History
            </span>
          }
          aside={`${personalStats.gamesPlayed} games`}
        >
          <StatsSummaryGrid stats={personalStats} />
          {personalGames.length > 0 ? (
            <div className="mt-4">
              <p className="text-muted mb-2 text-xs font-medium tracking-wider uppercase">
                Recent Games
              </p>
              <GameHistoryList records={personalGames.slice(0, 8)} />
            </div>
          ) : null}
        </Panel>
      ) : null}

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted/80">
        <Link className="text-neon font-semibold hover:underline" to="/">
          ← Back to Home / Create Event
        </Link>
      </div>
    </>
  );
}

function PlaygroupDetailSection({
  token,
  overview,
  newGuestName,
  setNewGuestName,
  duplicateArmedName,
  onAddGuest,
  expandedGuestId,
  setExpandedGuestId,
  busy,
  onRefresh,
  onDeletedPlaygroup,
  onError,
}: {
  token: string;
  overview: PlaygroupOverview;
  newGuestName: string;
  setNewGuestName: (value: string) => void;
  duplicateArmedName: string | null;
  onAddGuest: (e: FormEvent, allowDuplicate?: boolean) => Promise<void>;
  expandedGuestId: string | null;
  setExpandedGuestId: (id: string | null) => void;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onDeletedPlaygroup: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [editingPgName, setEditingPgName] = useState(false);
  const [pgNameDraft, setPgNameDraft] = useState(overview.playgroup.name);
  const [deletePgArmed, setDeletePgArmed] = useState(false);

  useEffect(() => {
    setPgNameDraft(overview.playgroup.name);
    setEditingPgName(false);
    setDeletePgArmed(false);
  }, [overview.playgroup.id, overview.playgroup.name]);

  async function onRenamePlaygroup(e: FormEvent) {
    e.preventDefault();
    if (!pgNameDraft.trim()) return;
    onError(null);
    try {
      await updatePlaygroup(token, overview.playgroup.id, {
        name: pgNameDraft.trim(),
      });
      setEditingPgName(false);
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not rename playgroup.',
      );
    }
  }

  async function onDeletePlaygroup() {
    if (!deletePgArmed) {
      setDeletePgArmed(true);
      return;
    }
    onError(null);
    try {
      await deletePlaygroup(token, overview.playgroup.id);
      await onDeletedPlaygroup();
    } catch (caught) {
      setDeletePgArmed(false);
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not delete playgroup.',
      );
    }
  }

  return (
    <>
      <Panel
        title={overview.playgroup.name}
        aside={`${overview.playerCount} players · ${overview.recordedGamesCount} recorded games`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted text-xs">
            Players in this playgroup can pick their name and saved Commanders
            when joining your events—no player account required.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingPgName((v) => !v)}
            >
              Rename
            </Button>
            <Button
              size="sm"
              variant={deletePgArmed ? 'danger' : 'ghost'}
              onClick={() => void onDeletePlaygroup()}
              onBlur={() => setDeletePgArmed(false)}
            >
              {deletePgArmed ? 'Confirm delete' : 'Delete'}
            </Button>
          </div>
        </div>

        {editingPgName ? (
          <form onSubmit={onRenamePlaygroup} className="mb-4 flex gap-2">
            <input
              className={inputClass}
              value={pgNameDraft}
              onChange={(e) => setPgNameDraft(e.target.value)}
              aria-label="Playgroup name"
              required
            />
            <Button type="submit" size="sm" variant="neon">
              Save
            </Button>
          </form>
        ) : null}

        <form
          onSubmit={(e) => void onAddGuest(e, false)}
          className="border-muted/20 bg-void/40 mb-5 rounded-xl border p-3"
        >
          <label className="text-muted mb-1.5 block text-xs font-medium tracking-wider uppercase">
            + Add player
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={inputClass}
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
              placeholder="Display name (e.g. Alex, Marie, Thomas)"
              aria-label="New player display name"
              required
            />
            <Button
              type="submit"
              variant="neon"
              disabled={busy || !newGuestName.trim()}
            >
              <Plus size={16} aria-hidden />
              Add player
            </Button>
          </div>
          {duplicateArmedName &&
          duplicateArmedName.toLowerCase() ===
            newGuestName.trim().toLowerCase() ? (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="text-warning">
                &ldquo;{duplicateArmedName}&rdquo; already exists in this playgroup.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(e) => void onAddGuest(e, true)}
              >
                Add duplicate anyway
              </Button>
            </div>
          ) : null}
        </form>

        <div className="space-y-3">
          <p className="text-muted text-xs font-medium tracking-[0.14em] uppercase">
            Players ({overview.guests.length})
          </p>
          {overview.guests.length === 0 ? (
            <p className="text-muted text-sm">
              No saved players yet. Add your recurring friends above and seed
              their Commanders.
            </p>
          ) : (
            overview.guests.map((item) => (
              <PlaygroupGuestCard
                key={item.guest.id}
                token={token}
                playgroupId={overview.playgroup.id}
                item={item}
                allGuests={overview.guests.map((g) => g.guest)}
                expanded={expandedGuestId === item.guest.id}
                onToggleExpand={() =>
                  setExpandedGuestId(
                    expandedGuestId === item.guest.id ? null : item.guest.id,
                  )
                }
                onRefresh={onRefresh}
                onError={onError}
              />
            ))
          )}
        </div>
      </Panel>

      {overview.recentGames.length > 0 ? (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <History size={18} aria-hidden />
              Playgroup Game History
            </span>
          }
          aside={`${overview.recordedGamesCount} total`}
        >
          <GameHistoryList records={overview.recentGames.slice(0, 15)} />
        </Panel>
      ) : null}
    </>
  );
}

function PlaygroupGuestCard({
  token,
  playgroupId,
  item,
  allGuests,
  expanded,
  onToggleExpand,
  onRefresh,
  onError,
}: {
  token: string;
  playgroupId: string;
  item: PlaygroupGuestOverview;
  allGuests: GuestProfile[];
  expanded: boolean;
  onToggleExpand: () => void;
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const { guest, savedDecks, stats } = item;
  const [addingDeck, setAddingDeck] = useState(false);
  const [pickedCommander, setPickedCommander] =
    useState<CommanderSelection | null>(null);
  const [manualCommanderName, setManualCommanderName] = useState('');
  const [deckName, setDeckName] = useState('');
  const [bracket, setBracket] = useState<number>(3);
  const [preferred, setPreferred] = useState(false);
  const [savingDeck, setSavingDeck] = useState(false);

  const [editingGuestName, setEditingGuestName] = useState(false);
  const [guestNameDraft, setGuestNameDraft] = useState(guest.displayName);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [removeGuestArmed, setRemoveGuestArmed] = useState(false);

  async function onSaveNewCommander(e: FormEvent) {
    e.preventDefault();
    const cmdName = pickedCommander?.name || manualCommanderName.trim();
    if (!cmdName) {
      onError('Choose or enter a Commander name.');
      return;
    }
    setSavingDeck(true);
    onError(null);
    try {
      await createSavedDeckProfile(token, playgroupId, guest.id, {
        format: 'commander',
        commanderName: cmdName,
        commanderScryfallId:
          pickedCommander?.oracleId || pickedCommander?.cardId,
        commanders: pickedCommander ? [pickedCommander] : undefined,
        deckName: deckName.trim() || undefined,
        bracket,
        poolId: `b${bracket}`,
        preferred: preferred || savedDecks.length === 0,
      });
      setPickedCommander(null);
      setManualCommanderName('');
      setDeckName('');
      setBracket(3);
      setPreferred(false);
      setAddingDeck(false);
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not save Commander.',
      );
    } finally {
      setSavingDeck(false);
    }
  }

  async function onChangeDeckBracket(deck: SavedDeckProfile, nextBracket: number) {
    onError(null);
    try {
      await updateSavedDeckProfile(token, playgroupId, guest.id, deck.id, {
        bracket: nextBracket,
        poolId: `b${nextBracket}`,
      });
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not update bracket.',
      );
    }
  }

  async function onMarkPreferredDeck(deck: SavedDeckProfile) {
    onError(null);
    try {
      await updateSavedDeckProfile(token, playgroupId, guest.id, deck.id, {
        preferred: true,
      });
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not mark preferred deck.',
      );
    }
  }

  async function onDeleteDeck(deckId: string) {
    onError(null);
    try {
      await deleteSavedDeckProfile(token, playgroupId, guest.id, deckId);
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof ApiError ? caught.message : 'Could not remove deck.',
      );
    }
  }

  async function onRenameGuest(e: FormEvent) {
    e.preventDefault();
    if (!guestNameDraft.trim()) return;
    onError(null);
    try {
      await updateGuestProfile(token, playgroupId, guest.id, {
        displayName: guestNameDraft.trim(),
      });
      setEditingGuestName(false);
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not rename player.',
      );
    }
  }

  async function onRemoveGuest() {
    if (!removeGuestArmed) {
      setRemoveGuestArmed(true);
      return;
    }
    onError(null);
    try {
      await deleteGuestProfile(token, playgroupId, guest.id);
      await onRefresh();
    } catch (caught) {
      setRemoveGuestArmed(false);
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not remove player.',
      );
    }
  }

  async function onMergeGuest(e: FormEvent) {
    e.preventDefault();
    if (!mergeTargetId) return;
    onError(null);
    try {
      await mergeGuestProfiles(token, playgroupId, guest.id, mergeTargetId);
      setMergeTargetId('');
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not merge players.',
      );
    }
  }

  const otherGuests = allGuests.filter((g) => g.id !== guest.id);

  return (
    <div className="border-muted/20 bg-void/50 rounded-xl border p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-bold">
              {guest.displayName}
            </h3>
            <Badge tone={stats.gamesPlayed > 0 ? 'live' : 'idle'}>
              {stats.gamesPlayed}{' '}
              {stats.gamesPlayed === 1 ? 'game' : 'games'}
            </Badge>
            {stats.wins > 0 ? (
              <Badge>{stats.wins}W</Badge>
            ) : null}
          </div>
          {savedDecks.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              {savedDecks.map((deck) => (
                <li
                  key={deck.id}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5',
                    deck.preferred
                      ? 'border-neon/50 bg-neon/10 text-neon'
                      : 'border-muted/20 text-muted',
                  )}
                >
                  <span>
                    {deck.commanderName || deck.deckName || 'Deck'}
                  </span>
                  <span>·</span>
                  <span className="font-mono">
                    {deck.bracket
                      ? `B${deck.bracket}`
                      : poolShortLabel(deck.poolId)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted mt-1 text-xs">
              No saved Commanders yet
            </p>
          )}
          {stats.mostPlayedWith.length > 0 ? (
            <p className="text-muted mt-1.5 text-xs">
              Played with{' '}
              {stats.mostPlayedWith
                .slice(0, 3)
                .map((p) => `${p.displayName} (${p.gamesTogether})`)
                .join(' · ')}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={expanded ? 'neon' : 'glass'}
            onClick={onToggleExpand}
          >
            {expanded ? 'Done' : 'Commanders & Edit'}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-muted/15 mt-4 space-y-4 border-t pt-4">
          {/* Saved Commanders list */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-muted text-xs font-medium tracking-wider uppercase">
                Saved Commanders ({savedDecks.length})
              </p>
              <Button
                type="button"
                size="sm"
                variant="neon"
                onClick={() => setAddingDeck((v) => !v)}
              >
                <Plus size={14} aria-hidden />
                Add commander
              </Button>
            </div>

            {savedDecks.length > 0 ? (
              <div className="space-y-2">
                {savedDecks.map((deck) => (
                  <SavedDeckRowEditor
                    key={deck.id}
                    token={token}
                    playgroupId={playgroupId}
                    guestId={guest.id}
                    deck={deck}
                    onChangeBracket={(b) => void onChangeDeckBracket(deck, b)}
                    onMarkPreferred={() => void onMarkPreferredDeck(deck)}
                    onDelete={() => void onDeleteDeck(deck.id)}
                    onRefresh={onRefresh}
                    onError={onError}
                  />
                ))}
              </div>
            ) : null}

            {addingDeck || savedDecks.length === 0 ? (
              <form
                onSubmit={(e) => void onSaveNewCommander(e)}
                className="border-neon/30 bg-void/80 mt-3 space-y-3 rounded-xl border p-3"
              >
                <p className="text-xs font-semibold">
                  Add Commander for {guest.displayName}
                </p>
                <CommanderPicker
                  label="Search Scryfall Commander"
                  value={pickedCommander}
                  onChange={(cmd) => {
                    setPickedCommander(cmd);
                    if (cmd) setManualCommanderName(cmd.name);
                  }}
                />
                {!pickedCommander ? (
                  <div>
                    <label className="text-muted mb-1 block text-xs">
                      Or type Commander name directly
                    </label>
                    <input
                      className={inputClass}
                      value={manualCommanderName}
                      onChange={(e) => setManualCommanderName(e.target.value)}
                      placeholder="e.g. Muldrotha, the Gravetide"
                    />
                  </div>
                ) : null}
                <div>
                  <label className="text-muted mb-1 block text-xs">
                    Deck nickname (optional)
                  </label>
                  <input
                    className={inputClass}
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    placeholder="e.g. Graveyard Value"
                  />
                </div>
                <div>
                  <label className="text-muted mb-1 block text-xs">
                    Bracket
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMANDER_POOLS.map((pool, idx) => {
                      const bNum = idx + 1;
                      return (
                        <button
                          key={pool.id}
                          type="button"
                          onClick={() => setBracket(bNum)}
                          className={cx(
                            'rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold transition',
                            bracket === bNum
                              ? 'border-neon bg-neon/15 text-neon'
                              : 'border-muted/20 text-muted hover:border-muted/40',
                          )}
                        >
                          {pool.label} ({pool.short})
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    variant="neon"
                    disabled={savingDeck}
                  >
                    <Sparkles size={14} aria-hidden />
                    {savingDeck ? 'Saving...' : 'Save commander'}
                  </Button>
                  {savedDecks.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAddingDeck(false)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>

          {/* Player stats summary if they have played games */}
          {stats.gamesPlayed > 0 ? (
            <div>
              <p className="text-muted mb-2 text-xs font-medium tracking-wider uppercase">
                Player Stats
              </p>
              <StatsSummaryGrid stats={stats} />
            </div>
          ) : null}

          {/* Player management: rename, merge, delete */}
          <div className="border-muted/15 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditingGuestName((v) => !v)}
              >
                Rename player
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant={removeGuestArmed ? 'danger' : 'ghost'}
              onClick={() => void onRemoveGuest()}
              onBlur={() => setRemoveGuestArmed(false)}
            >
              <Trash2 size={14} aria-hidden />
              {removeGuestArmed ? 'Confirm remove player' : 'Remove player'}
            </Button>
          </div>

          {editingGuestName ? (
            <form onSubmit={(e) => void onRenameGuest(e)} className="flex gap-2">
              <input
                className={inputClass}
                value={guestNameDraft}
                onChange={(e) => setGuestNameDraft(e.target.value)}
                required
              />
              <Button type="submit" size="sm" variant="neon">
                Save
              </Button>
            </form>
          ) : null}

          {otherGuests.length > 0 ? (
            <form
              onSubmit={(e) => void onMergeGuest(e)}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <span className="text-muted">Merge duplicate into:</span>
              <select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                className="border-muted/20 bg-void h-8 rounded-lg border px-2 text-xs"
              >
                <option value="">Select target player...</option>
                {otherGuests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.displayName}
                  </option>
                ))}
              </select>
              {mergeTargetId ? (
                <Button type="submit" size="sm" variant="outline">
                  Merge
                </Button>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SavedDeckRowEditor({
  token,
  playgroupId,
  guestId,
  deck,
  onChangeBracket,
  onMarkPreferred,
  onDelete,
  onRefresh,
  onError,
}: {
  token: string;
  playgroupId: string;
  guestId: string;
  deck: SavedDeckProfile;
  onChangeBracket: (bracket: number) => void;
  onMarkPreferred: () => void;
  onDelete: () => void;
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [editingDeckName, setEditingDeckName] = useState(false);
  const [deckNameDraft, setDeckNameDraft] = useState(deck.deckName ?? '');

  async function onSaveDeckName(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      await updateSavedDeckProfile(token, playgroupId, guestId, deck.id, {
        deckName: deckNameDraft.trim(),
      });
      setEditingDeckName(false);
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not rename deck.',
      );
    }
  }

  return (
    <div className="border-muted/20 bg-void/60 flex flex-col gap-2 rounded-xl border p-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {deck.commanderName || deck.deckName || 'Saved Deck'}
          </p>
          {deck.deckName && deck.commanderName ? (
            <p className="text-muted truncate text-xs">{deck.deckName}</p>
          ) : null}
          {deck.timesUsed > 0 ? (
            <p className="text-muted text-[11px]">
              Used {deck.timesUsed} {deck.timesUsed === 1 ? 'time' : 'times'}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 4].map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onChangeBracket(b)}
              className={cx(
                'rounded-md border px-2 py-0.5 font-mono text-xs transition',
                deck.bracket === b
                  ? 'border-neon bg-neon/15 text-neon'
                  : 'border-muted/20 text-muted hover:border-muted/40',
              )}
            >
              B{b}
            </button>
          ))}
          <button
            type="button"
            onClick={onMarkPreferred}
            className={cx(
              'rounded-md border px-2 py-0.5 text-xs font-medium transition',
              deck.preferred
                ? 'border-neon/60 bg-neon/15 text-neon'
                : 'border-muted/20 text-muted hover:text-ink',
            )}
          >
            {deck.preferred ? (
              <span className="inline-flex items-center gap-1">
                <Check size={12} aria-hidden /> Preferred
              </span>
            ) : (
              'Prefer'
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setDeckNameDraft(deck.deckName ?? '');
              setEditingDeckName((v) => !v);
            }}
            className="text-muted hover:text-ink px-1.5 text-xs"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-muted hover:text-danger px-1.5 text-xs"
            aria-label={`Remove ${deck.commanderName ?? deck.deckName ?? 'deck'}`}
          >
            Remove
          </button>
        </div>
      </div>

      {editingDeckName ? (
        <form onSubmit={(e) => void onSaveDeckName(e)} className="flex gap-2">
          <input
            className={inputClass}
            value={deckNameDraft}
            onChange={(e) => setDeckNameDraft(e.target.value)}
            placeholder="Deck nickname"
          />
          <Button type="submit" size="sm" variant="neon">
            Save
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function StatsSummaryGrid({ stats }: { stats: DerivedStats }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="border-muted/20 bg-void/40 rounded-lg border p-2.5">
        <p className="text-muted text-[11px] uppercase">Games</p>
        <p className="font-display text-lg font-bold">{stats.gamesPlayed}</p>
      </div>
      <div className="border-muted/20 bg-void/40 rounded-lg border p-2.5">
        <p className="text-muted text-[11px] uppercase">Wins / Losses</p>
        <p className="font-display text-lg font-bold">
          {stats.wins}W · {stats.losses}L
          {stats.draws > 0 ? ` · ${stats.draws}D` : ''}
        </p>
      </div>
      <div className="border-muted/20 bg-void/40 rounded-lg border p-2.5">
        <p className="text-muted text-[11px] uppercase">Win Rate</p>
        <p className="font-display text-lg font-bold">
          {stats.winRate !== null
            ? `${Math.round(stats.winRate * 100)}%`
            : '—'}
        </p>
      </div>
      <div className="border-muted/20 bg-void/40 rounded-lg border p-2.5">
        <p className="text-muted text-[11px] uppercase">Top Commander</p>
        <p className="truncate text-sm font-semibold">
          {stats.mostUsedCommanders[0]?.commanderName ?? '—'}
        </p>
      </div>
    </div>
  );
}

function GameHistoryList({ records }: { records: GameRecord[] }) {
  return (
    <ul className="divide-y divide-white/5 text-sm">
      {records.map((record) => (
        <li key={record.id} className="py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-neon font-semibold uppercase">
              {record.gameMode}
              {record.poolId ? ` · ${poolShortLabel(record.poolId)}` : ''}
            </span>
            <span className="text-muted">
              {record.endedAt
                ? new Date(record.endedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {record.participants.map((p) => (
              <span
                key={p.id}
                className={cx(
                  'rounded-lg border px-2 py-1 text-xs',
                  p.resultType === 'WIN'
                    ? 'border-neon/50 bg-neon/10 text-neon font-semibold'
                    : 'border-muted/20 text-muted',
                )}
              >
                {p.displayNameSnapshot}
                {p.commanderNameSnapshot ? ` (${p.commanderNameSnapshot})` : ''}
                {p.resultType === 'WIN'
                  ? ' ★'
                  : p.resultType === 'DRAW'
                    ? ' (Draw)'
                    : ''}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
