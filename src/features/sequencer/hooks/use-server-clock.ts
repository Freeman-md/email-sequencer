'use client';

import { useEffect, useState } from 'react';

export type ServerClockSample = { serverNow: string; receivedAt: number };

export function useServerClock(
  sample: ServerClockSample | null,
  initialServerNow?: string,
) {
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  if (!sample) return Date.parse(initialServerNow ?? '') || 0;

  return (
    Date.parse(sample.serverNow) +
    Math.max(0, (tick ?? sample.receivedAt) - sample.receivedAt)
  );
}
