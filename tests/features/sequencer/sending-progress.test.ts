import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { emptyCategoryCounts } from '@/features/sequencer/server/policies/fair-queue';
import { MailboxPacing } from '@/features/sequencer/server/services/mailbox-pacing';
import { FileSendingProgressStore } from '@/infrastructure/sending-progress/store';

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'sending-progress-'));
  path = join(directory, 'progress.json');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('survives restart and counts a confirmed attempt exactly once', async () => {
  const first = new FileSendingProgressStore(path);
  await first.prepareDay('schedule:Europe/London:2026-09-21', {
    initial: 2,
    followUp1: 1,
    followUp2: 0,
    followUp3: 0,
  });
  await first.advance('initial', {
    initial: -1,
    followUp1: 1,
    followUp2: 0,
    followUp3: 0,
  });

  const restarted = new FileSendingProgressStore(path);
  const confirmation = {
    attemptId: 'attempt-one',
    dayKey: 'schedule:Europe/London:2026-09-21',
    category: 'initial' as const,
    mailboxId: 'recMailbox',
    sentAt: '2026-09-21T09:00:00.000Z',
  };
  await restarted.recordConfirmed(confirmation);
  await restarted.recordConfirmed(confirmation);

  const state = await restarted.read();
  expect(state.day?.confirmed).toEqual({
    ...emptyCategoryCounts(),
    initial: 1,
  });
  expect(state.day?.current.initial).toBe(-1);
  expect(state.mailboxLastConfirmedAt.recMailbox).toBe(confirmation.sentAt);
});

it('refreshes same-day remaining demand without erasing confirmed progress', async () => {
  const store = new FileSendingProgressStore(path);
  await store.prepareDay('day', {
    initial: 2,
    followUp1: 0,
    followUp2: 0,
    followUp3: 0,
  });
  await store.recordConfirmed({
    attemptId: 'attempt-one',
    dayKey: 'day',
    category: 'initial',
    mailboxId: 'mailbox',
    sentAt: '2026-09-21T09:00:00.000Z',
  });
  await store.prepareDay('day', {
    initial: 1,
    followUp1: 1,
    followUp2: 0,
    followUp3: 0,
  });

  expect((await store.read()).day).toMatchObject({
    allocation: { initial: 2, followUp1: 1 },
    confirmed: { initial: 1 },
  });
});

it('starts a clean allocation for a new schedule-local day', async () => {
  const store = new FileSendingProgressStore(path);
  await store.prepareDay('schedule:Asia/Tokyo:2026-09-21', {
    initial: 3,
    followUp1: 0,
    followUp2: 0,
    followUp3: 0,
  });
  await store.recordConfirmed({
    attemptId: 'attempt-old-day',
    dayKey: 'schedule:Asia/Tokyo:2026-09-21',
    category: 'initial',
    mailboxId: 'mailbox',
    sentAt: '2026-09-21T14:59:00.000Z',
  });
  await store.prepareDay('schedule:Asia/Tokyo:2026-09-22', {
    initial: 1,
    followUp1: 1,
    followUp2: 0,
    followUp3: 0,
  });

  expect((await store.read()).day).toMatchObject({
    key: 'schedule:Asia/Tokyo:2026-09-22',
    allocation: { initial: 1, followUp1: 1 },
    confirmed: emptyCategoryCounts(),
  });
});

it('restores the global interval from durable confirmation after restart', async () => {
  const sentAt = '2026-09-21T09:00:00.000Z';
  const first = new FileSendingProgressStore(path);
  await first.prepareDay('day', {
    initial: 1,
    followUp1: 0,
    followUp2: 0,
    followUp3: 0,
  });
  await first.recordConfirmed({
    attemptId: 'attempt-one',
    dayKey: 'day',
    category: 'initial',
    mailboxId: 'mailbox',
    sentAt,
  });
  const restarted = new FileSendingProgressStore(path);
  const pacing = new MailboxPacing(
    {
      read: async () => ({
        version: 1,
        pending: null,
        lastAllocatedMailboxId: null,
      }),
      reserve: async () => {
        throw new Error('Not used');
      },
      confirm: async () => undefined,
      resolve: async () => undefined,
    },
    restarted,
    () => new Date('2026-09-21T09:01:00.000Z'),
  );

  await expect(pacing.globalReadyAt(180)).resolves.toBe(
    Date.parse('2026-09-21T09:03:00.000Z'),
  );
});
