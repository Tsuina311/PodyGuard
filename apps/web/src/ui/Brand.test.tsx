/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Brand } from './Brand';

afterEach(() => {
  localStorage.clear();
  cleanup();
});

function renderBrand() {
  return render(
    <MemoryRouter>
      <Brand />
    </MemoryRouter>,
  );
}

describe('version tip', () => {
  it('toggles developer mode from the same tip as the version', () => {
    renderBrand();
    fireEvent.click(screen.getByRole('button', { name: /PodyGuard version/ }));
    const tip = screen.getByTestId('app-version');
    expect(tip).toHaveTextContent(/^v/);
    expect(tip.parentElement).toHaveClass('top-full');
    fireEvent.click(screen.getByTestId('developer-mode-toggle'));
    expect(screen.getByTestId('developer-mode-toggle')).toHaveTextContent(
      'Developer mode on',
    );
    expect(localStorage.getItem('podyguard.developer-mode')).toBe('on');
  });

  it('stays open when a tap focuses the dot and then clicks it', () => {
    renderBrand();
    const dot = screen.getByRole('button', { name: /PodyGuard version/ });
    fireEvent.focus(dot);
    fireEvent.click(dot);
    expect(screen.getByRole('link', { name: 'Wake demo' })).toHaveAttribute(
      'href',
      '/wake',
    );
  });

  it('keeps the wake demo link inside the version tip', () => {
    renderBrand();
    expect(screen.queryByRole('link', { name: 'Wake demo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /PodyGuard version/ }));
    expect(screen.getByRole('link', { name: 'Wake demo' })).toHaveAttribute(
      'href',
      '/wake',
    );
  });
});
