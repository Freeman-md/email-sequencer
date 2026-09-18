import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MailboxesService } from '@/features/mailboxes/server/service';
import { SequencerRuntime } from '@/features/sequencer/server/runtime/sequencer-runtime';
import { GmailAuthorization } from '@/infrastructure/gmail/authorization';
import { MailboxGmailService } from '@/infrastructure/gmail/mailbox-service';
import { MailboxTokenStore } from '@/infrastructure/gmail/mailbox-token-store';
import {
  writePrivateJson,
  readPrivateJson,
} from '@/infrastructure/storage/private-json-file';

import type { Mailbox } from '@/modules/outreach/mailboxes';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mailboxes-test-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function setup() {
  const records: Mailbox[] = [];
  const repository = {
    updateEmail: vi.fn(async (id: string, email: string) => {
      const record = records.find((mailbox) => mailbox.id === id)!;
      record.email = email;

      return record;
    }),
    list: vi.fn(async () => structuredClone(records)),
    create: vi.fn(async (identity: Omit<Mailbox, 'id'>) => {
      const record = { id: `recMailbox${records.length}`, ...identity };
      records.push(record);

      return record;
    }),
  };
  const client = {
    authorization: vi.fn().mockResolvedValue({
      url: 'https://example.test/oauth',
      verifier: 'synthetic-verifier',
    }),
    exchange: vi.fn().mockResolvedValue({
      email: 'a@example.com',
      googleSubject: 'subject-a',
      refreshToken: 'synthetic-refresh-a',
    }),
    accessToken: vi.fn().mockResolvedValue('synthetic-access'),
    verifiedRefreshIdentity: vi.fn().mockResolvedValue({
      email: 'legacy@example.com',
      googleSubject: 'legacy-subject',
    }),
    thread: vi.fn(),
    send: vi.fn(),
  };
  const tokens = new MailboxTokenStore(
    join(directory, 'credentials-v2.json'),
    join(directory, 'legacy.json'),
  );
  const runtime = new SequencerRuntime();
  const authorization = new GmailAuthorization(client);
  const service = new MailboxesService(
    repository,
    tokens,
    authorization,
    new MailboxGmailService(client, tokens),
    client,
    runtime,
  );
  async function connect(mailboxId?: string) {
    const { state } = await service.beginAuthorization(mailboxId);
    await service.completeAuthorization(state, state, 'synthetic-code');
  }

  return { service, tokens, runtime, records, repository, client, connect };
}

it('keeps independent credentials, prevents duplicates and restores the same disconnected identity', async () => {
  const { service, connect, client, tokens, records, repository } = setup();
  await service.getState();
  await connect();
  await connect();
  expect(repository.create).toHaveBeenCalledTimes(1);
  client.exchange.mockResolvedValue({
    email: 'b@example.com',
    googleSubject: 'subject-b',
    refreshToken: 'synthetic-refresh-b',
  });
  await connect();
  expect(
    (await service.getState()).mailboxes.map((mailbox) => mailbox.connected),
  ).toEqual([true, true]);
  await service.disconnect(records[0]!.id);
  expect(records).toHaveLength(2);
  expect(await tokens.read(records[0]!.id)).toBeNull();
  expect(await tokens.read(records[1]!.id)).not.toBeNull();
  client.exchange.mockResolvedValue({
    email: 'a@example.com',
    googleSubject: 'subject-a',
    refreshToken: 'synthetic-new-refresh',
  });
  await connect(records[0]!.id);
  expect(records).toHaveLength(2);
  expect((await service.getState()).mailboxes[0]!.connected).toBe(true);
  expect(
    (await stat(join(directory, 'credentials-v2.json'))).mode & 0o777,
  ).toBe(0o600);
  expect(JSON.stringify(await service.getState())).not.toContain('refresh');
});

it('binds reconnect to the intended verified subject and reuses refresh tokens only for that subject', async () => {
  const { connect, client, records, tokens } = setup();
  await connect();
  client.exchange.mockResolvedValue({
    email: 'a@example.com',
    googleSubject: 'subject-a',
  });
  await connect(records[0]!.id);
  expect((await tokens.read(records[0]!.id))?.refreshToken).toBe(
    'synthetic-refresh-a',
  );
  client.exchange.mockResolvedValue({
    email: 'a@example.com',
    googleSubject: 'different-subject',
  });
  await expect(connect(records[0]!.id)).rejects.toThrow('different account');
  await expect(connect()).rejects.toThrow('offline access');
  expect(records).toHaveLength(1);
  expect((await tokens.read(records[0]!.id))?.googleSubject).toBe('subject-a');
});

it('serializes credential mutations without losing independent connections', async () => {
  const { tokens } = setup();
  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      tokens.write(`recMailbox${index}`, {
        email: `mailbox${index}@example.com`,
        googleSubject: `subject-${index}`,
        refreshToken: `synthetic-${index}`,
      }),
    ),
  );
  await Promise.all([
    tokens.remove('recMailbox0'),
    tokens.write('recMailbox1', {
      email: 'mailbox1@example.com',
      googleSubject: 'subject-1',
      refreshToken: 'synthetic-updated',
    }),
  ]);
  expect(await tokens.read('recMailbox0')).toBeNull();
  for (let index = 1; index < 12; index++) {
    expect(await tokens.read(`recMailbox${index}`)).not.toBeNull();
  }
});

it('blocks conflicting email metadata instead of displaying or sending as the wrong account', async () => {
  const { service, connect, records } = setup();
  await service.getState();
  await connect();
  records[0]!.email = 'wrong@example.com';
  expect((await service.getState()).mailboxes[0]).toMatchObject({
    connected: false,
    hasCredentials: true,
  });
  await connect(records[0]!.id);
  expect(records[0]!.email).toBe('a@example.com');
  expect((await service.getState()).mailboxes[0]!.connected).toBe(true);
});

it('uses only the selected mailbox credentials for Gmail sending and thread checks', async () => {
  const { service, connect, client, tokens } = setup();
  await service.getState();
  await connect();
  client.exchange.mockResolvedValue({
    email: 'b@example.com',
    googleSubject: 'subject-b',
    refreshToken: 'synthetic-refresh-b',
  });
  await connect();
  client.accessToken.mockClear();
  client.thread.mockResolvedValue({
    id: 'thread-b',
    messages: [
      {
        id: 'original-message-b',
        threadId: 'thread-b',
        labelIds: ['SENT'],
        internalDate: '1788254400000',
        payload: {
          headers: [
            { name: 'From', value: 'b@example.com' },
            { name: 'To', value: 'recipient@example.com' },
            { name: 'Subject', value: 'Original subject' },
            { name: 'Message-ID', value: '<original@example.com>' },
          ],
        },
      },
    ],
  });
  client.send.mockResolvedValue({
    kind: 'confirmed',
    sentAt: '2026-09-18T12:00:00.000Z',
    gmailMessageId: 'follow-up-b',
    gmailThreadId: 'thread-b',
  });
  const gateway = new MailboxGmailService(client, tokens);
  const draft = {
    email: 'recipient@example.com',
    subject: 'Original subject',
    message: 'Follow-up',
    isFollowUp: true,
    gmailThreadId: 'thread-b',
    gmailOriginalMessageId: 'original-message-b',
  };
  expect(
    (await gateway.send({ ...draft, mailboxId: 'recMailbox0' })).kind,
  ).toBe('definite');
  expect(client.send).not.toHaveBeenCalled();
  expect(
    (await gateway.send({ ...draft, mailboxId: 'recMailbox1' })).kind,
  ).toBe('confirmed');
  expect(client.accessToken).toHaveBeenLastCalledWith('synthetic-refresh-b');
  expect(client.send).toHaveBeenCalledTimes(1);
});

it('excludes connection starts, disconnects and completed callbacks while a run is active', async () => {
  const { service, client, runtime, connect, records } = setup();
  await connect();
  const pending = await service.beginAuthorization(records[0]!.id);
  runtime.begin(1);
  await expect(service.beginAuthorization()).rejects.toThrow('Stop the run');
  await expect(service.disconnect(records[0]!.id)).rejects.toThrow(
    'Stop the run',
  );
  await expect(
    service.completeAuthorization(
      pending.state,
      pending.state,
      'synthetic-code',
    ),
  ).rejects.toThrow('Stop the run');
  expect(client.exchange).toHaveBeenCalledTimes(1);
  runtime.stop();
  runtime.finish();
  await service.completeAuthorization(
    pending.state,
    pending.state,
    'synthetic-code',
  );
  expect(client.exchange).toHaveBeenCalledTimes(2);
});

it('holds the shared lock during callback persistence and releases it on failure', async () => {
  const { service, runtime, client } = setup();
  const { state } = await service.beginAuthorization();
  let fail!: (error: Error) => void;
  client.exchange.mockReturnValue(
    new Promise((_resolve, reject) => {
      fail = reject;
    }),
  );
  const callback = service.completeAuthorization(
    state,
    state,
    'synthetic-code',
  );
  const failure = expect(callback).rejects.toThrow('authorization failed');
  expect(() => runtime.begin(1)).toThrow('being updated');
  await expect(service.beginAuthorization()).rejects.toThrow('Stop the run');
  fail(new Error('synthetic provider error'));
  await failure;
  expect(() => runtime.begin(1)).not.toThrow();
  runtime.stop();
  runtime.finish();
});

it('checks arbitrarily many accounts with bounded concurrency and independent provider failures', async () => {
  const { service, records, tokens, client } = setup();
  await service.getState();
  for (let index = 0; index < 11; index++) {
    const record = {
      id: `recMailbox${index}`,
      email: `mailbox${index}@example.com`,
      googleSubject: `subject-${index}`,
    };
    records.push(record);
    await tokens.write(record.id, {
      ...record,
      refreshToken: `synthetic-${index}`,
    });
  }
  let active = 0;
  let maximum = 0;
  client.accessToken.mockImplementation(async (refresh: string) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    if (refresh === 'synthetic-3') throw new Error('synthetic unavailable');

    return 'synthetic-access';
  });
  const [state] = await Promise.all([service.getState(), service.getState()]);
  expect(maximum).toBeLessThanOrEqual(4);
  expect(state.mailboxes.filter((mailbox) => mailbox.connected)).toHaveLength(
    10,
  );
  expect(
    state.mailboxes.find((mailbox) => mailbox.id === 'recMailbox3'),
  ).toMatchObject({ connected: false, hasCredentials: true });
});

it.each([false, true])(
  'migrates through verified identity without altering the legacy file (unverifiable: %s)',
  async (unverifiable) => {
    const { service, client, records, tokens } = setup();
    const legacy = {
      email: 'legacy@example.com',
      refreshToken: 'synthetic-legacy',
    };
    await writePrivateJson(join(directory, 'legacy.json'), legacy);
    if (unverifiable)
      client.verifiedRefreshIdentity.mockRejectedValue(
        new Error('No verified identity'),
      );
    const state = await service.getState();
    expect(await readPrivateJson(join(directory, 'legacy.json'))).toEqual(
      legacy,
    );
    expect(records).toHaveLength(unverifiable ? 0 : 1);
    expect(await tokens.migrationState()).toBe(
      unverifiable ? 'reconnect-required' : 'migrated',
    );
    if (unverifiable) {
      expect(state.migrationNotice).toContain('Add that account again');
    } else {
      await service.disconnect(records[0]!.id);
      await service.getState();
      expect(await tokens.read(records[0]!.id)).toBeNull();
      expect(client.verifiedRefreshIdentity).toHaveBeenCalledTimes(1);
    }
  },
);
