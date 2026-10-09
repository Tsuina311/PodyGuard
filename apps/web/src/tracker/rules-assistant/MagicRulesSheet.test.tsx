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
    expect(
      screen.getByText(/assign combat damage beyond what is needed/),
    ).toBeTruthy();
    expect(screen.queryByText(/Voice input is not available/)).toBeNull();
    expect(screen.queryByText(/Official wording is not copied/)).toBeNull();
    expect(screen.queryByText(/Dictation uses your browser/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Flying' })).toBeNull();
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

  it('shows the French explanation when the app language is French', async () => {
    await i18n.changeLanguage('fr');
    render(<MagicRulesSheet onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Question de règles'), {
      target: { value: 'haste' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Chercher' }));
    expect(screen.getByRole('heading', { name: 'Célérité' })).toBeTruthy();
    expect(screen.getByText(/La célérité permet/)).toBeTruthy();
    expect(screen.queryByText(/Haste lets a creature attack/)).toBeNull();
  });

  it('shows the French explanation for a French question in an English app', () => {
    render(<MagicRulesSheet onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Rules question'), {
      target: { value: 'Piétinement' },
    });
    fireEvent.keyDown(screen.getByLabelText('Rules question'), {
      key: 'Enter',
      code: 'Enter',
    });
    expect(screen.getByRole('heading', { name: 'Piétinement' })).toBeTruthy();
    expect(screen.getByText(/Le piétinement permet/)).toBeTruthy();
    expect(screen.queryByText(/Trample lets an attacking creature/)).toBeNull();
  });

  it('completes a clipped word into the matching suggestions', () => {
    render(<MagicRulesSheet onClose={() => undefined} />);
    const field = screen.getByLabelText('Rules question');
    fireEvent.change(field, { target: { value: 'initiat' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    expect(screen.getByRole('button', { name: 'First strike' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'The initiative' })).toBeTruthy();
    expect(screen.getByLabelText('Rules question')).toHaveValue('initiative');
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
