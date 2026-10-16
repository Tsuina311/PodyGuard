/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ServerWakeScreen } from './ServerWakeScreen';
import {
  ExplodingSentence,
  LETTER_BURST_MS,
  LETTER_FALL_MS,
  LETTER_FLY_MS,
  LETTER_RETURN_MS,
} from './ExplodingSentence';

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('wake sentence letters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps the burst motion and brings the letter back', () => {
    render(<ExplodingSentence text="Waking" motion="burst" />);
    const titleLetter = screen.getByRole('button', { name: 'W' });
    fireEvent.click(titleLetter);
    expect(titleLetter).toHaveClass('letter-explode');
    act(() => {
      vi.advanceTimersByTime(LETTER_BURST_MS);
    });
    expect(titleLetter).toHaveClass('opacity-0');
    expect(screen.getByRole('button', { name: 'a' })).not.toHaveClass(
      'opacity-0',
    );

    act(() => {
      vi.advanceTimersByTime(LETTER_RETURN_MS + 32);
    });
    expect(titleLetter).not.toHaveClass('opacity-0');
    expect(titleLetter).toBeEnabled();
  });

  it('drops the hovered letter off the screen', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<ServerWakeScreen switchable />);
    fireEvent.click(screen.getByRole('button', { name: 'fall' }));
    expect(
      screen.getByRole('heading', { name: 'Waking the tables' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'host' })).toBeNull();

    const [hovered, neighbor] = screen.getAllByRole('button', { name: 'o' });
    fireEvent.pointerEnter(hovered!);
    expect(hovered).toHaveClass('letter-fall');
    expect(neighbor).not.toHaveClass('letter-fall');
    act(() => {
      vi.advanceTimersByTime(LETTER_FALL_MS);
    });
    expect(hovered).toHaveClass('opacity-0');
    expect(neighbor).not.toHaveClass('opacity-0');
  });

  it('throws a hovered letter off on a random heading', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<ServerWakeScreen switchable />);
    const [hovered, neighbor] = screen.getAllByRole('button', { name: 'o' });
    fireEvent.pointerEnter(hovered!);
    expect(hovered).toHaveClass('letter-fly');
    expect(hovered?.style.getPropertyValue('--letter-fly-x')).toMatch(/vw$/);
    expect(hovered?.style.getPropertyValue('--letter-fly-y')).toMatch(/vh$/);
    expect(hovered?.style.getPropertyValue('--letter-burst-rot')).toMatch(/deg$/);
    expect(neighbor).not.toHaveClass('letter-fly');
    act(() => {
      vi.advanceTimersByTime(LETTER_FLY_MS);
    });
    expect(hovered).toHaveClass('opacity-0');
    expect(neighbor).not.toHaveClass('opacity-0');
  });

  it('switches back to the burst motion', () => {
    render(<ServerWakeScreen switchable />);
    fireEvent.click(screen.getByRole('button', { name: 'burst' }));
    const titleLetter = screen.getByRole('button', { name: 'W' });
    fireEvent.click(titleLetter);
    expect(titleLetter).toHaveClass('letter-explode');
  });

  it('picks one motion for the waiting screen and hides the switch', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<ServerWakeScreen />);
    expect(screen.queryByRole('button', { name: 'fall' })).toBeNull();
    const titleLetter = screen.getByRole('button', { name: 'W' });
    fireEvent.click(titleLetter);
    expect(titleLetter).toHaveClass('letter-explode');
    vi.restoreAllMocks();
  });
});
