import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRunner } from '@/features/sequencer/server/services/runner';
import type { Interaction } from '@/features/sequencer/types';
import type { SendResult } from '@/infrastructure/gmail/send';

const startedAt = '2026-09-09T12:00:00.000Z';
const interaction: Interaction = {
  id: 'recFirst',
  prospect: 'Maya Chen',
  company: 'Northstar Labs',
  email: 'maya@example.com',
  subject: 'A clearer handoff',
  message: 'Hello Maya,\nHere is the message.',
  createdAt: '2026-09-09T08:00:00.000Z',
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function setup() {
  const next = vi
    .fn()
    .mockResolvedValueOnce(interaction)
    .mockResolvedValue(null);
  const complete = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn<() => Promise<SendResult>>().mockResolvedValue({
    kind: 'confirmed',
    sentAt: '2026-09-09T12:00:01.000Z',
  });
  const check = vi.fn().mockResolvedValue(undefined);
  return {
    next,
    complete,
    send,
    check,
    runner: createRunner({ next, complete, send, check }),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(startedAt));
});
afterEach(() => vi.useRealTimers());

describe('one-at-a-time run lifecycle', () => {
  it('fixes runStartedAt and waits the full interval before querying again', async () => {
    const { runner, next, complete, send } = setup();
    runner.start(300);
    await flush();
    expect(next).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(interaction);
    expect(complete).toHaveBeenCalledWith(
      interaction.id,
      '2026-09-09T12:00:01.000Z',
    );
    expect(runner.snapshot()).toMatchObject({
      status: 'running',
      phase: 'waiting',
      sentCount: 1,
      runStartedAt: startedAt,
    });
    await vi.advanceTimersByTimeAsync(299_999);
    expect(next).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls.every((call) => call[0] === startedAt)).toBe(true);
    expect(runner.snapshot()).toMatchObject({
      status: 'completed',
      runStartedAt: startedAt,
    });
  });
  it('does not write Completed until Gmail confirms', async () => {
    const { runner, send, complete } = setup();
    let resolveSend!: (result: SendResult) => void;
    send.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    runner.start(300);
    await flush();
    expect(complete).not.toHaveBeenCalled();
    expect(runner.snapshot().phase).toBe('sending');
    resolveSend({ kind: 'confirmed', sentAt: startedAt });
    await flush();
    expect(complete).toHaveBeenCalledExactlyOnceWith(interaction.id, startedAt);
    runner.stop();
    await flush();
  });
  it('leaves definite failures untouched and excludes them for the rest of the run', async () => {
    const { runner, next, send, complete } = setup();
    next.mockImplementation(async (_cutoff, excluded: Set<string>) =>
      excluded.has(interaction.id) ? null : interaction,
    );
    send.mockResolvedValue({ kind: 'definite', message: 'Rejected' });
    runner.start(1);
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
    expect(runner.snapshot()).toMatchObject({
      status: 'completed',
      sentCount: 0,
      failureCount: 1,
    });
    expect(runner.snapshot().errors[0]).toMatchObject({
      kind: 'definite',
      interactionId: interaction.id,
    });
  });
  it('stops on an uncertain outcome without a retry or write', async () => {
    const { runner, send, next, complete } = setup();
    send.mockResolvedValue({ kind: 'uncertain', message: 'Timed out' });
    runner.start(300);
    await vi.runAllTimersAsync();
    expect(next).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
    expect(runner.snapshot()).toMatchObject({
      status: 'error',
      current: { id: interaction.id },
      errors: [
        {
          kind: 'uncertain',
          message: 'Timed out',
          interactionId: interaction.id,
        },
      ],
    });
  });
  it('treats an unexpected send exception as uncertain', async () => {
    const { runner, send } = setup();
    send.mockRejectedValue(new Error('Unexpected'));
    runner.start(1);
    await flush();
    expect(runner.snapshot().errors[0]?.kind).toBe('uncertain');
  });
  it('stops for reconciliation if Gmail succeeds but Airtable write fails', async () => {
    const { runner, complete, next } = setup();
    complete.mockRejectedValue(new Error('Unavailable'));
    runner.start(1);
    await vi.runAllTimersAsync();
    expect(next).toHaveBeenCalledTimes(1);
    expect(runner.snapshot()).toMatchObject({
      status: 'error',
      sentCount: 1,
      lastSent: { id: interaction.id },
    });
    expect(runner.snapshot().errors[0]?.kind).toBe('reconciliation');
  });
  it('locks before connection checks resolve, and returns immediately', async () => {
    const { runner, check } = setup();
    let finish!: () => void;
    check.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    expect(runner.start(300).status).toBe('running');
    expect(() => runner.start(300)).toThrow('already active');
    runner.stop();
    finish();
    await flush();
    expect(runner.isActive()).toBe(false);
  });
  it('cancels the interval without fetching another record', async () => {
    const { runner, next } = setup();
    runner.start(300);
    await flush();
    runner.stop();
    await vi.runAllTimersAsync();
    expect(next).toHaveBeenCalledTimes(1);
    expect(runner.snapshot()).toMatchObject({
      status: 'idle',
      phase: 'stopped',
      nextSendAt: null,
    });
  });
  it('finishes an in-flight send when stopped, then releases the lock', async () => {
    const { runner, send, complete, next } = setup();
    let finish!: (result: SendResult) => void;
    send.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    runner.start(300);
    await flush();
    runner.stop();
    expect(() => runner.start(300)).toThrow('already active');
    finish({ kind: 'confirmed', sentAt: startedAt });
    await flush();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(runner.isActive()).toBe(false);
  });
  it('refuses a record newer than the run cutoff', async () => {
    const { runner, next, send } = setup();
    next.mockReset().mockResolvedValue({
      ...interaction,
      createdAt: '2026-09-09T12:00:00.001Z',
    });
    runner.start(300);
    await flush();
    expect(send).not.toHaveBeenCalled();
    expect(runner.snapshot().status).toBe('error');
  });
  it('a new run has a new cutoff and can revisit prior definite failures', async () => {
    const { runner, next, send } = setup();
    send.mockResolvedValue({ kind: 'definite', message: 'Rejected' });
    runner.start(1);
    await vi.runAllTimersAsync();
    vi.setSystemTime(new Date('2026-09-09T13:00:00.000Z'));
    next.mockResolvedValueOnce(interaction);
    runner.start(1);
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(2);
    expect(runner.snapshot().runStartedAt).toBe('2026-09-09T13:00:00.000Z');
  });
  it.each([0, -1, 1.5, NaN, Infinity, 86401])(
    'rejects invalid interval %s',
    (interval) => {
      expect(() => setup().runner.start(interval)).toThrow('Interval Seconds');
    },
  );
});
