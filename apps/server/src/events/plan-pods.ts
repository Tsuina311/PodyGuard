const POD_SIZE = 4;
const FALLBACK_POD_SIZE = 3;

export function planPods<TPlayer, TTable>(
  ready: TPlayer[],
  freeTables: TTable[],
): Array<{ players: TPlayer[]; table: TTable }> {
  const queue = [...ready];
  const tables = [...freeTables];
  const pods: Array<{ players: TPlayer[]; table: TTable }> = [];

  while (tables.length > 0 && queue.length >= FALLBACK_POD_SIZE) {
    const size = queue.length >= POD_SIZE ? POD_SIZE : FALLBACK_POD_SIZE;
    const table = tables.shift();
    if (!table) {
      break;
    }
    pods.push({
      players: queue.splice(0, size),
      table,
    });
  }

  return pods;
}

export const SEATS_PER_TABLE = POD_SIZE;
