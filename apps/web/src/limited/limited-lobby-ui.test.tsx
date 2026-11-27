/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSnapshot, PublicLimitedSession, PublicParticipant } from '@podyguard/shared';
import { reportLimitedResult, reportLimitedProgress } from '../api';
import { removeStored } from '../device-storage';
import '../i18n';
import { LimitedTimingControls } from './LimitedFormatPicker';
import { LimitedHostPanel } from './LimitedHostPanel';
import { LimitedPlayerPanel } from './LimitedPlayerPanel';
import { EventDisplayContent } from './LimitedDisplayPage';

vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  reportLimitedResult: vi.fn(),
  reportLimitedProgress: vi.fn(),
}));
vi.mock('../tracker/TrackerView', () => ({
  TrackerView: ({ storageKey, onFinish }: { storageKey: string; onFinish: (winner: string) => Promise<void> }) => (
    <>
      <p>{storageKey}</p>
      <button onClick={() => void onFinish('p1')}>Ada won the game</button>
      <button onClick={() => void onFinish('p2')}>Bea won the game</button>
    </>
  ),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  removeStored('podyguard.tracker.limited.DRAFT1.m1:score:p1');
  localStorage.clear();
  cleanup();
});

const participant = (patch: Partial<PublicParticipant> = {}): PublicParticipant => ({
  id: 'p1',
  displayName: 'Ada',
  status: 'joined',
  isBot: false,
  decks: [],
  assignedCommanders: [],
  flexCredits: 0,
  limitedQueueMode: 'PICK_TWO_DRAFT',
  ...patch,
});

function snapshot(
  me: PublicParticipant,
  session?: PublicLimitedSession,
): EventSnapshot {
  return {
    event: {
      id: 'e1',
      name: 'Draft night',
      joinCode: 'DRAFT1',
      status: 'open',
      gameMode: 'commander',
      rulesFormat: 'commander',
      allowThreePods: false,
      allowFivePods: false,
      preferredPodSize: 4,
      lifetimeHours: 8,
      expiresAt: '2099-01-01T00:00:00.000Z',
      limitedModeConfigs: [
        {
          mode: 'PICK_TWO_DRAFT',
          enabled: true,
          matchStructure: 'BO3',
          preferredCohortSize: 4,
          minCohortSize: 4,
          maxCohortSize: 4,
          allowUndersizedLaunch: false,
          totalRounds: 3,
          draftMinutes: 45,
          deckbuildingMinutes: 25,
          roundMinutes: 40,
        },
      ],
    },
    participants: [me],
    tables: [
      {
        id: 't1',
        label: 'Table 1',
        sortOrder: 1,
        status: 'occupied',
        seatedNames: [],
      },
    ],
    ...(session ? { limitedSessions: [session] } : {}),
  };
}

function session(patch: Partial<PublicLimitedSession> = {}): PublicLimitedSession {
  return {
    id: 's1',
    mode: 'PICK_TWO_DRAFT',
    status: 'DRAFTING',
    label: 'Pick-Two 1',
    participants: [
      {
        participantId: 'p1',
        displayName: 'Ada',
        status: 'DRAFTING',
        joinedAt: '2026-01-01T00:00:00.000Z',
        draftSeat: 1,
        seated: true,
      },
    ],
    rounds: [],
    standings: [],
    matchStructure: 'BO3',
    pairingPolicy: 'PICK_TWO_FOUR_PLAYER',
    minCohortSize: 4,
    preferredCohortSize: 4,
    allowUndersizedLaunch: false,
    totalRounds: 3,
    draftTableIds: ['t1'],
    phaseAcks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

function bestOfThreeRound() {
  const me = participant({ status: 'matched' });
  const round = session({
    status: 'ROUND_ACTIVE',
    currentRound: 1,
    participants: [
      {
        participantId: 'p1',
        displayName: 'Ada',
        status: 'PLAYING',
        joinedAt: '2026-01-01T00:00:00.000Z',
        draftSeat: 1,
        seated: true,
      },
      {
        participantId: 'p2',
        displayName: 'Bea',
        status: 'PLAYING',
        joinedAt: '2026-01-01T00:00:00.000Z',
        draftSeat: 3,
        seated: true,
      },
    ],
    rounds: [
      {
        id: 'r1',
        number: 1,
        status: 'ACTIVE',
        matches: [
          {
            id: 'm1',
            roundNumber: 1,
            position: 1,
            playerAId: 'p1',
            playerBId: 'p2',
            status: 'PLAYING',
            bestOf: 3,
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  return { me, round };
}

it('advances the Limited tracker through a split series and reports the actual score', async () => {
  const { me, round } = bestOfThreeRound();
  const running = {
    ...round,
    timer: {
      phase: 'ROUND' as const,
      status: 'RUNNING' as const,
      durationSeconds: 2400,
      startedAt: '2026-01-01T00:00:00.000Z',
      targetAt: '2099-01-01T00:00:00.000Z',
    },
  };
  vi.mocked(reportLimitedResult).mockResolvedValue({ session: running });
  vi.mocked(reportLimitedProgress).mockResolvedValue({ session: running });
  const props = {
    snapshot: snapshot(me, running),
    participant: me,
    token: 'player',
    onSnapshot: vi.fn(),
    onError: vi.fn(),
  };
  const firstVisit = render(<LimitedPlayerPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use life tracker' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ada won the game' }));
  expect(await screen.findByText('Best of 3 · 1–0')).toBeVisible();
  expect(reportLimitedResult).not.toHaveBeenCalled();

  firstVisit.unmount();
  render(<LimitedPlayerPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Track game 2' }));
  expect(await screen.findByText('podyguard.tracker.limited.DRAFT1.m1.series.game-2')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Bea won the game' }));
  expect(await screen.findByText('Best of 3 · 1–1')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Track game 3' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ada won the game' }));
  await waitFor(() => expect(reportLimitedResult).toHaveBeenCalledOnce());
  expect(reportLimitedResult).toHaveBeenCalledExactlyOnceWith('DRAFT1', 'player', 's1', 'm1', {
    outcome: 'PLAYER_A_WIN', playerAGameWins: 2, playerBGameWins: 1,
  });
});

it('closes an open Limited tracker when the other player reports that game', async () => {
  const { me, round } = bestOfThreeRound();
  const running: PublicLimitedSession = {
    ...round,
    timer: {
      phase: 'ROUND',
      status: 'RUNNING',
      durationSeconds: 2400,
      startedAt: '2026-01-01T00:00:00.000Z',
      targetAt: '2099-01-01T00:00:00.000Z',
    },
  };
  const [firstRound] = running.rounds;
  const [match] = firstRound!.matches;
  const nextGame: PublicLimitedSession = {
    ...running,
    rounds: [{ ...firstRound!, matches: [{ ...match!, playerAGameWins: 1, playerBGameWins: 0 }] }],
  };
  vi.mocked(reportLimitedProgress)
    .mockResolvedValueOnce({ session: running })
    .mockResolvedValueOnce({ session: nextGame });
  const props = { participant: me, token: 'player', onSnapshot: vi.fn(), onError: vi.fn() };
  const view = render(<LimitedPlayerPanel {...props} snapshot={snapshot(me, running)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use life tracker' }));
  expect(await screen.findByText('podyguard.tracker.limited.DRAFT1.m1')).toBeVisible();

  view.rerender(<LimitedPlayerPanel {...props} snapshot={snapshot(me, nextGame)} />);
  expect(screen.queryByRole('button', { name: 'Ada won the game' })).not.toBeInTheDocument();
  expect(screen.getByText('Best of 3 · 1–0')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Track game 2' }));
  expect(await screen.findByText('podyguard.tracker.limited.DRAFT1.m1.series.game-2')).toBeVisible();
  expect(reportLimitedResult).not.toHaveBeenCalled();
});

it('shows the host each game score and an elapsed clock that resets and stops at completion', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
  const { me, round } = bestOfThreeRound();
  const match = round.rounds[0]!.matches[0]!;
  Object.assign(match, { playerAGameWins: 1, playerBGameWins: 0, currentGameStartedAt: '2026-01-01T00:00:00Z' });
  const view = render(<EventDisplayContent snapshot={snapshot(me, round)} />);
  expect(screen.getByText('Best of 3 · 1–0')).toBeVisible();
  expect(screen.getByText('Game 2 · 02:00 elapsed')).toBeVisible();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('Game 2 · 02:01 elapsed')).toBeVisible();
  Object.assign(match, { playerBGameWins: 1, currentGameStartedAt: undefined });
  view.rerender(<EventDisplayContent snapshot={snapshot(me, round)} />);
  expect(screen.getByText('Game 3 · waiting to start')).toBeVisible();
  Object.assign(match, { currentGameStartedAt: '2026-01-01T00:02:01Z' });
  view.rerender(<EventDisplayContent snapshot={snapshot(me, round)} />);
  expect(screen.getByText('Game 3 · 00:00 elapsed')).toBeVisible();
  Object.assign(match, { outcome: 'PLAYER_A_WIN', playerAGameWins: 2, reportedAt: '2026-01-01T00:02:11Z' });
  view.rerender(<EventDisplayContent snapshot={snapshot(me, round)} />);
  expect(screen.getByText('Best of 3 · 2–1')).toBeVisible();
  expect(screen.getByText('Ada wins')).toBeVisible();
  expect(screen.queryByText(/elapsed|waiting to start/)).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(20_000));
  expect(screen.queryByText(/elapsed|waiting to start/)).not.toBeInTheDocument();
  Object.assign(match, { outcome: 'PLAYER_B_WIN', playerAGameWins: 1, playerBGameWins: 2 });
  view.rerender(<EventDisplayContent snapshot={snapshot(me, round)} />);
  expect(screen.getByText('Bea wins')).toBeVisible();
  expect(screen.queryByText('Ada wins')).not.toBeInTheDocument();
});

it('preserves a tied best-of game score when reporting a match draw', async () => {
  const { me, round } = bestOfThreeRound();
  Object.assign(round.rounds[0]!.matches[0]!, { playerAGameWins: 1, playerBGameWins: 1 });
  vi.mocked(reportLimitedResult).mockResolvedValue({ session: round });
  render(<LimitedPlayerPanel snapshot={snapshot(me, round)} participant={me} token="player" onSnapshot={vi.fn()} onError={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Report match draw' }));
  await waitFor(() => expect(reportLimitedResult).toHaveBeenCalledWith('DRAFT1', 'player', 's1', 'm1', {
    outcome: 'DRAW', playerAGameWins: 1, playerBGameWins: 1,
  }));
});

it('describes the selected Limited match length', () => {
  const value = {
    mode: 'SEALED' as const, matchStructure: 'BO1' as const,
    roundMinutes: 40, deckbuildingMinutes: 25, totalRounds: 3,
  };
  const onChange = vi.fn();
  const { rerender } = render(<LimitedTimingControls value={value} playerCount={4} onChange={onChange} />);
  const select = screen.getByRole('combobox');
  expect(select).toHaveAccessibleDescription('One game decides the match.');
  fireEvent.change(select, { target: { value: 'BO3' } });
  expect(onChange).toHaveBeenCalledWith({ matchStructure: 'BO3' });
  rerender(<LimitedTimingControls value={{ ...value, matchStructure: 'BO3' }} playerCount={4} onChange={onChange} />);
  expect(select).toHaveAccessibleDescription('The first player to win two games wins the match.');
});

describe('Limited lobby screens', () => {
  it('shows a ready button in the lobby and who is ready on the host desk', () => {
    const me = participant();
    render(
      <LimitedPlayerPanel
        snapshot={snapshot(me)}
        participant={me}
        token="player"
        onSnapshot={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: "I'm ready" })).toBeTruthy();
    expect(screen.getByText('Pick-Two Draft')).toBeTruthy();
    cleanup();

    render(
      <LimitedHostPanel
        joinCode="DRAFT1"
        hostToken="host"
        snapshot={snapshot(me)}
        onSession={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('Not ready')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assign to tables' })).toBeDisabled();
    cleanup();

    const readyNine = Array.from({ length: 9 }, (_, index) =>
      participant({
        id: `p${index + 1}`,
        displayName: `Player ${index + 1}`,
        status: 'ready',
      }),
    );
    render(
      <LimitedHostPanel
        joinCode="DRAFT1"
        hostToken="host"
        snapshot={{
          ...snapshot(readyNine[0]!),
          participants: readyNine,
          tables: [1, 2, 3].map((number) => ({
            id: `t${number}`,
            label: `Table ${number}`,
            sortOrder: number,
            status: 'free' as const,
            seatedNames: [],
          })),
        }}
        onSession={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByText('9/12 ready')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assign to tables' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add fake players' })).toBeNull();
    cleanup();

    localStorage.setItem('podyguard.developer-mode', 'on');
    render(
      <LimitedHostPanel
        joinCode="DRAFT1"
        hostToken="host"
        snapshot={snapshot(me)}
        onSession={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add fake players' })).toBeTruthy();
    expect(screen.getByText(/You still use the play tab/)).toBeTruthy();
  });

  it('lets the fake-player count be cleared while typing', () => {
    localStorage.setItem('podyguard.developer-mode', 'on');
    render(
      <LimitedHostPanel
        joinCode="DRAFT1"
        hostToken="host"
        snapshot={snapshot(participant())}
        onSession={() => undefined}
        onError={() => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'How many' });
    expect(input).toHaveValue('3');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Add fake players' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '7' } });
    expect(input).toHaveValue('7');
    expect(screen.getByRole('button', { name: 'Add fake players' })).toBeEnabled();
  });

  it('changes the draft button once someone else is done, then asks for the deck', () => {
    const me = participant({ status: 'matched' });
    const { rerender } = render(
      <LimitedPlayerPanel
        snapshot={snapshot(me, session())}
        participant={me}
        token="player"
        onSnapshot={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByText(/Time to open packs/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'We are done drafting' })).toBeTruthy();

    rerender(
      <LimitedPlayerPanel
        snapshot={snapshot(me, session({ phaseAcks: ['p2'] }))}
        participant={me}
        token="player"
        onSnapshot={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Confirm that you are done drafting' })).toBeTruthy();

    rerender(
      <LimitedPlayerPanel
        snapshot={snapshot(me, session({ status: 'DECKBUILDING', phaseAcks: [] }))}
        participant={me}
        token="player"
        onSnapshot={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByText('Time to make the best deck!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deck is ready' })).toBeTruthy();
  });

  it('shows Deck received on the host desk for the player who tapped it', () => {
    render(
      <LimitedHostPanel
        joinCode="DRAFT1"
        hostToken="host"
        snapshot={snapshot(
          participant({ status: 'matched' }),
          session({
            status: 'DECKBUILDING',
            phaseAcks: ['p1'],
            participants: [
              {
                participantId: 'p1',
                displayName: 'Ada',
                status: 'DECKBUILDING',
                joinedAt: '2026-01-01T00:00:00.000Z',
                draftSeat: 1,
                seated: true,
              },
              {
                participantId: 'p2',
                displayName: 'Bea',
                status: 'DECKBUILDING',
                joinedAt: '2026-01-01T00:00:00.000Z',
                draftSeat: 2,
                seated: true,
              },
            ],
          }),
        )}
        onSession={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByText('Deck received')).toBeTruthy();
    expect(screen.getByText('Building')).toBeTruthy();
    expect(screen.getByText(/1 of 2 have a deck ready/)).toBeTruthy();
  });

  it('waits for the table to start the best-of clock, then lets the host pause that table', () => {
    const { me, round } = bestOfThreeRound();
    render(
      <LimitedPlayerPanel
        snapshot={snapshot(me, round)}
        participant={me}
        token="player"
        onSnapshot={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Use life tracker' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start without life tracker' })).toBeTruthy();
    cleanup();

    render(
      <LimitedHostPanel
        joinCode="DRAFT1"
        hostToken="host"
        snapshot={snapshot(me, {
          ...round,
          timer: {
            phase: 'ROUND',
            status: 'RUNNING',
            durationSeconds: 2400,
            startedAt: '2026-01-01T00:00:00.000Z',
            targetAt: '2099-01-01T00:00:00.000Z',
          },
        })}
        onSession={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Pause this table' })).toBeTruthy();
  });
});
