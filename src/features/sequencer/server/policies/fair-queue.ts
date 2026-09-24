export const QUEUE_CATEGORIES = [
  'initial',
  'followUp1',
  'followUp2',
  'followUp3',
] as const;

export type QueueCategory = (typeof QUEUE_CATEGORIES)[number];
export type CategoryCounts = Record<QueueCategory, number>;

export function compareQueueAge(
  left: { queuedAt: number; id: string },
  right: { queuedAt: number; id: string },
) {
  return left.queuedAt - right.queuedAt || left.id.localeCompare(right.id);
}

export function emptyCategoryCounts(): CategoryCounts {
  return { initial: 0, followUp1: 0, followUp2: 0, followUp3: 0 };
}

export function allocateCapacity(
  demand: CategoryCounts,
  capacity: number,
): CategoryCounts {
  const allocation = emptyCategoryCounts();
  const totalDemand = QUEUE_CATEGORIES.reduce(
    (sum, category) => sum + demand[category],
    0,
  );
  let remaining = Math.min(Math.max(0, capacity), totalDemand);

  if (remaining === totalDemand) {
    return { ...demand };
  }

  const shares = QUEUE_CATEGORIES.map((category, index) => {
    const exact =
      totalDemand === 0 ? 0 : (remaining * demand[category]) / totalDemand;
    const base = Math.min(demand[category], Math.floor(exact));
    allocation[category] = base;

    return { category, index, remainder: exact - base };
  });
  remaining -= QUEUE_CATEGORIES.reduce(
    (sum, category) => sum + allocation[category],
    0,
  );

  shares
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .forEach(({ category }) => {
      if (remaining > 0 && allocation[category] < demand[category]) {
        allocation[category]++;
        remaining--;
      }
    });

  return allocation;
}

export function nextSmoothCategory(
  allocation: CategoryCounts,
  confirmed: CategoryCounts,
  current: CategoryCounts,
  available: ReadonlySet<QueueCategory>,
): { category: QueueCategory; current: CategoryCounts } | null {
  const remaining = emptyCategoryCounts();
  for (const category of QUEUE_CATEGORIES) {
    remaining[category] = Math.max(
      0,
      allocation[category] - confirmed[category],
    );
  }
  const weighted = QUEUE_CATEGORIES.filter(
    (category) => remaining[category] > 0 && available.has(category),
  );
  if (!weighted.length) {
    return null;
  }

  const updated = { ...current };
  const totalWeight = weighted.reduce(
    (sum, category) => sum + remaining[category],
    0,
  );
  for (const category of weighted) {
    updated[category] += remaining[category];
  }
  const category = weighted.reduce((best, candidate) =>
    updated[candidate] > updated[best] ? candidate : best,
  );
  updated[category] -= totalWeight;

  return { category, current: updated };
}

export function redistributionCategory(
  available: ReadonlySet<QueueCategory>,
  oldestQueueAge: Partial<Record<QueueCategory, number>>,
): QueueCategory | null {
  const followUps = QUEUE_CATEGORIES.slice(1).filter((category) =>
    available.has(category),
  );
  if (followUps.length) {
    return followUps.reduce((oldest, category) =>
      (oldestQueueAge[category] ?? Infinity) <
      (oldestQueueAge[oldest] ?? Infinity)
        ? category
        : oldest,
    );
  }

  return available.has('initial') ? 'initial' : null;
}
