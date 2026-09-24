import { describe, expect, it } from 'vitest';

import {
  allocateCapacity,
  compareQueueAge,
  emptyCategoryCounts,
  nextSmoothCategory,
  QUEUE_CATEGORIES,
  redistributionCategory,
} from '@/features/sequencer/server/policies/fair-queue';

describe('weighted fair queue policy', () => {
  it('allocates constrained capacity proportionally with deterministic rounding', () => {
    expect(
      allocateCapacity(
        { initial: 50, followUp1: 20, followUp2: 15, followUp3: 10 },
        10,
      ),
    ).toEqual({ initial: 5, followUp1: 2, followUp2: 2, followUp3: 1 });
  });

  it('smoothly interleaves a 10:4:3:2 mix instead of draining categories', () => {
    const allocation = {
      initial: 10,
      followUp1: 4,
      followUp2: 3,
      followUp3: 2,
    };
    const confirmed = emptyCategoryCounts();
    let current = emptyCategoryCounts();
    const sequence: string[] = [];

    while (sequence.length < 19) {
      const selected = nextSmoothCategory(
        allocation,
        confirmed,
        current,
        new Set(QUEUE_CATEGORIES),
      )!;
      sequence.push(selected.category);
      confirmed[selected.category]++;
      current = selected.current;
    }

    expect(confirmed).toEqual(allocation);
    expect(sequence.slice(0, 6)).toContain('followUp1');
    expect(sequence.slice(0, 6)).toContain('followUp2');
    expect(sequence.slice(0, 8)).toContain('followUp3');
    expect(sequence.join(',')).not.toContain('initial,initial,initial');
  });

  it('orders equal-age records by stable ID and redistributes to the oldest follow-up', () => {
    expect(
      [
        { queuedAt: 10, id: 'recB' },
        { queuedAt: 10, id: 'recA' },
        { queuedAt: 5, id: 'recC' },
      ].sort(compareQueueAge),
    ).toEqual([
      { queuedAt: 5, id: 'recC' },
      { queuedAt: 10, id: 'recA' },
      { queuedAt: 10, id: 'recB' },
    ]);
    expect(
      redistributionCategory(new Set(['initial', 'followUp1', 'followUp2']), {
        initial: 1,
        followUp1: 20,
        followUp2: 10,
      }),
    ).toBe('followUp2');
  });
});
