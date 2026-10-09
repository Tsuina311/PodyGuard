/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { MagicRulesSheet } from './MagicRulesSheet';

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('Magic Rules sheet', () => {
  it('searches from the keyboard when speech recognition is unavailable', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<MagicRulesSheet onClose={() => undefined} />);
    expect(
      screen.getByRole('button', { name: 'Dictate a question' }),
    ).toBeDisabled();
    expect(screen.getByText(/Voice input is not available/)).toBeTruthy();

    const field = screen.getByLabelText('Rules question');
    fireEvent.change(field, { target: { value: 'trample' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });

    expect(screen.getByRole('heading', { name: 'Trample' })).toBeTruthy();
    expect(screen.getByText('Rule 702.19')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Official rules' })).toHaveAttribute(
      'href',
      'https://magic.wizards.com/en/rules',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('searches when the Search button is used', () => {
    render(<MagicRulesSheet onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Rules question'), {
      target: { value: 'haste' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('heading', { name: 'Haste' })).toBeTruthy();
    expect(screen.getByText('Rule 702.10')).toBeTruthy();
  });

  it('opens a popular rule and then a related rule', () => {
    render(<MagicRulesSheet onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Double strike' }));
    expect(
      screen.getByRole('heading', { name: 'Double strike' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'First strike' }));
    expect(screen.getByRole('heading', { name: 'First strike' })).toBeTruthy();
    expect(screen.getByText('Rule 702.7')).toBeTruthy();
  });

  it('shows the English note when the interface language has no translation', async () => {
    await i18n.changeLanguage('de');
    render(<MagicRulesSheet onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Flying' }));
    expect(screen.getByText(/Shown in English/)).toBeTruthy();
    expect(
      screen.getByText(/blocked only by creatures that have flying or reach/i),
    ).toBeTruthy();
  });
});
