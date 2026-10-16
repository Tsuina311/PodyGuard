/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FeedbackProvider } from '../feedback/FeedbackContext';
import '../i18n';
import { TrackerView } from './TrackerView';

/**
 * Rendered position contract for a two-player board.
 *
 * The class helpers in seat-layout.ts are necessary but not sufficient: the
 * board, the clock, the loss prompt, the counters sheet, and the match menu
 * each have to apply those classes to the right element. These tests fail if
 * a later edit moves a duel seat, turns the wrong player, or leaks that
 * geometry onto a four-player pod.
 */

const DUEL = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
];

const POD = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
  { id: 'cam', name: 'Cam' },
  { id: 'dee', name: 'Dee' },
];

function tokens(element: Element | null | undefined): string[] {
  return (element?.className ?? '').split(/\s+/).filter(Boolean);
}

function has(element: Element | null | undefined, token: string): boolean {
  return tokens(element).includes(token);
}

function setOrientation(landscape: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: landscape && query.includes('orientation: landscape'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

beforeEach(() => {
  setOrientation(false);
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.hasPointerCapture = () => true;
  HTMLImageElement.prototype.decode = () => Promise.resolve();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderTracker({
  players,
  storageKey,
  gameMode = 'duel' as const,
  rulesFormat = 'normal' as const,
  promptRearrange = false,
}: {
  players: Array<{ id: string; name: string }>;
  storageKey: string;
  gameMode?: 'duel' | 'duel-commander' | 'commander';
  rulesFormat?: 'normal' | 'commander';
  promptRearrange?: boolean;
}) {
  render(
    <MemoryRouter>
      <FeedbackProvider>
        <TrackerView
          storageKey={storageKey}
          persist={false}
          gameMode={gameMode}
          rulesFormat={rulesFormat}
          players={players}
          promptRearrange={promptRearrange}
          onFinish={async () => undefined}
          onQuit={() => undefined}
        />
      </FeedbackProvider>
    </MemoryRouter>,
  );
}

async function revealAndStart() {
  vi.useFakeTimers();
  fireEvent.click(
    screen.getByRole('button', { name: 'Reveal starting player' }),
  );
  for (
    let step = 0;
    step < 80 && !screen.queryByRole('button', { name: 'Start' });
    step += 1
  ) {
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  vi.useRealTimers();
}

function board(): HTMLElement {
  const grid = document.querySelector('article')?.parentElement;
  if (!(grid instanceof HTMLElement)) {
    throw new Error('live board missing');
  }
  return grid;
}

function face(seatId: string): Element {
  const seat = board().querySelector(`[data-seat-id="${seatId}"]`);
  const inner = seat?.firstElementChild;
  if (!inner) {
    throw new Error(`face missing for ${seatId}`);
  }
  return inner;
}

function seam(): Element | undefined {
  return [...board().children].find((child) =>
    tokens(child).some((token) => token.startsWith('shadow-[')),
  );
}

function clock(): HTMLElement {
  const dial = document.querySelector('button[aria-expanded]');
  if (!(dial instanceof HTMLElement)) {
    throw new Error('clock missing');
  }
  return dial;
}

function tapRemove(seatId: string, times: number) {
  const button = board().querySelector(
    `[data-seat-id="${seatId}"] button[aria-label^="Remove"]`,
  );
  if (!(button instanceof HTMLElement)) {
    throw new Error(`remove control missing for ${seatId}`);
  }
  for (let step = 0; step < times; step += 1) {
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(button, { button: 0, pointerId: 1 });
  }
}

describe('duel positions on a tall phone', () => {
  it('splits wide into two columns and turns each total toward that player', async () => {
    renderTracker({ players: DUEL, storageKey: 'duel-wide-positions' });
    await revealAndStart();

    expect(board()).toHaveAttribute('data-board-layout', 'wide');
    expect(has(board(), 'grid-cols-2')).toBe(true);
    expect(has(board(), 'grid-rows-1')).toBe(true);
    expect(has(board(), 'gap-0')).toBe(true);
    expect(has(board(), 'gap-2')).toBe(false);

    const ada = board().querySelector('[data-seat-id="ada"]');
    const bea = board().querySelector('[data-seat-id="bea"]');
    expect(has(ada, 'col-start-2')).toBe(true);
    expect(has(bea, 'col-start-1')).toBe(true);
    for (const seat of [ada, bea]) {
      expect(has(seat, 'rounded-none')).toBe(true);
      expect(has(seat, 'border-0')).toBe(true);
      expect(has(seat, 'bg-hull')).toBe(false);
      expect(has(seat, 'rounded-2xl')).toBe(false);
    }

    expect(has(face('ada'), '-rotate-90')).toBe(true);
    expect(has(face('ada'), 'h-[100cqw]')).toBe(true);
    expect(has(face('ada'), 'w-[100cqh]')).toBe(true);
    expect(has(face('ada'), 'inset-0')).toBe(false);
    expect(has(face('bea'), 'rotate-90')).toBe(true);
    expect(has(face('bea'), '-rotate-90')).toBe(false);
    expect(has(clock(), 'rotate-90')).toBe(true);

    expect(has(seam(), 'left-1/2')).toBe(true);
    expect(has(seam(), 'w-0')).toBe(true);
    expect(has(seam(), 'top-1/2')).toBe(false);
  });

  it('stacks portrait and turns only the upper seat around', async () => {
    renderTracker({ players: DUEL, storageKey: 'duel-portrait-positions' });
    await revealAndStart();
    fireEvent.click(clock());
    fireEvent.click(clock());
    fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));
    fireEvent.click(screen.getByRole('button', { name: /Portrait/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(board()).toHaveAttribute('data-board-layout', 'portrait');
    expect(has(board(), 'grid-cols-1')).toBe(true);
    expect(has(board(), 'grid-rows-2')).toBe(true);
    expect(has(board(), 'grid-cols-2')).toBe(false);
    expect(has(board(), 'gap-0')).toBe(true);

    expect(has(face('ada'), 'rotate-180')).toBe(true);
    expect(has(face('ada'), 'inset-0')).toBe(true);
    expect(has(face('ada'), 'h-[100cqw]')).toBe(false);
    expect(has(face('bea'), 'inset-0')).toBe(true);
    expect(has(face('bea'), 'rotate-180')).toBe(false);
    expect(has(face('bea'), 'rotate-90')).toBe(false);
    expect(has(clock(), 'rotate-90')).toBe(false);

    expect(has(seam(), 'top-1/2')).toBe(true);
    expect(has(seam(), 'h-0')).toBe(true);
    expect(has(seam(), 'left-1/2')).toBe(false);
  });

  it('leaves a wide board upright when the phone is already landscape', async () => {
    setOrientation(true);
    renderTracker({ players: DUEL, storageKey: 'duel-landscape-wide' });
    await revealAndStart();

    expect(has(board(), 'grid-cols-2')).toBe(true);
    expect(has(board(), 'grid-rows-1')).toBe(true);
    expect(has(face('ada'), 'inset-0')).toBe(true);
    expect(has(face('ada'), 'rotate-90')).toBe(false);
    expect(has(face('ada'), '-rotate-90')).toBe(false);
    expect(has(face('bea'), 'rotate-90')).toBe(false);
    expect(has(clock(), 'rotate-90')).toBe(false);
    expect(has(seam(), 'left-1/2')).toBe(true);
  });

  it('keeps commander art flush and does not draw the non-commander seam', async () => {
    renderTracker({
      players: DUEL,
      storageKey: 'duel-commander-positions',
      gameMode: 'duel-commander',
      rulesFormat: 'commander',
    });
    await revealAndStart();

    expect(has(face('ada'), '-rotate-90')).toBe(true);
    expect(has(face('bea'), 'rotate-90')).toBe(true);
    expect(seam()).toBeUndefined();
    expect(has(board(), 'gap-0')).toBe(true);
    expect(
      has(board().querySelector('[data-seat-id="ada"]'), 'bg-hull'),
    ).toBe(false);
  });

  it('turns the loss prompt with the seat that reached zero', async () => {
    renderTracker({ players: DUEL, storageKey: 'duel-loss-positions' });
    await revealAndStart();
    tapRemove('ada', 20);
    tapRemove('bea', 20);

    const adaPrompt = screen.getByRole('dialog', {
      name: 'Did Ada lose the game?',
    });
    const beaPrompt = screen.getByRole('dialog', {
      name: 'Did Bea lose the game?',
    });
    expect(adaPrompt.parentElement).toBe(face('ada'));
    expect(beaPrompt.parentElement).toBe(face('bea'));
    expect(has(adaPrompt.parentElement, '-rotate-90')).toBe(true);
    expect(has(beaPrompt.parentElement, 'rotate-90')).toBe(true);

    fireEvent.click(clock());
    fireEvent.click(clock());
    fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));
    fireEvent.click(screen.getByRole('button', { name: /Portrait/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('dialog', { name: 'Did Ada lose the game?' }).parentElement).toBe(
      face('ada'),
    );
    expect(has(face('ada'), 'rotate-180')).toBe(true);
    expect(has(face('bea'), 'rotate-180')).toBe(false);
  });

  it('turns the counters sheet toward the player who opened it', async () => {
    renderTracker({ players: DUEL, storageKey: 'duel-counter-positions' });
    await revealAndStart();

    fireEvent.click(clock());
    fireEvent.click(screen.getByRole('button', { name: 'Open counters for Ada' }));
    let sheet = screen.getByRole('dialog', { name: 'Counters for Ada' });
    expect(has(sheet, '-rotate-90')).toBe(true);
    expect(has(sheet, 'h-[100dvw]')).toBe(true);
    expect(has(sheet, 'w-[100dvh]')).toBe(true);
    expect(has(sheet.querySelector('.grid'), 'grid-cols-4')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Close counters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open counters for Bea' }));
    sheet = screen.getByRole('dialog', { name: 'Counters for Bea' });
    expect(has(sheet, 'rotate-90')).toBe(true);
    expect(has(sheet, '-rotate-90')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Close counters' }));
    fireEvent.click(clock());
    fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));
    fireEvent.click(screen.getByRole('button', { name: /Portrait/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(clock());
    fireEvent.click(screen.getByRole('button', { name: 'Open counters for Ada' }));
    sheet = screen.getByRole('dialog', { name: 'Counters for Ada' });
    expect(has(sheet, 'rotate-180')).toBe(true);
    expect(has(sheet, 'h-[100dvw]')).toBe(false);
    expect(has(sheet.querySelector('.grid'), 'grid-cols-4')).toBe(false);
    expect(has(sheet.querySelector('.grid'), 'grid-cols-2')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Close counters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open counters for Bea' }));
    sheet = screen.getByRole('dialog', { name: 'Counters for Bea' });
    expect(has(sheet, 'rotate-180')).toBe(false);
    expect(has(sheet, 'rotate-90')).toBe(false);
  });
});

describe('duel menu positions', () => {
  it('turns the wide menu and draws rearrange seats as a stack inside that turn', async () => {
    renderTracker({ players: DUEL, storageKey: 'duel-menu-positions' });
    await revealAndStart();
    fireEvent.click(clock());
    fireEvent.click(clock());

    const menu = screen.getByRole('dialog', { name: 'Match menu' });
    expect(has(menu, 'rotate-90')).toBe(true);
    expect(has(menu, 'h-[100dvw]')).toBe(true);
    expect(has(menu, 'w-[100dvh]')).toBe(true);
    expect(has(menu.querySelector('.grid'), 'grid-cols-2')).toBe(true);
    expect(has(menu.querySelector('.grid'), 'grid-rows-2')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));
    const wide = screen.getByRole('button', { name: /Wide/ });
    const portrait = screen.getByRole('button', { name: /Portrait/ });
    const choices = wide.parentElement;
    expect(wide.compareDocumentPosition(portrait) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(has(choices, 'grid-cols-2')).toBe(true);
    expect(has(choices, 'grid-rows-2')).toBe(false);
    expect(has(wide.querySelector('.grid'), 'grid-rows-2')).toBe(true);
    expect(has(portrait.querySelector('.grid'), 'grid-cols-2')).toBe(true);

    fireEvent.click(portrait);
    expect(has(menu, 'rotate-90')).toBe(false);
    expect(has(wide.parentElement, 'grid-cols-1')).toBe(true);
    expect(has(wide.parentElement, 'grid-rows-2')).toBe(true);
    expect(has(wide.parentElement, 'grid-cols-2')).toBe(false);
    expect(tokens(wide.querySelector('span')).join(' ')).toContain('aspect-[2/1]');
    expect(has(wide.querySelector('span'), 'w-44')).toBe(true);
    const bars = wide.querySelectorAll('.grid > span');
    expect(has(bars[0], 'row-start-2')).toBe(true);
    expect(has(bars[1], 'row-start-1')).toBe(true);
    expect(tokens(portrait.querySelector('span')).join(' ')).toContain('aspect-[1/2]');
    expect(has(portrait.querySelector('.grid'), 'grid-rows-2')).toBe(true);

    fireEvent.click(wide);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(clock());
    fireEvent.click(clock());
    fireEvent.click(screen.getByRole('button', { name: 'Rearrange seats' }));

    const ada = screen.getByRole('button', { name: 'Ada, Seat 1' });
    const bea = screen.getByRole('button', { name: 'Bea, Seat 2' });
    const pick = ada.closest('[data-board-layout]');
    expect(pick).toHaveAttribute('data-board-layout', 'wide');
    expect(has(pick, 'grid-rows-2')).toBe(true);
    expect(has(pick, 'grid-cols-2')).toBe(false);
    expect(has(ada.firstElementChild, 'rotate-180')).toBe(true);
    expect(has(ada.firstElementChild, 'rotate-90')).toBe(false);
    expect(has(bea.firstElementChild, 'rotate-180')).toBe(false);
    expect(has(bea.firstElementChild, 'rotate-90')).toBe(false);
    expect(has(screen.getByRole('dialog', { name: 'Match menu' }), 'rotate-90')).toBe(
      true,
    );
  });

  it('fills the replay seat board and turns those seats like the live wide board', () => {
    renderTracker({
      players: DUEL,
      storageKey: 'duel-replay-positions',
      promptRearrange: true,
    });

    const heading = screen.getByRole('heading', { name: 'Confirm seat order' });
    const column = heading.parentElement?.parentElement;
    expect(has(column, 'h-full')).toBe(true);
    expect(has(column, 'flex-col')).toBe(true);
    expect(has(column, 'min-h-0')).toBe(true);

    const ada = screen.getByRole('button', { name: 'Ada, Seat 1' });
    const bea = screen.getByRole('button', { name: 'Bea, Seat 2' });
    const pick = ada.closest('[data-board-layout]');
    expect(has(pick, 'grid-cols-2')).toBe(true);
    expect(has(pick, 'grid-rows-1')).toBe(true);
    expect(has(pick, 'flex-1')).toBe(true);
    expect(has(pick?.parentElement, 'flex')).toBe(true);
    expect(has(pick?.parentElement, 'flex-1')).toBe(true);
    expect(has(ada, 'col-start-2')).toBe(true);
    expect(has(bea, 'col-start-1')).toBe(true);
    expect(has(ada.firstElementChild, '-rotate-90')).toBe(true);
    expect(has(bea.firstElementChild, 'rotate-90')).toBe(true);
  });
});

describe('four-player positions stay off the duel path', () => {
  it('keeps the pod grid and does not borrow duel turns, the seam, or the wide menu', async () => {
    renderTracker({
      players: POD,
      storageKey: 'pod-positions',
      gameMode: 'commander',
      rulesFormat: 'commander',
    });
    await revealAndStart();

    expect(has(board(), 'grid-cols-1')).toBe(true);
    expect(has(board(), 'landscape:grid-cols-2')).toBe(true);
    expect(has(board(), 'landscape:grid-rows-2')).toBe(true);
    expect(has(board(), 'grid-cols-2')).toBe(false);
    expect(has(board(), 'grid-rows-1')).toBe(false);
    expect(seam()).toBeUndefined();

    for (const id of ['ada', 'bea', 'cam', 'dee']) {
      const seat = board().querySelector(`[data-seat-id="${id}"]`);
      expect(has(seat, 'col-start-1')).toBe(false);
      expect(has(seat, 'col-start-2')).toBe(false);
      expect(has(face(id), 'inset-0')).toBe(true);
      expect(has(face(id), 'rotate-90')).toBe(false);
      expect(has(face(id), '-rotate-90')).toBe(false);
      expect(has(face(id), 'h-[100cqw]')).toBe(false);
    }

    expect(has(clock(), 'rotate-90')).toBe(false);
    fireEvent.click(clock());
    fireEvent.click(clock());
    const menu = screen.getByRole('dialog', { name: 'Match menu' });
    expect(has(menu, 'rotate-90')).toBe(false);
    expect(has(menu, 'h-[100dvw]')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Change layout' })).toBeNull();
  });
});
