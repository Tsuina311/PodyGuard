import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createLimitedEvent, joinAsPlayer } from './helpers';

for (const format of [
  { label: 'Booster Draft', count: 8 },
  { label: 'Pick-Two Draft', count: 4 },
  { label: 'Sealed', count: 4 },
] as const) {
  test(`${format.label}: full physical-card event through final standings`, async ({ page: host, browser }) => {
    test.setTimeout(240_000);
    const players: Page[] = [];
    const code = await createLimitedEvent(host, { name: `E2E ${format.label} lifecycle`, formatLabel: format.label });
    try {
      await test.step('Players join and ready through independent browsers', async () => {
        for (let index = 0; index < format.count; index++) {
          const player = await browser.newPage();
          players.push(player);
          await joinAsPlayer(player, code, `Player ${index + 1}`);
          const joinLobby = player.getByRole('button', { name: 'Join the lobby', exact: true });
          if (await joinLobby.isVisible()) await joinLobby.click();
          await player.getByRole('button', { name: "I'm ready", exact: true }).click();
          await expect(player.getByRole('button', { name: 'Not ready yet', exact: true })).toBeVisible();
        }
      });
      await host.getByRole('button', { name: 'Assign to tables', exact: true }).click();
      await expect(host.getByRole('button', { name: format.label === 'Sealed' ? 'Start deckbuilding' : 'Start draft', exact: true })).toBeDisabled();
      await test.step('Everyone chooses a seat and confirms', async () => {
        for (const [index, player] of players.entries()) {
          await player.getByRole('button', { name: `Seat ${index + 1} Open`, exact: true }).click();
          await player.getByRole('button', { name: "I'm seated", exact: true }).click();
        }
      });
      if (format.label !== 'Sealed') {
        await host.getByRole('button', { name: 'Start draft', exact: true }).click();
        await expect(players[0]!.getByText(format.label === 'Pick-Two Draft' ? /Take two cards each pick/ : /Take one card each pick/)).toBeVisible();
        await host.getByRole('button', { name: 'Pause timer', exact: true }).click();
        await expect(host.getByRole('button', { name: 'Resume timer', exact: true })).toBeVisible();
        await host.reload();
        await host.getByRole('button', { name: 'Resume timer', exact: true }).click();
        for (const [index, player] of players.entries()) {
          await player.getByRole('button', { name: index === 0 ? 'We are done drafting' : 'Confirm that you are done drafting', exact: true }).click();
        }
      } else {
        await host.getByRole('button', { name: 'Start deckbuilding', exact: true }).click();
        await expect(host.getByRole('button', { name: 'Start draft', exact: true })).toHaveCount(0);
      }
      await host.getByRole('button', { name: 'Pause timer', exact: true }).click();
      await expect(host.getByRole('button', { name: 'Resume timer', exact: true })).toBeVisible();
      await host.getByRole('button', { name: 'Resume timer', exact: true }).click();
      await test.step('Deck readiness advances to round one', async () => {
        for (const [index, player] of players.entries()) {
          if (index === 0) await player.reload();
          await player.getByRole('button', { name: 'Deck is ready', exact: true }).click();
        }
      });

      // Match identities come from the real response. Every result is submitted through a player's UI.
      // Capture each round result response to verify completion and table release without test-only mutations.
      let session: { status: string; currentRound: number; totalRounds: number; standings: unknown[]; rounds: Array<{ number: number; matches: Array<{ id: string; outcome?: string }> }> } | undefined;
      let corrected = false;
      for (let round = 1; round <= 3; round++) {
        await test.step(`Play and report round ${round}`, async () => {
          await players[0]!.getByRole('button', { name: 'Start without life tracker', exact: true }).click();
          for (const player of players) {
            const wins = player.getByRole('button', { name: /^Player \d+ wins$/ });
            // A match already reported by its opponent has no result buttons.
            // Wait for either the result controls or a visible result/waiting state.
            await expect.poll(async () => (await wins.count()) > 0 || (await player.getByText(/Result:|Next matches are on the way|This pod is finished/).count()) > 0).toBe(true);
            if (await wins.count()) {
              const response = player.waitForResponse(response => response.url().includes('/matches/') && response.url().endsWith('/result') && response.request().method() === 'POST');
              await wins.first().click();
              const result = await response;
              expect(result.ok()).toBe(true);
              session = (await result.json()).session;
              const matchId = result.url().split('/').at(-2);
              expect(session!.rounds.find(item => item.number === round)!.matches.find(match => match.id === matchId)!.outcome).toBe('PLAYER_A_WIN');
              if (!corrected && round === 1) {
                host.once('dialog', dialog => dialog.accept('E2E: winner entered backwards'));
                const correction = host.waitForResponse(response => response.url().endsWith('/correct') && response.request().method() === 'POST');
                await host.getByRole('button', { name: 'PLAYER B WIN', exact: true }).first().click();
                const correctionResponse = await correction;
                expect(correctionResponse.ok()).toBe(true);
                const correctedSession = (await correctionResponse.json()).session;
                expect(correctedSession.rounds[0].matches.find((match: { id: string }) => match.id === matchId).outcome).toBe('PLAYER_B_WIN');
                corrected = true;
              }
              // The last result automatically pairs the next round. Its result
              // buttons may already be visible, so absence is not a valid assertion.
              if (session!.currentRound > round || session!.status === 'COMPLETED') break;
              await expect(wins).toHaveCount(0);
            }
          }
        });
        expect(session).toBeDefined();
        if (session!.status === 'COMPLETED') break;
        if (session!.status === 'BETWEEN_ROUNDS') {
          await host.getByRole('button', { name: `Start round ${round + 1}`, exact: true }).click();
        } else {
          expect(session!.currentRound).toBe(round + 1);
        }
      }
      expect(session!.status).toBe('COMPLETED');
      expect(corrected).toBe(true);
      expect(session!.standings).toHaveLength(format.count);
      await expect(host.getByRole('columnheader', { name: 'Points', exact: true })).toBeVisible();
      const tables = await host.request.get(`/api/events/${code}/tables`);
      expect(tables.ok()).toBe(true);
      expect((await tables.json()).tables.every((table: { status: string }) => table.status === 'free')).toBe(true);
      await host.reload();
      await expect(host.getByText('COMPLETED', { exact: true })).toHaveCount(format.count + 1);
    } finally { await Promise.all(players.map(player => player.close())); }
  });
}
