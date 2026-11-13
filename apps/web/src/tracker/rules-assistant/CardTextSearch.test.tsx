/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { lookupCardText } from '../../card-text-cache';
import { MagicRulesSheet } from './MagicRulesSheet';

vi.mock('../../card-text-cache', () => ({ lookupCardText: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('card lookup in Magic Rules', () => {
  it('returns English text for a translated name without rendering or requesting artwork', async () => {
    vi.mocked(lookupCardText).mockResolvedValue([{ oracleId: 'bolt', name: 'Lightning Bolt', faces: [{
      name: 'Lightning Bolt', manaCost: '{R}', typeLine: 'Instant', oracleText: 'Lightning Bolt deals 3 damage to any target.',
      power: '', toughness: '', loyalty: '', defense: '',
    }] }]);
    render(<MagicRulesSheet onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cards' }));
    fireEvent.change(screen.getByLabelText('Card name (any language)'), { target: { value: 'Foudre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Lightning Bolt deals 3 damage to any target.')).toBeVisible();
    expect(lookupCardText).toHaveBeenCalledWith('Foudre');
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'en');
    expect(screen.queryByRole('img')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Rules' }));
    expect(screen.getByLabelText('Rules question')).toBeVisible();
  });

  it('handles no matches, an unavailable service, and a successful retry', async () => {
    vi.mocked(lookupCardText).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    render(<MagicRulesSheet onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cards' }));
    fireEvent.change(screen.getByLabelText('Card name (any language)'), { target: { value: 'unknown' } });
    const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    submit();
    expect(await screen.findByText(/No matching card/)).toBeVisible();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Check your connection/);
    submit();
    expect(await screen.findByText(/No matching card/)).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
