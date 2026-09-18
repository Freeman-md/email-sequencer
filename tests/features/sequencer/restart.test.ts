import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SequencerRuntime } from '@/features/sequencer/server/runtime/sequencer-runtime';
import { SequencerService } from '@/features/sequencer/server/services/sequencer.service';
import { FileSendAttemptStore } from '@/infrastructure/send-attempts/store';
import { NEW_SCHEDULE_DEFAULTS, WEEKDAYS } from '@/modules/outreach/schedules';

import type { SendResult } from '@/infrastructure/email/types/send-result';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'sequencer-restart-test-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const candidate = {
  id: 'recInitial',
  type: 'Initial Message',
  status: 'Draft',
  direction: 'Outbound',
  channel: 'Email',
  prospectIds: ['recProspect'],
  subject: 'Hello',
  message: 'Synthetic message',
  createdAt: '2026-01-01T12:00:00.000Z',
  gmailMessageId: '',
  sentAt: '',
  gmailThreadId: '',
  mailboxIds: [],
  initialInteractionIds: [],
};
const confirmed: SendResult = {
  kind: 'confirmed',
  sentAt: '2026-09-18T12:00:00.000Z',
  gmailMessageId: 'message-id',
  gmailThreadId: 'thread-id',
};

function setup(result: SendResult, persistenceFailure = false) {
  const attempts = new FileSendAttemptStore(join(directory, 'attempts.json'));
  const interactions = {
    findNextDraft: vi
      .fn()
      .mockResolvedValueOnce(candidate)
      .mockResolvedValue(null),
    findById: vi.fn(),
    confirmSent: vi.fn(),
    checkConnection: vi.fn(),
  };
  if (persistenceFailure) {
    interactions.confirmSent.mockRejectedValue(
      new Error('Synthetic completion failure'),
    );
  }
  const send = vi.fn();
  const mailboxes = {
    getState: vi.fn().mockResolvedValue({
      mailboxes: [
        {
          id: 'recMailboxB',
          email: 'b@example.com',
          connected: true,
          hasCredentials: true,
          detail: 'Available',
        },
        {
          id: 'recMailboxA',
          email: 'a@example.com',
          connected: true,
          hasCredentials: true,
          detail: 'Available',
        },
      ],
    }),
  };
  const runner = new SequencerService(
    interactions,
    {
      findContactById: vi.fn().mockResolvedValue({
        id: 'recProspect',
        email: 'recipient@example.com',
        name: 'Recipient',
        company: 'Example',
        doNotContact: false,
      }),
      checkConnection: vi.fn(),
    },
    { send },
    { requireReady: vi.fn(), getState: vi.fn() },
    new SequencerRuntime(),
    mailboxes,
    attempts,
    {
      capture: vi.fn().mockResolvedValue({
        ...NEW_SCHEDULE_DEFAULTS,
        name: 'Synthetic',
        days: [...WEEKDAYS],
        opensAt: '00:00',
        closesAt: '23:59',
        id: 'recSchedule',
        selected: true,
        automaticSending: false,
        lastTriggerKey: '',
        intervalSeconds: 1,
      }),
      verify: vi.fn(),
      status: vi.fn(),
      claim: vi.fn(),
    },
  );
  send.mockImplementation(async () => {
    runner.stop();

    return result;
  });

  return { runner, attempts, interactions, send };
}

it.each(['unknown', 'completion-failure', 'resolution-failure'])(
  'blocks a restarted runner after %s, without even fetching the queue',
  async (failure) => {
    const first = setup(
      failure === 'unknown'
        ? { kind: 'uncertain', message: 'Synthetic network loss' }
        : confirmed,
      failure === 'completion-failure',
    );
    if (failure === 'resolution-failure') {
      vi.spyOn(first.attempts, 'resolve').mockRejectedValue(
        new Error('Synthetic journal failure'),
      );
    }
    first.runner.start();
    await vi.waitFor(() => expect(first.runner.isActive()).toBe(false));
    const pending = (await first.attempts.read()).pending!;
    expect(pending.mailboxId).toBe('recMailboxA');
    if (failure !== 'unknown') {
      expect(pending.confirmation?.gmailMessageId).toBe('message-id');
    }
    const restarted = setup(confirmed);
    restarted.runner.start();
    await vi.waitFor(() => expect(restarted.runner.isActive()).toBe(false));
    expect(restarted.send).not.toHaveBeenCalled();
    expect(restarted.interactions.findNextDraft).not.toHaveBeenCalled();
    expect(restarted.runner.snapshot().errors[0]?.message).toContain(
      'a@example.com (recMailboxA)',
    );
    expect((await restarted.attempts.read()).pending?.id).toBe(pending.id);
  },
);

it('keeps short runs fair across a recreated runner and finishes a stopped send before clearing its reservation', async () => {
  const first = setup(confirmed);
  first.runner.start();
  await vi.waitFor(() => expect(first.runner.isActive()).toBe(false));
  expect(first.interactions.confirmSent).toHaveBeenCalledWith(
    candidate.id,
    expect.objectContaining({ mailboxId: 'recMailboxA' }),
  );
  expect((await first.attempts.read()).pending).toBeNull();
  const restarted = setup(confirmed);
  restarted.runner.start();
  await vi.waitFor(() => expect(restarted.runner.isActive()).toBe(false));
  expect(restarted.send).toHaveBeenCalledWith(
    expect.objectContaining({ mailboxId: 'recMailboxB' }),
  );
  expect((await restarted.attempts.read()).lastAllocatedMailboxId).toBe(
    'recMailboxB',
  );
});
