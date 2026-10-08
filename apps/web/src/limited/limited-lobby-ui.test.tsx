/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventSnapshot, PublicLimitedSession, PublicParticipant } from '@podyguard/shared';
import { LimitedHostPanel } from './LimitedHostPanel';
import { LimitedPlayerPanel } from './LimitedPlayerPanel';

afterEach(() => {
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
