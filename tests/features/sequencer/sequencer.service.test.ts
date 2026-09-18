import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SequencerRuntime } from '@/features/sequencer/server/runtime/sequencer-runtime';
import { SequencerService } from '@/features/sequencer/server/services/sequencer.service';

import type { Interaction } from '@/features/sequencer/server/types/interaction';
import type { SendResult } from '@/infrastructure/email/types/send-result';
import type { AttemptState } from '@/infrastructure/send-attempts/store';
import type { DraftCandidate } from '@/modules/outreach/interactions';

const startedAt = '2026-09-09T12:00:00.000Z';
const interaction: Interaction = {
  id: 'recFirst',
  prospect: 'Maya Chen',
  company: 'Northstar Labs',
  email: 'maya@example.com',
  subject: 'A clearer handoff',
  gmailThreadId: undefined,
  isFollowUp: false,
  message: 'Hello Maya,\nHere is the message.',
  createdAt: '2026-09-09T08:00:00.000Z',
  mailboxId: 'recMailboxA',
  mailboxEmail: 'operator@example.com',
};
const candidate: DraftCandidate = {
  id: interaction.id,
  type: 'Initial Message',
  gmailThreadId: '',
  gmailMessageId: '',
  status: 'Draft',
  direction: 'Outbound',
  channel: 'Email',
  prospectIds: ['recProspect'],
  subject: interaction.subject,
  message: interaction.message,
  createdAt: interaction.createdAt,
  sentAt: '',
  mailboxIds: [],
  initialInteractionIds: [],
};
const flush = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve();
};
function setup() {
  const findNextDraft = vi
    .fn()
    .mockResolvedValueOnce(candidate)
    .mockResolvedValue(null);
  const confirmSent = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn<() => Promise<SendResult>>().mockResolvedValue({
    kind: 'confirmed',
    gmailMessageId: 'gmail-id',
    gmailThreadId: 'thread-id',
    sentAt: '2026-09-09T12:00:01.000Z',
  });
  const check = vi.fn().mockResolvedValue(undefined);
  const findContactById = vi.fn().mockResolvedValue({
    id: 'recProspect',
    name: interaction.prospect,
    company: interaction.company,
    email: interaction.email,
  });
  const runtime = new SequencerRuntime();
  const mailbox = {
    id: 'recMailboxA',
    email: 'operator@example.com',
    connected: true,
    hasCredentials: true,
    detail: 'Available',
  };
  const mailboxes = {
    getState: vi.fn().mockResolvedValue({ mailboxes: [mailbox] }),
  };
  const state: AttemptState = {
    version: 1,
    pending: null,
    lastAllocatedMailboxId: null,
  };
  const attempts = {
    read: vi.fn(async () => structuredClone(state)),
    reserve: vi.fn(async (input, advance) => {
      if (state.pending) throw new Error('Unresolved attempt');
      state.pending = { ...input, id: 'attempt-test', reservedAt: startedAt };
      if (advance) state.lastAllocatedMailboxId = input.mailboxId;

      return state.pending!;
    }),
    confirm: vi.fn(async (_id, confirmation) => {
      state.pending!.confirmation = confirmation;
    }),
    resolve: vi.fn(async () => {
      state.pending = null;
    }),
  };
  const findById = vi.fn();

  return {
    state,
    findContactById,
    runtime,
    findNextDraft,
    confirmSent,
    send,
    check,
    attempts,
    mailboxes,
    findById,
    runner: new SequencerService(
      { findNextDraft, confirmSent, findById, checkConnection: vi.fn() },
      { findContactById, checkConnection: vi.fn() },
      { send },
      { requireReady: check, getState: vi.fn() },
      runtime,
      mailboxes,
      attempts,
    ),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(startedAt));
});

it('advances the persisted allocation cursor on reservation and skips unavailable accounts', async () => {
  const { runner, mailboxes, findNextDraft, send, attempts, state } = setup();
  mailboxes.getState.mockResolvedValue({
    mailboxes: [
      {
        id: 'recMailboxC',
        email: 'c@example.com',
        connected: true,
        hasCredentials: true,
        detail: 'Available',
      },
      {
        id: 'recMailboxB',
        email: 'b@example.com',
        connected: false,
        hasCredentials: true,
        detail: 'Unavailable',
      },
      {
        id: 'recMailboxA',
        email: 'operator@example.com',
        connected: true,
        hasCredentials: true,
        detail: 'Available',
      },
    ],
  });
  state.lastAllocatedMailboxId = 'recMailboxA';
  send.mockResolvedValue({ kind: 'definite', message: 'Rejected' });
  runner.start(1);
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ mailboxId: 'recMailboxC' }),
  );
  expect(attempts.reserve).toHaveBeenCalledWith(
    expect.objectContaining({ mailboxId: 'recMailboxC' }),
    true,
  );
  findNextDraft.mockResolvedValueOnce(candidate);
  runner.start(1);
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ mailboxId: 'recMailboxA' }),
  );
});

it('uses the root mailbox for follow-ups without advancing allocation', async () => {
  const {
    runner,
    mailboxes,
    findNextDraft,
    findById,
    send,
    attempts,
    state,
    confirmSent,
  } = setup();
  state.lastAllocatedMailboxId = 'recMailboxB';
  const draft = {
    ...candidate,
    type: 'Follow-up',
    gmailThreadId: 'thread-id',
    initialInteractionIds: ['recRoot'],
  };
  findNextDraft
    .mockReset()
    .mockResolvedValueOnce(draft)
    .mockResolvedValue(null);
  findById.mockResolvedValue({
    ...candidate,
    id: 'recRoot',
    status: 'Completed',
    gmailMessageId: 'original-id',
    gmailThreadId: 'thread-id',
    sentAt: startedAt,
    mailboxIds: ['recMailboxB'],
  });
  mailboxes.getState.mockResolvedValue({
    mailboxes: [
      {
        id: 'recMailboxA',
        email: 'a@example.com',
        connected: true,
        hasCredentials: true,
        detail: 'Available',
      },
      {
        id: 'recMailboxB',
        email: 'b@example.com',
        connected: true,
        hasCredentials: true,
        detail: 'Available',
      },
    ],
  });
  runner.start(1);
  await vi.runAllTimersAsync();
  expect(findById).toHaveBeenCalledWith('recRoot');
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ mailboxId: 'recMailboxB', isFollowUp: true }),
  );
  expect(attempts.reserve).toHaveBeenCalledWith(
    expect.objectContaining({ mailboxId: 'recMailboxB' }),
    false,
  );
  expect(confirmSent).toHaveBeenCalledWith(
    candidate.id,
    expect.objectContaining({ mailboxId: 'recMailboxB' }),
  );
  expect(state.lastAllocatedMailboxId).toBe('recMailboxB');
});

it.each([
  'missing-root',
  'multiple-roots',
  'self-root',
  'preassigned-sender',
  'unsupported-type',
])(
  'rejects an ambiguous outbound draft with %s without reserving or sending',
  async (failure) => {
    const { runner, findNextDraft, send, attempts, confirmSent } = setup();
    const draft = {
      ...candidate,
      type: 'Follow-up',
      gmailThreadId: 'thread-id',
      initialInteractionIds: ['recRoot'],
    };
    if (failure === 'missing-root') {
      draft.initialInteractionIds = [];
    }
    if (failure === 'multiple-roots') {
      draft.initialInteractionIds = ['recRoot', 'recOtherRoot'];
    }
    if (failure === 'self-root') {
      draft.initialInteractionIds = [candidate.id];
    }
    if (failure === 'preassigned-sender') {
      draft.mailboxIds = ['recMailboxA'];
    }
    if (failure === 'unsupported-type') {
      draft.type = 'Reply';
    }
    findNextDraft
      .mockReset()
      .mockResolvedValueOnce(draft)
      .mockResolvedValue(null);
    runner.start(1);
    await vi.runAllTimersAsync();
    expect(send).not.toHaveBeenCalled();
    expect(attempts.reserve).not.toHaveBeenCalled();
    expect(confirmSent).not.toHaveBeenCalled();
    expect(runner.snapshot().failureCount).toBe(1);
  },
);

it.each([
  'missing-owner',
  'conflicting-thread',
  'different-prospect',
  'unavailable-owner',
])('does not rotate a follow-up with %s', async (failure) => {
  const { runner, findNextDraft, findById, send, confirmSent, attempts } =
    setup();
  findNextDraft
    .mockReset()
    .mockResolvedValueOnce({
      ...candidate,
      type: 'Follow-up',
      gmailThreadId: 'thread-id',
      initialInteractionIds: ['recRoot'],
    })
    .mockResolvedValue(null);
  findById.mockResolvedValue({
    ...candidate,
    id: 'recRoot',
    status: 'Completed',
    gmailMessageId: 'original-id',
    gmailThreadId:
      failure === 'conflicting-thread' ? 'other-thread' : 'thread-id',
    sentAt: startedAt,
    prospectIds:
      failure === 'different-prospect' ? ['recOther'] : candidate.prospectIds,
    mailboxIds:
      failure === 'missing-owner'
        ? []
        : [failure === 'unavailable-owner' ? 'recDisconnected' : 'recMailboxA'],
  });
  runner.start(1);
  await vi.runAllTimersAsync();
  expect(send).not.toHaveBeenCalled();
  expect(confirmSent).not.toHaveBeenCalled();
  expect(attempts.reserve).not.toHaveBeenCalled();
  expect(runner.snapshot().failureCount).toBe(1);
});

it('stops before submission if there is no available sender or a reservation cannot be saved', async () => {
  const first = setup();
  first.mailboxes.getState.mockResolvedValue({ mailboxes: [] });
  first.runner.start(1);
  await flush();
  expect(first.send).not.toHaveBeenCalled();
  expect(first.runner.snapshot().errors[0]?.message).toContain(
    'No mailbox is available',
  );
  const second = setup();
  second.attempts.reserve.mockRejectedValue(
    new Error('Persistent storage unavailable'),
  );
  second.runner.start(1);
  await flush();
  expect(second.send).not.toHaveBeenCalled();
  expect(second.runner.snapshot().errors[0]?.message).toContain(
    'Persistent storage unavailable',
  );
});

it('blocks a new run on a durable unresolved attempt and requires particular-attempt reconciliation', async () => {
  const { runner, state, send, findNextDraft, findById } = setup();
  state.pending = {
    id: 'previous-attempt',
    interactionId: 'recPrevious',
    mailboxId: 'recMailboxA',
    mailboxEmail: 'a@example.com',
    reservedAt: startedAt,
    confirmation: {
      sentAt: startedAt,
      gmailMessageId: 'previous-message',
      gmailThreadId: 'previous-thread',
    },
  };
  runner.start(1);
  await flush();
  expect(send).not.toHaveBeenCalled();
  expect(findNextDraft).not.toHaveBeenCalled();
  await expect(runner.reconcile('wrong-attempt', 'sent')).rejects.toThrow(
    'no longer matches',
  );
  await expect(
    runner.reconcile('previous-attempt', 'not-sent'),
  ).rejects.toThrow('Gmail confirmed');
  findById.mockResolvedValue({ ...candidate, status: 'Draft' });
  await expect(runner.reconcile('previous-attempt', 'sent')).rejects.toThrow(
    'do not match',
  );
  findById.mockResolvedValue({
    ...candidate,
    status: 'Completed',
    mailboxIds: ['recMailboxA'],
    sentAt: startedAt,
    gmailMessageId: 'previous-message',
    gmailThreadId: 'previous-thread',
  });
  await runner.reconcile('previous-attempt', 'sent');
  expect(state.pending).toBeNull();
});

it('persists Gmail confirmation before Airtable and retains it on completion failure', async () => {
  const { runner, attempts, confirmSent, state, send } = setup();
  send.mockImplementation(async () => {
    expect(state.pending?.mailboxId).toBe('recMailboxA');

    return {
      kind: 'confirmed',
      gmailMessageId: 'message-id',
      gmailThreadId: 'thread-id',
      sentAt: startedAt,
    };
  });
  confirmSent.mockImplementation(async () => {
    expect(state.pending?.confirmation?.gmailMessageId).toBe('message-id');
    throw new Error('Synthetic Airtable outage');
  });
  runner.start(1);
  await flush();
  expect(attempts.resolve).not.toHaveBeenCalled();
  expect(state.pending?.confirmation?.gmailMessageId).toBe('message-id');
  expect(runner.snapshot().errors[0]?.message).toContain(
    'mailbox operator@example.com (recMailboxA)',
  );
});
afterEach(() => vi.useRealTimers());

describe('one-at-a-time run lifecycle', () => {
  it('fixes runStartedAt and waits the full interval before querying again', async () => {
    const { runner, findNextDraft, confirmSent, send } = setup();
    runner.start(300);
    await flush();
    expect(findNextDraft).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(interaction);
    expect(confirmSent).toHaveBeenCalledWith(interaction.id, {
      mailboxId: interaction.mailboxId,
      sentAt: '2026-09-09T12:00:01.000Z',
      gmailMessageId: 'gmail-id',
      gmailThreadId: 'thread-id',
    });
    expect(runner.snapshot()).toMatchObject({
      status: 'running',
      phase: 'waiting',
      sentCount: 1,
      runStartedAt: startedAt,
    });
    await vi.advanceTimersByTimeAsync(299_999);
    expect(findNextDraft).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(findNextDraft).toHaveBeenCalledTimes(2);
    expect(
      findNextDraft.mock.calls.every((call) => call[0] === startedAt),
    ).toBe(true);
    expect(runner.snapshot()).toMatchObject({
      status: 'completed',
      runStartedAt: startedAt,
    });
  });

  it('does not write Completed until Gmail confirms', async () => {
    const { runner, send, confirmSent } = setup();
    let resolveSend!: (result: SendResult) => void;
    send.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    runner.start(300);
    await flush();
    expect(confirmSent).not.toHaveBeenCalled();
    expect(runner.snapshot().phase).toBe('sending');
    resolveSend({
      kind: 'confirmed',
      gmailMessageId: 'gmail-id',
      gmailThreadId: 'thread-id',
      sentAt: startedAt,
    });
    await flush();
    expect(confirmSent).toHaveBeenCalledExactlyOnceWith(interaction.id, {
      mailboxId: interaction.mailboxId,
      sentAt: startedAt,
      gmailMessageId: 'gmail-id',
      gmailThreadId: 'thread-id',
    });
    runner.stop();
    await flush();
  });

  it('leaves definite failures untouched and excludes them for the rest of the run', async () => {
    const { runner, findNextDraft, send, confirmSent } = setup();
    findNextDraft.mockImplementation(async (_cutoff, excluded: Set<string>) =>
      excluded.has(interaction.id) ? null : candidate,
    );
    send.mockResolvedValue({ kind: 'definite', message: 'Rejected' });
    runner.start(1);
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(1);
    expect(confirmSent).not.toHaveBeenCalled();
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
    const { runner, send, findNextDraft, confirmSent } = setup();
    send.mockResolvedValue({ kind: 'uncertain', message: 'Timed out' });
    runner.start(300);
    await vi.runAllTimersAsync();
    expect(findNextDraft).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(confirmSent).not.toHaveBeenCalled();
    expect(runner.snapshot()).toMatchObject({
      status: 'error',
      current: { id: interaction.id },
      errors: [
        {
          kind: 'uncertain',
          message: expect.stringContaining('Timed out'),
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
    const { runner, confirmSent, findNextDraft } = setup();
    confirmSent.mockRejectedValue(new Error('Unavailable'));
    runner.start(1);
    await vi.runAllTimersAsync();
    expect(findNextDraft).toHaveBeenCalledTimes(1);
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
    const { runner, findNextDraft } = setup();
    runner.start(300);
    await flush();
    runner.stop();
    await vi.runAllTimersAsync();
    expect(findNextDraft).toHaveBeenCalledTimes(1);
    expect(runner.snapshot()).toMatchObject({
      status: 'idle',
      phase: 'stopped',
      nextSendAt: null,
    });
  });

  it('finishes an in-flight send when stopped, then releases the lock', async () => {
    const { runner, send, confirmSent, findNextDraft } = setup();
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
    finish({
      kind: 'confirmed',
      gmailMessageId: 'gmail-id',
      gmailThreadId: 'thread-id',
      sentAt: startedAt,
    });
    await flush();
    expect(confirmSent).toHaveBeenCalledTimes(1);
    expect(findNextDraft).toHaveBeenCalledTimes(1);
    expect(runner.isActive()).toBe(false);
  });

  it('refuses a record newer than the run cutoff', async () => {
    const { runner, findNextDraft, send } = setup();
    findNextDraft.mockReset().mockResolvedValue({
      ...candidate,
      createdAt: '2026-09-09T12:00:00.001Z',
    });
    runner.start(300);
    await flush();
    expect(send).not.toHaveBeenCalled();
    expect(runner.snapshot().status).toBe('error');
  });

  it('a new run has a new cutoff and can revisit prior definite failures', async () => {
    const { runner, findNextDraft, send } = setup();
    send.mockResolvedValue({ kind: 'definite', message: 'Rejected' });
    runner.start(1);
    await vi.runAllTimersAsync();
    vi.setSystemTime(new Date('2026-09-09T13:00:00.000Z'));
    findNextDraft.mockResolvedValueOnce(candidate);
    runner.start(1);
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(2);
    expect(runner.snapshot().runStartedAt).toBe('2026-09-09T13:00:00.000Z');
  });

  it('keeps missing-email candidates excluded after subsequent sends', async () => {
    const { runner, findNextDraft, findContactById, send } = setup();
    findNextDraft
      .mockReset()
      .mockResolvedValueOnce({ ...candidate, id: 'recNoEmail' })
      .mockResolvedValueOnce(candidate)
      .mockResolvedValue(null);
    findContactById.mockResolvedValueOnce({
      id: 'recProspect',
      name: '',
      company: '',
      email: '',
    });

    runner.start(1);
    await vi.runAllTimersAsync();

    expect(send).toHaveBeenCalledTimes(1);
    expect(findNextDraft.mock.calls[2]?.[1]).toEqual(
      new Set(['recNoEmail', candidate.id]),
    );
    expect(runner.snapshot().status).toBe('completed');
  });

  it('stops without sending if cancellation arrives during the Prospect read', async () => {
    const { runner, findContactById, send } = setup();
    let finish!: (value: unknown) => void;
    findContactById.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    runner.start(1);
    await flush();
    runner.stop();
    finish({
      id: 'recProspect',
      name: '',
      company: '',
      email: interaction.email,
    });
    await flush();

    expect(send).not.toHaveBeenCalled();
    expect(runner.isActive()).toBe(false);
  });

  it('does not choose an arbitrary recipient when multiple Prospects are linked', async () => {
    const { runner, findNextDraft, findContactById, send } = setup();
    findNextDraft
      .mockReset()
      .mockResolvedValue({ ...candidate, prospectIds: ['recOne', 'recTwo'] });

    runner.start(1);
    await flush();

    expect(findContactById).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(runner.snapshot().errors[0]?.message).toContain('exactly one');
  });

  it.each([0, -1, 1.5, NaN, Infinity, 86401])(
    'rejects invalid interval %s',
    (interval) => {
      expect(() => setup().runner.start(interval)).toThrow('Interval Seconds');
    },
  );
});

it('rechecks Do Not Contact for an existing draft and continues without sending or completing it', async () => {
  const { runner, findNextDraft, findContactById, send, confirmSent } = setup();
  findNextDraft
    .mockReset()
    .mockResolvedValueOnce(candidate)
    .mockResolvedValueOnce({ ...candidate, id: 'recAllowed' })
    .mockResolvedValue(null);
  findContactById.mockResolvedValueOnce({
    id: 'recProspect',
    name: 'Maya',
    company: 'Northstar',
    email: 'maya@example.com',
    doNotContact: true,
  });
  runner.start(1);
  await flush();
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'recAllowed' }),
  );
  expect(confirmSent).toHaveBeenCalledTimes(1);
  expect(confirmSent).toHaveBeenCalledWith('recAllowed', expect.anything());
  expect(runner.snapshot().errors).toContainEqual(
    expect.objectContaining({
      interactionId: candidate.id,
      message: expect.stringContaining('Do Not Contact'),
    }),
  );
  expect(findNextDraft.mock.calls[1]?.[1]).toEqual(new Set([candidate.id]));
  runner.stop();
  await flush();
});
