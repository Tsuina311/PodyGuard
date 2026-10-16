/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FeedbackProvider } from '../feedback/FeedbackContext';
import '../i18n';
import { SEAT_COLORS } from '../match-config';
import { TrackerView } from './TrackerView';

function matchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  };
}

beforeEach(() => {
  window.matchMedia = matchMedia;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.hasPointerCapture = () => true;
  HTMLImageElement.prototype.decode = () => Promise.resolve();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function startMatch(
  players: Array<{ id: string; name: string }>,
  storageKey: string,
) {
  render(
    <MemoryRouter>
      <FeedbackProvider>
        <TrackerView
          storageKey={storageKey}
          persist={false}
          gameMode={players.length === 2 ? 'duel' : 'commander'}
          rulesFormat={players.length === 2 ? 'normal' : 'commander'}
          players={players}
          onFinish={async () => undefined}
          onQuit={() => undefined}
        />
      </FeedbackProvider>
    </MemoryRouter>,
  );
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
  fireEvent.click(screen.getByRole('button', { name: /Show seat controls/ }));
  fireEvent.click(screen.getByRole('button', { name: /Match menu/ }));
}

function lifeColor(label: HTMLElement): string {
  return label.querySelector('p')?.style.color ?? '';
}

/** jsdom serializes inline hex colours as rgb(). */
function asRgb(hex: string): string {
  const value = hex.slice(1);
  const channels = [0, 2, 4].map((start) =>
    Number.parseInt(value.slice(start, start + 2), 16),
  );
  return `rgb(${channels.join(', ')})`;
}

describe('rearranging duel seats', () => {
  it('shows each player’s name and keeps their colour when two seats swap', async () => {
    render(
      <MemoryRouter>
        <FeedbackProvider>
          <TrackerView
            storageKey="rearrange-seats-test"
            persist={false}
            gameMode="duel"
            rulesFormat="normal"
            players={[
              { id: 'ada', name: 'Ada' },
              { id: 'bea', name: 'Bea' },
            ]}
            onFinish={async () => undefined}
            onQuit={() => undefined}
          />
        </FeedbackProvider>
      </MemoryRouter>,
    );

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

    fireEvent.click(screen.getByRole('button', { name: /Show seat controls/ }));
    fireEvent.click(screen.getByRole('button', { name: /Match menu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Rearrange seats' }));

    const ada = screen.getByRole('button', { name: 'Ada, Seat 1' });
    const bea = screen.getByRole('button', { name: 'Bea, Seat 2' });
    expect(ada).toHaveTextContent('Ada');
    expect(bea).toHaveTextContent('Bea');
    expect(lifeColor(ada)).toBe(asRgb(SEAT_COLORS[0]));
    expect(lifeColor(bea)).toBe(asRgb(SEAT_COLORS[1]));

    fireEvent.click(ada);
    fireEvent.click(bea);

    const movedAda = screen.getByRole('button', { name: 'Ada, Seat 2' });
    const movedBea = screen.getByRole('button', { name: 'Bea, Seat 1' });
    expect(lifeColor(movedAda)).toBe(asRgb(SEAT_COLORS[0]));
    expect(lifeColor(movedBea)).toBe(asRgb(SEAT_COLORS[1]));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const adaSeat = document.querySelector('[data-seat-id="ada"]');
    const beaSeat = document.querySelector('[data-seat-id="bea"]');
    expect(adaSeat?.querySelector('p')?.style.color).toBe(asRgb(SEAT_COLORS[0]));
    expect(beaSeat?.querySelector('p')?.style.color).toBe(asRgb(SEAT_COLORS[1]));
  });
});

describe('duel board layout', () => {
  it('shows the wide layout as selected and stacks the seats in portrait', async () => {
    await startMatch(
      [
        { id: 'ada', name: 'Ada' },
        { id: 'bea', name: 'Bea' },
      ],
      'layout-test',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));
    const wide = screen.getByRole('button', { name: /Wide/ });
    const portrait = screen.getByRole('button', { name: /Portrait/ });
    expect(wide).toHaveAttribute('aria-pressed', 'true');
    expect(portrait).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('[data-board-layout="wide"]')).toBeTruthy();

    fireEvent.click(portrait);
    expect(portrait).toHaveAttribute('aria-pressed', 'true');
    expect(wide).toHaveAttribute('aria-pressed', 'false');
    const board = document.querySelector('[data-board-layout="portrait"]');
    expect(board).toBeTruthy();
    expect(board?.className).toContain('grid-rows-2');
    expect(board?.className).not.toContain('grid-cols-2');
  });

  it('keeps a single full-width layout when there are more than two seats', async () => {
    await startMatch(
      [
        { id: 'ada', name: 'Ada' },
        { id: 'bea', name: 'Bea' },
        { id: 'cam', name: 'Cam' },
        { id: 'dee', name: 'Dee' },
      ],
      'layout-pod-test',
    );
    expect(screen.queryByRole('button', { name: 'Change layout' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rearrange seats' })).toBeTruthy();
  });
});
