export type ScheduledEvent<T> = Readonly<{
  time: number;
  sequence: number;
  value: T;
}>;

/** Stable min-priority queue ordered by integer timestamp, then insertion order. */
export class StableEventQueue<T> {
  private readonly heap: ScheduledEvent<T>[] = [];
  private nextSequence = 0;

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  schedule(time: number, value: T): ScheduledEvent<T> {
    if (!Number.isSafeInteger(time) || time < 0) {
      throw new Error(`Event time must be a non-negative safe integer, received ${time}.`);
    }
    const event: ScheduledEvent<T> = { time, sequence: this.nextSequence, value };
    this.nextSequence += 1;
    this.heap.push(event);
    this.bubbleUp(this.heap.length - 1);
    return event;
  }

  enqueue(time: number, value: T): ScheduledEvent<T> {
    return this.schedule(time, value);
  }

  peek(): ScheduledEvent<T> | undefined {
    return this.heap[0];
  }

  pop(): ScheduledEvent<T> | undefined {
    const first = this.heap[0];
    const last = this.heap.pop();
    if (!first || !last) {
      return first;
    }
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  clear(): void {
    this.heap.length = 0;
  }

  private bubbleUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const item = this.heap[index];
      const parentItem = this.heap[parent];
      if (!item || !parentItem || compareEvents(parentItem, item) <= 0) {
        return;
      }
      this.heap[parent] = item;
      this.heap[index] = parentItem;
      index = parent;
    }
  }

  private sinkDown(start: number): void {
    let index = start;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      const bestItem = this.heap[best];
      const leftItem = this.heap[left];
      if (leftItem && bestItem && compareEvents(leftItem, bestItem) < 0) {
        best = left;
      }
      const currentBest = this.heap[best];
      const rightItem = this.heap[right];
      if (rightItem && currentBest && compareEvents(rightItem, currentBest) < 0) {
        best = right;
      }
      if (best === index) {
        return;
      }
      const item = this.heap[index];
      const swap = this.heap[best];
      if (!item || !swap) {
        return;
      }
      this.heap[index] = swap;
      this.heap[best] = item;
      index = best;
    }
  }
}

function compareEvents<T>(left: ScheduledEvent<T>, right: ScheduledEvent<T>): number {
  return left.time - right.time || left.sequence - right.sequence;
}

export { StableEventQueue as EventQueue };
