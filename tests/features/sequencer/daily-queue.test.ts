import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyCategoryCounts } from '@/features/sequencer/server/policies/fair-queue';
import { DailyQueue } from '@/features/sequencer/server/services/daily-queue';
import { MailboxPacing } from '@/features/sequencer/server/services/mailbox-pacing';
import { NEW_SCHEDULE_DEFAULTS } from '@/modules/outreach/schedules';

import type {
  DraftCandidate,
  HistoryInteraction,
} from '@/modules/outreach/interactions';

const now = new Date('2026-09-21T09:00:00.000Z');
const schedule = {
  ...NEW_SCHEDULE_DEFAULTS,
  id: 'recSchedule',
  name: 'Queue test',
  selected: true,
  automaticSending: false,
  lastTriggerKey: '',
  intervalSeconds: 180,
};
const prospect = {
  id: 'recProspect',
  name: 'Prospect',
  email: 'prospect@example.com',
  company: 'Example',
  doNotContact: false,
  role: '',
  campaignIds: ['recCampaign'],
  interactionIds: ['recRoot', 'recFollowUp1', 'recDraft'],
  signal: '',
  sources: '',
  qualificationNotes: '',
};
const initialDraft = (id: string, createdAt: string): DraftCandidate => ({
  id,
  type: 'Initial Message',
  status: 'Draft',
  direction: 'Outbound',
  channel: 'Email',
  subject: 'Subject',
  message: 'Message',
  prospectIds: [prospect.id],
  createdAt,
  sentAt: '',
  gmailMessageId: '',
  gmailThreadId: '',
  mailboxIds: [],
  initialInteractionIds: [],
});
const root: HistoryInteraction = {
  ...initialDraft('recRoot', '2026-09-01T08:00:00Z'),
  status: 'Completed',
  sentAt: '2026-09-01T09:00:00Z',
  gmailMessageId: 'message-root',
  gmailThreadId: 'thread-root',
  mailboxIds: ['recMailboxA'],
  receivedAt: '',
};
const firstFollowUp: HistoryInteraction = {
  ...root,
  id: 'recFollowUp1',
  type: 'Follow-up 1',
  sentAt: '2026-09-05T09:00:00Z',
  gmailMessageId: 'message-follow-up-1',
  initialInteractionIds: [root.id],
};
const secondFollowUpDraft: DraftCandidate = {
  ...initialDraft('recDraft', '2026-09-10T09:00:00Z'),
  type: 'Follow-up 2',
  gmailThreadId: root.gmailThreadId,
  initialInteractionIds: [root.id],
};

function setup(
  drafts: DraftCandidate[] = [initialDraft('recB', '2026-09-10T09:00:00Z')],
) {
  const state = {
    version: 1 as const,
    day: null as null | {
      key: string;
      allocation: ReturnType<typeof emptyCategoryCounts>;
      confirmed: ReturnType<typeof emptyCategoryCounts>;
      current: ReturnType<typeof emptyCategoryCounts>;
    },
    mailboxLastConfirmedAt: {} as Record<string, string>,
    accountedAttemptIds: [] as string[],
  };
  const progress = {
    read: vi.fn(async () => structuredClone(state)),
    prepareDay: vi.fn(async (key, allocation) => {
      state.day = {
        key,
        allocation,
        confirmed: emptyCategoryCounts(),
        current: emptyCategoryCounts(),
      };

      return structuredClone(state);
    }),
    advance: vi.fn(async (_category, current) => {
      state.day!.current = current;
    }),
    recordConfirmed: vi.fn(),
  };
  const interactions = {
    listDrafts: vi.fn().mockResolvedValue(drafts),
    findHistoryByIds: vi
      .fn()
      .mockResolvedValue([root, firstFollowUp, secondFollowUpDraft]),
    findNextDraft: vi.fn(),
    findDraftById: vi.fn(async (id: string) => {
      const draft = drafts.find((item) => item.id === id);

      return draft ?? null;
    }),
    findById: vi.fn(),
    confirmSent: vi.fn(),
    checkConnection: vi.fn(),
  };
  const mailboxes = {
    getState: vi.fn().mockResolvedValue({
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
    }),
  };
  const attempts = {
    read: vi.fn().mockResolvedValue({
      version: 1,
      pending: null,
      lastAllocatedMailboxId: null,
    }),
    reserve: vi.fn(),
    confirm: vi.fn(),
    resolve: vi.fn(),
  };
  const pacing = new MailboxPacing(attempts, progress, () => now);
  const prospects = {
    findQueueContextById: vi.fn().mockResolvedValue(prospect),
  };
  const queue = new DailyQueue(
    interactions,
    prospects,
    mailboxes,
    pacing,
    progress,
    () => now,
  );

  return { queue, state, interactions, prospects, progress, attempts };
}

describe('daily sending queue', () => {
  beforeEach(() => vi.useRealTimers());

  it('uses oldest Created At with stable record-ID tie breaking', async () => {
    const { queue } = setup([
      initialDraft('recB', '2026-09-10T09:00:00Z'),
      initialDraft('recC', '2026-09-09T09:00:00Z'),
      initialDraft('recA', '2026-09-10T09:00:00Z'),
    ]);
    await queue.prepare(schedule, now.toISOString());

    expect(((await queue.next()) as { draft: { id: string } }).draft.id).toBe(
      'recC',
    );
    expect(((await queue.next()) as { draft: { id: string } }).draft.id).toBe(
      'recA',
    );
  });

  it('uses numbered follow-up affinity and waits for its owner cooldown', async () => {
    const { queue, state } = setup([secondFollowUpDraft]);
    state.mailboxLastConfirmedAt.recMailboxA = new Date(
      now.getTime() - 60_000,
    ).toISOString();
    await queue.prepare(schedule, now.toISOString());

    const waiting = await queue.next();
    expect(waiting).toEqual({
      waitUntil: new Date(now.getTime() + 120_000),
    });
  });

  it('skips a cooling initial sender and rotates to another ready mailbox', async () => {
    const { queue, state } = setup();
    state.mailboxLastConfirmedAt.recMailboxA = new Date(
      now.getTime() - 300_000,
    ).toISOString();
    await queue.prepare(schedule, now.toISOString());

    const selection = await queue.next();
    expect(selection).toMatchObject({ mailbox: { id: 'recMailboxB' } });
  });

  it('waits for the earliest mailbox when every initial sender is cooling down', async () => {
    const { queue, state } = setup();
    state.mailboxLastConfirmedAt.recMailboxA = new Date(
      now.getTime() - 300_000,
    ).toISOString();
    state.mailboxLastConfirmedAt.recMailboxB = new Date(
      now.getTime() - 360_000,
    ).toISOString();
    await queue.prepare(schedule, now.toISOString());

    expect(await queue.next()).toEqual({
      waitUntil: new Date(now.getTime() + 360_000),
    });
  });

  it('excludes future-cutoff drafts and reports conflicting numbered history', async () => {
    const future = initialDraft('recFuture', '2026-09-21T10:00:00Z');
    const generic = {
      ...secondFollowUpDraft,
      id: 'recGeneric',
      type: 'Follow-up',
    };
    const { queue } = setup([
      future,
      generic,
      { ...secondFollowUpDraft, type: 'Follow-up 3' },
    ]);
    await queue.prepare(schedule, now.toISOString());

    expect(queue.takeIssues()).toContainEqual(
      expect.objectContaining({
        interactionId: secondFollowUpDraft.id,
        message: expect.stringContaining('ambiguous'),
      }),
    );
    await queue.prepare(schedule, now.toISOString());
    expect(queue.takeIssues()).toContainEqual(
      expect.objectContaining({
        interactionId: generic.id,
        message: expect.stringContaining('Unsupported outbound conversation'),
      }),
    );
  });

  it('keeps a fixed run cutoff and admits newly prepared drafts on the next run', async () => {
    const newlyPrepared = initialDraft('recNew', '2026-09-21T09:01:00Z');
    const { queue, interactions } = setup([]);
    await queue.prepare(schedule, now.toISOString());
    expect(await queue.next()).toBeNull();

    interactions.listDrafts.mockResolvedValueOnce([newlyPrepared]);
    interactions.findDraftById.mockResolvedValueOnce(newlyPrepared);
    await queue.prepare(schedule, '2026-09-21T09:02:00.000Z');
    expect(await queue.next()).toMatchObject({ draft: { id: 'recNew' } });
  });

  it.each(['completed draft', 'Do Not Contact prospect'])(
    'rechecks candidates before selection and skips a newly %s',
    async (change) => {
      const { queue, interactions, prospects } = setup();
      await queue.prepare(schedule, now.toISOString());
      if (change === 'completed draft') {
        interactions.findDraftById.mockResolvedValueOnce({
          ...initialDraft('recB', '2026-09-10T09:00:00Z'),
          status: 'Completed',
        });
      } else {
        prospects.findQueueContextById.mockResolvedValueOnce({
          ...prospect,
          doNotContact: true,
        });
      }

      expect(await queue.next()).toEqual({
        rejected: expect.objectContaining({ interactionId: 'recB' }),
      });
    },
  );

  it('skips a draft deleted after preparation but surfaces read failures', async () => {
    const deleted = setup();
    await deleted.queue.prepare(schedule, now.toISOString());
    deleted.interactions.findDraftById.mockResolvedValueOnce(null);
    await expect(deleted.queue.next()).resolves.toEqual({
      rejected: expect.objectContaining({
        interactionId: 'recB',
        message: expect.stringContaining('deleted'),
      }),
    });

    const unavailable = setup();
    await unavailable.queue.prepare(schedule, now.toISOString());
    unavailable.interactions.findDraftById.mockRejectedValueOnce(
      new Error('Airtable unavailable'),
    );
    await expect(unavailable.queue.next()).rejects.toThrow(
      'Airtable unavailable',
    );
  });

  it('stops preparation after an awaited candidate load', async () => {
    const { queue, prospects } = setup([
      initialDraft('recA', '2026-09-10T09:00:00Z'),
      initialDraft('recB', '2026-09-10T09:01:00Z'),
    ]);
    let stopping = false;
    prospects.findQueueContextById.mockImplementationOnce(async () => {
      stopping = true;

      return prospect;
    });

    await queue.prepare(schedule, now.toISOString(), () => stopping);

    expect(prospects.findQueueContextById).toHaveBeenCalledOnce();
  });

  it('rejects sender attribution added to a follow-up before submission', async () => {
    const { queue, interactions } = setup([secondFollowUpDraft]);
    await queue.prepare(schedule, now.toISOString());
    const selection = await queue.next();
    expect(selection).toMatchObject({ draft: { id: secondFollowUpDraft.id } });
    interactions.findDraftById.mockResolvedValueOnce({
      ...secondFollowUpDraft,
      mailboxIds: ['recMailboxA'],
    });

    await expect(
      queue.assertSubmissionAllowed({
        id: secondFollowUpDraft.id,
        prospect: prospect.name,
        company: prospect.company,
        email: prospect.email,
        subject: secondFollowUpDraft.subject,
        message: secondFollowUpDraft.message,
        createdAt: secondFollowUpDraft.createdAt,
        gmailThreadId: secondFollowUpDraft.gmailThreadId,
        gmailOriginalMessageId: root.gmailMessageId,
        isFollowUp: true,
        mailboxId: 'recMailboxA',
        mailboxEmail: 'a@example.com',
        queueCategory: 'followUp2',
      }),
    ).rejects.toThrow('already has sender attribution');
  });

  it('keeps the reserved initial sender during final validation', async () => {
    const { queue, attempts } = setup();
    await queue.prepare(schedule, now.toISOString());
    const selection = await queue.next();
    expect(selection).toMatchObject({ mailbox: { id: 'recMailboxA' } });
    attempts.read.mockResolvedValue({
      version: 1,
      pending: null,
      lastAllocatedMailboxId: 'recMailboxA',
    });

    await expect(
      queue.assertSubmissionAllowed({
        id: 'recB',
        prospect: prospect.name,
        company: prospect.company,
        email: prospect.email,
        subject: 'Subject',
        message: 'Message',
        createdAt: '2026-09-10T09:00:00Z',
        isFollowUp: false,
        mailboxId: 'recMailboxA',
        mailboxEmail: 'a@example.com',
        queueCategory: 'initial',
      }),
    ).resolves.toBeUndefined();
  });

  it('redistributes exhausted allocation to the oldest available follow-up', async () => {
    const initial = initialDraft('recInitial', '2026-09-09T09:00:00Z');
    const { queue, state } = setup([initial, secondFollowUpDraft]);
    await queue.prepare(schedule, now.toISOString());
    state.day!.confirmed = {
      initial: 1,
      followUp1: 0,
      followUp2: 1,
      followUp3: 0,
    };
    state.day!.allocation = { ...state.day!.confirmed };

    expect(await queue.next()).toMatchObject({
      category: 'followUp2',
      draft: { id: secondFollowUpDraft.id },
    });
  });
});
