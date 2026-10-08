/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LimitedSeatMap } from './LimitedSeatMap';

afterEach(() => {
  cleanup();
});

describe('Limited seat map', () => {
  it('switches a pod of four to two players facing two', () => {
    const onLayout = vi.fn();
    const { rerender } = render(
      <LimitedSeatMap
        seatCount={4}
        selfId="p1"
        occupants={[]}
        onLayout={onLayout}
        onPick={() => undefined}
      />,
    );
    expect(screen.getByText(/One player on each side/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Long table' }));
    expect(onLayout).toHaveBeenCalledWith('long');

    rerender(
      <LimitedSeatMap
        seatCount={4}
        selfId="p1"
        layout="long"
        occupants={[]}
        onLayout={onLayout}
        onPick={() => undefined}
      />,
    );
    expect(screen.getByText(/Two players sit across from two/)).toBeTruthy();
    const seats = screen.getAllByRole('button', { name: /Seat/ });
    expect(seats.map((seat) => seat.textContent)).toEqual([
      'Seat 1Open',
      'Seat 2Open',
      'Seat 3Open',
      'Seat 4Open',
    ]);
  });
});
