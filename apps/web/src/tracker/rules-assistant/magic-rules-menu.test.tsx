/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FeedbackProvider } from '../../feedback/FeedbackContext';
import '../../i18n';
import { TrackerView } from '../TrackerView';

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

describe('Magic Rules in the life tracker', () => {
  it('opens from the match menu and leaves the game state in place', async () => {
    render(
      <MemoryRouter>
        <FeedbackProvider>
          <TrackerView
            storageKey="magic-rules-test"
            persist={false}
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
    for (let step = 0; step < 80 && !screen.queryByRole('button', { name: 'Start' }); step += 1) {
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    vi.useRealTimers();
    const addLife = screen.getAllByRole('button', {
      name: 'Add 1 life. Long press for a larger amount.',
    })[0];
    expect(addLife).toBeTruthy();
    fireEvent.pointerDown(addLife as HTMLElement, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(addLife as HTMLElement, { button: 0, pointerId: 1 });
    expect(screen.getAllByText('41').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Show seat controls/ }));
    fireEvent.click(screen.getByRole('button', { name: /Match menu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Magic Rules' }));

    expect(
      await screen.findByRole('heading', { name: 'Magic Rules' }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Rules question'), {
      target: { value: 'commander tax' },
    });
    fireEvent.submit(
      screen.getByLabelText('Rules question').closest('form') as HTMLFormElement,
    );
    expect(await screen.findByText('Rule 903.8')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close Magic Rules' }));
    expect(screen.queryByRole('heading', { name: 'Magic Rules' })).toBeNull();
    expect(screen.getAllByText('41').length).toBeGreaterThan(0);
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('Bea')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });
});
