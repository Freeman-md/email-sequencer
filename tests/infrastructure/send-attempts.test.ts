import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  FileSendAttemptStore,
  reconciliationGuidance,
} from '@/infrastructure/send-attempts/store';
import * as storage from '@/infrastructure/storage/private-json-file';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'send-attempts-test-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
const input = {
  interactionId: 'recInteraction',
  mailboxId: 'recMailboxA',
  mailboxEmail: 'a@example.com',
};
const confirmation = {
  sentAt: '2026-09-18T12:00:00.000Z',
  gmailMessageId: 'message-id',
  gmailThreadId: 'thread-id',
};

it('retains pending reservations and the allocation cursor across restarts, rejecting resubmission', async () => {
  const path = join(directory, 'attempts.json');
  const first = new FileSendAttemptStore(path);
  const pending = await first.reserve(input, true);
  const restarted = new FileSendAttemptStore(path);
  expect(await restarted.read()).toMatchObject({
    pending,
    lastAllocatedMailboxId: input.mailboxId,
  });
  await expect(
    restarted.reserve({ ...input, mailboxId: 'recMailboxB' }, true),
  ).rejects.toThrow('Unresolved send attempt');
  await restarted.confirm(pending.id, confirmation);
  const confirmed = (await new FileSendAttemptStore(path).read()).pending!;
  expect(reconciliationGuidance(confirmed)).toContain('Message ID message-id');
  expect(reconciliationGuidance(confirmed)).toContain(
    'a@example.com (recMailboxA)',
  );
  await expect(restarted.resolve('stale-attempt')).rejects.toThrow(
    'identity changed',
  );
  await restarted.resolve(pending.id);
  expect((await restarted.read()).pending).toBeNull();
  await restarted.reserve({ ...input, mailboxId: 'recMailboxB' }, false);
  expect((await restarted.read()).lastAllocatedMailboxId).toBe('recMailboxA');
  expect((await stat(path)).mode & 0o777).toBe(0o600);
});

it('fails a reservation without creating permission to send when storage cannot be written', async () => {
  const store = new FileSendAttemptStore(join(directory, 'attempts.json'));
  vi.spyOn(storage, 'writePrivateJson').mockRejectedValueOnce(
    new Error('Synthetic disk full'),
  );
  await expect(store.reserve(input, true)).rejects.toThrow(
    'Synthetic disk full',
  );
  expect((await store.read()).pending).toBeNull();
});
