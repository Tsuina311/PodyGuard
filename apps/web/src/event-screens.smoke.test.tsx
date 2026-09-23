/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GAME_MODES,
  LIMITED_MODES,
  defaultLimitedEventModeConfig,
  type GameMode,
  type LimitedMode,
  type PublicEvent,
  type PublicParticipant,
} from '@podyguard/shared';
import {
  defaultHostLimitedConfigs,
  limitedConfigsForEventCreate,
} from './event-mode';
import {
  shouldShowConstructedHostMatching,
  shouldShowConstructedPlayerJoin,
  shouldShowLimitedHostPanel,
  shouldShowLimitedPlayerPanel,
} from './event-screens';
import { LimitedHostPanel } from './limited/LimitedHostPanel';
import { LimitedPlayerPanel } from './limited/LimitedPlayerPanel';
import { LIMITED_MODE_LABELS } from './limited/limited-view';

afterEach(() => {
  cleanup();
});

function baseEvent(
  gameMode: GameMode,
  limitedModeConfigs: PublicEvent['limitedModeConfigs'],
): PublicEvent {
  return {
    id: 'evt-smoke',
    name: 'Smoke night',
    joinCode: 'SMOK',
    status: 'open',
    gameMode,
    rulesFormat:
      gameMode === 'duel' || gameMode === 'multiplayer' ? 'normal' : 'commander',
    allowThreePods: true,
    allowFivePods: false,
    preferredPodSize: gameMode === 'duel' || gameMode === 'duel-commander' || gameMode === 'brawl' ? 2 : 4,
    lifetimeHours: 24,
    expiresAt: '2099-01-01T00:00:00.000Z',
    limitedModeConfigs,
  };
}

function participant(): PublicParticipant {
  return {
    id: 'p1',
    displayName: 'Ada',
    status: 'joined',
    isBot: false,
    decks: [],
    assignedCommanders: [],
    flexCredits: 0,
  };
}

function constructedEvent(gameMode: GameMode): PublicEvent {
  return baseEvent(
    gameMode,
    limitedConfigsForEventCreate(false, defaultHostLimitedConfigs()),
  );
}

function limitedEvent(mode: LimitedMode): PublicEvent {
  return baseEvent(
    'commander',
    LIMITED_MODES.map((row) => ({
      ...defaultLimitedEventModeConfig(row),
      enabled: row === mode,
    })),
  );
}

describe('Join/Host screen smoke — constructed modes', () => {
  it.each([...GAME_MODES])(
    '%s: constructed join + host chrome, no Limited panels',
    (gameMode) => {
      const event = constructedEvent(gameMode);
      const me = participant();
      const snapshot = { event, participants: [me], tables: [] };

      expect(shouldShowConstructedPlayerJoin(event)).toBe(true);
      expect(shouldShowConstructedHostMatching(event)).toBe(true);
      expect(
        shouldShowLimitedPlayerPanel(event, {
          participant: me,
          token: 'player-token',
          snapshot,
        }),
      ).toBe(false);
      expect(shouldShowLimitedHostPanel(event, 'host-token')).toBe(false);

      const player = render(
        <LimitedPlayerPanel
          snapshot={snapshot}
          participant={me}
          token="player-token"
          onSnapshot={() => undefined}
          onError={() => undefined}
        />,
      );
      expect(player.container).toBeEmptyDOMElement();
      player.unmount();

      const host = render(
        <LimitedHostPanel
          joinCode={event.joinCode}
          hostToken="host-token"
          snapshot={snapshot}
          onSession={() => undefined}
          onError={() => undefined}
        />,
      );
      expect(host.container).toBeEmptyDOMElement();
    },
  );
});

describe('Join/Host screen smoke — Limited modes', () => {
  it.each([...LIMITED_MODES])(
    '%s: Limited player + host panels mount with the format label',
    (mode) => {
      const event = limitedEvent(mode);
      const me = participant();
      const snapshot = { event, participants: [me], tables: [] };

      expect(shouldShowConstructedPlayerJoin(event)).toBe(false);
      expect(shouldShowConstructedHostMatching(event)).toBe(false);
      expect(
        shouldShowLimitedPlayerPanel(event, {
          participant: me,
          token: 'player-token',
          snapshot,
        }),
      ).toBe(true);
      expect(shouldShowLimitedHostPanel(event, 'host-token')).toBe(true);

      render(
        <LimitedPlayerPanel
          snapshot={snapshot}
          participant={me}
          token="player-token"
          onSnapshot={() => undefined}
          onError={() => undefined}
        />,
      );
      expect(screen.getByText('Limited')).toBeTruthy();
      expect(screen.getByText(LIMITED_MODE_LABELS[mode])).toBeTruthy();
      cleanup();

      render(
        <LimitedHostPanel
          joinCode={event.joinCode}
          hostToken="host-token"
          snapshot={snapshot}
          onSession={() => undefined}
          onError={() => undefined}
        />,
      );
      expect(screen.getByText('Limited event desk')).toBeTruthy();
      expect(screen.getByText(LIMITED_MODE_LABELS[mode])).toBeTruthy();
    },
  );
});

describe('Join/Host screen smoke — duel-commander regression', () => {
  it('duel-commander create payload must not mount Limited Swiss UI', () => {
    const event = constructedEvent('duel-commander');
    const me = participant();
    const snapshot = { event, participants: [me], tables: [] };

    expect(shouldShowLimitedHostPanel(event, 'host-token')).toBe(false);
    expect(
      shouldShowLimitedPlayerPanel(event, {
        participant: me,
        token: 'tok',
        snapshot,
      }),
    ).toBe(false);

    const { container } = render(
      <LimitedPlayerPanel
        snapshot={snapshot}
        participant={me}
        token="tok"
        onSnapshot={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Limited')).toBeNull();
  });
});
