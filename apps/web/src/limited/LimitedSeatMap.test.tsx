/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LimitedSeatMap } from './LimitedSeatMap';

afterEach(() => {
  cleanup();
});

describe('Limited seat map', () => {
  it('puts mats along the square sides and keeps global seat numbers on the second table', () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <LimitedSeatMap shape="square" seatCount={8} selfId="p1" occupants={[]} onPick={onPick} />,
    );
    const edges = screen.getAllByRole('button', { name: /Seat/ }).map(button => button.dataset.edge);
    expect(edges).toEqual(['north', 'north', 'east', 'east', 'south', 'south', 'west', 'west']);
    rerender(<LimitedSeatMap shape="rectangle" seatCount={4} seatOffset={4} tableLabel="Table 2"
      selfId="p1" occupants={[]} onPick={onPick} />);
    expect(screen.getByText('Table 2')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Seat/ }).map(button => button.dataset.edge))
      .toEqual(['north', 'north', 'south', 'south']);
    fireEvent.click(screen.getByRole('button', { name: /Seat 5/ }));
    expect(onPick).toHaveBeenCalledWith(5);
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
