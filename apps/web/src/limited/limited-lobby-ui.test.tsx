/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventSnapshot, PublicLimitedSession, PublicParticipant } from '@podyguard/shared';
import { LimitedHostPanel } from './LimitedHostPanel';
import { LimitedPlayerPanel } from './LimitedPlayerPanel';

afterEach(() => {
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
});
