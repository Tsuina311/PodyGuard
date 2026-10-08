/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Brand } from './Brand';

afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe('version tip', () => {
  it('toggles developer mode from the same tip as the version', () => {
    render(<Brand />);
    fireEvent.click(screen.getByRole('button', { name: /PodyGuard version/ }));
    expect(screen.getByTestId('app-version')).toHaveTextContent(/^v/);
    fireEvent.click(screen.getByTestId('developer-mode-toggle'));
    expect(screen.getByTestId('developer-mode-toggle')).toHaveTextContent(
      'Developer mode on',
    );
    expect(localStorage.getItem('podyguard.developer-mode')).toBe('on');
  });
});
