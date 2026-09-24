import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SequencerRuntime } from '@/features/sequencer/server/runtime/sequencer-runtime';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T09:00:00.000Z'));
});

afterEach(() => vi.useRealTimers());

it('waits interruptibly for cooldown and never waits beyond window close', async () => {
  const runtime = new SequencerRuntime();
  runtime.begin(180);
  const waiting = runtime.waitUntil(
    new Date('2026-09-21T09:12:00.000Z'),
    new Date('2026-09-21T09:05:00.000Z'),
  );
  expect(runtime.snapshot().nextSendAt).toBe('2026-09-21T09:05:00.000Z');

  runtime.stop();
  await waiting;
  expect(runtime.snapshot().nextSendAt).toBeNull();
});
