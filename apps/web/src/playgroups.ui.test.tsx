/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './i18n';
import { JoinPage } from './JoinPage';
import { AccountPage } from './AccountPage';
import { FeedbackProvider } from './feedback/FeedbackContext';
import { clearAccountSession, saveAccountSession } from './api';

const MULDROTHA = {
  oracleId: 'oracle-muldrotha',
  cardId: 'card-muldrotha',
  name: 'Muldrotha, the Gravetide',
  artCropUri: 'https://cards.scryfall.io/art_crop/front/m/u/muldrotha.jpg',
  typeLine: 'Legendary Creature — Elemental Avatar',
  oracleText: '',
  keywords: [],
};

const GIADA = {
  oracleId: 'oracle-giada',
  cardId: 'card-giada',
  name: 'Giada, Font of Hope',
  artCropUri: 'https://cards.scryfall.io/art_crop/front/g/i/giada.jpg',
  typeLine: 'Legendary Creature — Angel',
  oracleText: '',
  keywords: [],
};

describe('returning guest join UI and playgroup overview UI', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearAccountSession();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows returning-player suggestions on JoinPage and lets Alex join with a saved Commander', async () => {
    let joinedPayload: Record<string, unknown> | null = null;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/events/FRI123')) {
        return new Response(
          JSON.stringify({
            id: 'evt-fri',
            name: 'Friday Commander',
            joinCode: 'FRI123',
            status: 'open',
            gameMode: 'commander',
            rulesFormat: 'commander',
            allowThreePods: true,
            allowFivePods: false,
            preferredPodSize: 4,
            lifetimeHours: 24,
            expiresAt: '2099-01-01T00:00:00.000Z',
            playgroupId: 'pg-fri',
            playgroupName: 'Friday Friends',
            showReturningPlayerSuggestions: true,
            hasPlaygroupSuggestions: true,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/events/FRI123/join-suggestions/guest-alex/decks')) {
        return new Response(
          JSON.stringify({
            guest: { id: 'guest-alex', displayName: 'Alex' },
            decks: [
              {
                id: 'deck-muldrotha',
                commanderName: 'Muldrotha, the Gravetide',
                commanders: [MULDROTHA],
                bracket: 3,
                poolId: 'b3',
                format: 'commander',
                preferred: true,
              },
              {
                id: 'deck-giada',
                commanderName: 'Giada, Font of Hope',
                commanders: [GIADA],
                bracket: 2,
                poolId: 'b2',
                format: 'commander',
                preferred: false,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/events/FRI123/join-suggestions')) {
        return new Response(
          JSON.stringify({
            suggestions: [
              { id: 'guest-alex', displayName: 'Alex' },
              { id: 'guest-marie', displayName: 'Marie' },
              { id: 'guest-thomas', displayName: 'Thomas' },
            ],
            totalCount: 3,
            mode: 'list',
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/events/FRI123/join') && init?.method === 'POST') {
        joinedPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            event: {
              id: 'evt-fri',
              name: 'Friday Commander',
              joinCode: 'FRI123',
              status: 'open',
              gameMode: 'commander',
              rulesFormat: 'commander',
              allowThreePods: true,
              allowFivePods: false,
              preferredPodSize: 4,
              lifetimeHours: 24,
              expiresAt: '2099-01-01T00:00:00.000Z',
            },
            participant: {
              id: 'p-alex',
              displayName: 'Alex',
              status: 'joined',
              isBot: false,
              decks: [
                {
                  id: 'd-1',
                  name: 'Muldrotha, the Gravetide',
                  poolId: 'b3',
                  preference: 'preferred',
                  commanders: [MULDROTHA],
                },
              ],
              assignedCommanders: [],
              flexCredits: 0,
            },
            token: 'ps1.mock.token',
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    render(
      <MemoryRouter initialEntries={['/e/FRI123']}>
        <FeedbackProvider>
          <Routes>
            <Route path="/e/:joinCode" element={<JoinPage />} />
          </Routes>
        </FeedbackProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Played here before\? Who are you\?/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Marie')).toBeInTheDocument();
    expect(screen.getByText('Thomas')).toBeInTheDocument();
    expect(screen.getByText(/I'm new here/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Alex'));

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Alex/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument();
    expect(screen.getByText('Giada, Font of Hope')).toBeInTheDocument();

    // Join with preselected Muldrotha
    const joinBtn = screen.getByRole('button', { name: /Join event/i });
    fireEvent.click(joinBtn);

    await waitFor(() => {
      expect(joinedPayload).not.toBeNull();
    });
    expect(joinedPayload).toMatchObject({
      displayName: 'Alex',
      guestProfileId: 'guest-alex',
      savedDeckProfileId: 'deck-muldrotha',
    });
  });

  it('renders playgroup overview with seeded players and commanders on AccountPage', async () => {
    saveAccountSession({
      token: 'as1.mock.token',
      account: {
        id: 'acc-1',
        authUserId: 'email:host@example.com',
        email: 'host@example.com',
        displayName: 'Host One',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/account/me')) {
        return new Response(
          JSON.stringify({
            account: {
              id: 'acc-1',
              authUserId: 'email:host@example.com',
              email: 'host@example.com',
              displayName: 'Host One',
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
            playgroups: [
              {
                id: 'pg-fri',
                ownerUserId: 'acc-1',
                name: 'Friday Friends',
                guestIdentityVerification: 'NONE',
                createdAt: '2026-10-01T00:00:00.000Z',
                updatedAt: '2026-10-01T00:00:00.000Z',
              },
            ],
            stats: {
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              completedNoWinner: 0,
              winRate: null,
              gamesByFormat: {},
              mostUsedCommanders: [],
              mostPlayedWith: [],
              lastPlayedAt: null,
            },
            recentGames: [],
            linkedGuests: [],
            claimableGuests: [],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/playgroups/pg-fri')) {
        return new Response(
          JSON.stringify({
            overview: {
              playgroup: {
                id: 'pg-fri',
                ownerUserId: 'acc-1',
                name: 'Friday Friends',
                guestIdentityVerification: 'NONE',
                createdAt: '2026-10-01T00:00:00.000Z',
                updatedAt: '2026-10-01T00:00:00.000Z',
              },
              playerCount: 2,
              recordedGamesCount: 5,
              guests: [
                {
                  guest: {
                    id: 'guest-alex',
                    playgroupId: 'pg-fri',
                    displayName: 'Alex',
                    createdAt: '2026-10-01T00:00:00.000Z',
                    updatedAt: '2026-10-01T00:00:00.000Z',
                  },
                  savedDecks: [
                    {
                      id: 'deck-muldrotha',
                      playgroupId: 'pg-fri',
                      guestProfileId: 'guest-alex',
                      format: 'commander',
                      commanderName: 'Muldrotha, the Gravetide',
                      commanders: [MULDROTHA],
                      bracket: 3,
                      poolId: 'b3',
                      preferred: true,
                      timesUsed: 3,
                      createdAt: '2026-10-01T00:00:00.000Z',
                      updatedAt: '2026-10-01T00:00:00.000Z',
                    },
                  ],
                  stats: {
                    gamesPlayed: 5,
                    wins: 2,
                    losses: 3,
                    draws: 0,
                    completedNoWinner: 0,
                    winRate: 0.4,
                    gamesByFormat: { commander: 5 },
                    mostUsedCommanders: [],
                    mostPlayedWith: [
                      {
                        guestProfileId: 'guest-marie',
                        displayName: 'Marie',
                        gamesTogether: 5,
                      },
                    ],
                    lastPlayedAt: '2026-10-20T00:00:00.000Z',
                  },
                },
              ],
              recentGames: [],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    render(
      <MemoryRouter initialEntries={['/account']}>
        <FeedbackProvider>
          <Routes>
            <Route path="/account" element={<AccountPage />} />
          </Routes>
        </FeedbackProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('2 players · 5 recorded games')).toBeInTheDocument();
    });
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument();
    expect(screen.getByText(/Played with Marie \(5\)/i)).toBeInTheDocument();
  });
});
