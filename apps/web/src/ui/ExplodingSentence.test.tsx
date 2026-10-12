/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ServerWakeScreen } from './ServerWakeScreen';
import { LETTER_BURST_MS, LETTER_RETURN_MS } from './ExplodingSentence';

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('wake sentence letters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bursts one letter and brings it back two seconds later', () => {
    render(<ServerWakeScreen />);
    expect(
      screen.getByRole('heading', { name: 'Waking the tables' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'W' })).toBeNull();
    expect(screen.queryByRole('button', { name: '.' })).toBeNull();

    const message = i18n.t('wake.message');
    const letters = Array.from(message).filter((char) => /^\p{L}$/u.test(char));
    expect(screen.getAllByRole('button', { name: /^.$/u })).toHaveLength(
      letters.length,
    );

    const tapped = screen.getByRole('button', { name: 'T' });
    const neighbor = screen.getByRole('button', { name: 'K' });
    fireEvent.click(tapped);
    expect(tapped).toBeDisabled();
    expect(tapped).not.toHaveClass('invisible');
    expect(neighbor).toBeEnabled();

    act(() => {
      vi.advanceTimersByTime(LETTER_BURST_MS);
    });
    expect(tapped).toHaveClass('invisible');
    expect(neighbor).toBeEnabled();

    act(() => {
      vi.advanceTimersByTime(LETTER_RETURN_MS - 1);
    });
    expect(tapped).toHaveClass('invisible');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(tapped).not.toHaveClass('invisible');
    expect(tapped).toBeEnabled();
  });
});
