import type { TableShape } from '@podyguard/shared';

export const tableDiagramSize = { width: 360, height: 280 };
type Edge = 'north' | 'east' | 'south' | 'west';
type Mat = { x: number; y: number; width: number; height: number; angle: number; edge?: Edge };
const edges: Edge[] = ['north', 'east', 'south', 'west'];

export function tableSeatGeometry(shape: TableShape, seats: number) {
  const width = shape === 'rectangle' ? 230 : 162;
  const height = shape === 'rectangle' ? 124 : width;
  const x = (tableDiagramSize.width - width) / 2;
  const y = (tableDiagramSize.height - height) / 2;
  const table = { x, y, width, height, radius: shape === 'round' ? width / 2 : 12 };

  if (shape === 'round') {
    const mats = Array.from({ length: seats }, (_, index): Mat => {
      const angle = 360 * index / seats;
      const radians = angle * Math.PI / 180;
      return {
        x: 180 + 108 * Math.sin(radians),
        y: 140 - 108 * Math.cos(radians),
        width: Math.min(54, 600 / seats),
        height: 40,
        angle,
      };
    });
    return { table, mats };
  }

  const endSeats = seats >= 6 ? Math.max(1, Math.round(seats / 8)) : 0;
  const longSeats = seats - 2 * endSeats;
  const across = Math.floor(seats / 4);
  const remainder = seats % 4;
  const counts = shape === 'rectangle'
    ? [Math.ceil(longSeats / 2), endSeats, Math.floor(longSeats / 2), endSeats]
    : [across + Number(remainder > 0), across + Number(remainder > 2), across + Number(remainder > 1), across];

  const mats = edges.flatMap((edge, edgeIndex) => {
    const count = counts[edgeIndex]!;
    const horizontal = edge === 'north' || edge === 'south';
    return Array.from({ length: count }, (_, index): Mat => {
      const step = (index + 0.5) / count;
      // Keep seat numbers running clockwise for pack passing and pairing.
      const position = edge === 'south' || edge === 'west' ? 1 - step : step;
      return {
        x: horizontal ? x + width * position : edge === 'east' ? x + width + 26 : x - 26,
        y: horizontal ? (edge === 'north' ? y - 26 : y + height + 26) : y + height * position,
        width: horizontal ? Math.min(64, width / count - 4) : 44,
        height: horizontal ? 44 : Math.min(64, height / count - 4),
        angle: 0,
        edge,
      };
    });
  });
  return { table, mats };
}
