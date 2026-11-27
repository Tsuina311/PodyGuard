/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LimitedSeatMap } from './LimitedSeatMap';

afterEach(() => {
  cleanup();
});

describe('Limited seat map', () => {
  it('distinguishes open, occupied, and selected seats without blocking swaps', () => {
    const onPick = vi.fn();
    const occupied = { participantId: 'p2', displayName: 'Dax', seat: 2 };
    const mine = { participantId: 'p1', displayName: 'Max', seat: 3 };
    const { rerender } = render(
      <LimitedSeatMap seatCount={4} selfId="p1" occupants={[occupied]} onPick={onPick} />,
    );
    expect(screen.getByRole('button', { name: 'Seat 1 Open' })).toHaveClass('bg-gain/15', 'border-dashed');
    const taken = screen.getByRole('button', { name: 'Seat 2 Dax' });
    expect(taken).toHaveClass('bg-ink/5');
    expect(taken).toBeDisabled();

    rerender(<LimitedSeatMap seatCount={4} selfId="p1" occupants={[occupied, mine]} onPick={onPick} />);
    expect(screen.getByRole('button', { name: 'Seat 3 Max', pressed: true })).toHaveClass('ring-neon/40');
    expect(taken).toBeEnabled();
    fireEvent.click(taken);
    expect(onPick).toHaveBeenCalledWith(2);

    rerender(<LimitedSeatMap seatCount={4} selfId="p1" seated occupants={[occupied, mine]} onPick={onPick} />);
    expect(screen.queryByText('Tap another chair to swap seats.')).not.toBeInTheDocument();
  });

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
