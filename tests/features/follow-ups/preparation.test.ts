import { describe, expect, it, vi } from 'vitest';

import { FOLLOW_UP_STEPS } from '@/features/follow-ups/constants/steps';
import { assessFollowUp } from '@/features/follow-ups/server/services/eligibility';
import { FollowUpsService } from '@/features/follow-ups/server/services/follow-ups.service';
import { TextGenerationError } from '@/infrastructure/text-generation/error';

import type {
  Prospect,
  HistoryInteraction,
} from '@/features/follow-ups/server/types';

const now = Date.parse('2026-09-12T12:00:00Z');
const prospect: Prospect = {
  id: 'recProspect',
  name: 'Test',
  email: 'test@example.com',
  role: 'Owner',
  company: 'Example',
  campaignIds: ['recCampaign'],
  interactionIds: ['recInitial'],
  doNotContact: false,
  signal: 'Existing evidence',
  sources: 'Existing source',
  qualificationNotes: 'Relevant fit',
};
const initial: HistoryInteraction = {
  id: 'recInitial',
  direction: 'Outbound',
  channel: 'Email',
  type: 'Initial Message',
  status: 'Completed',
  subject: 'Original subject',
  message: 'Original email',
  sentAt: '2026-09-01T12:00:00Z',
  createdAt: '2026-08-01T12:00:00Z',
  receivedAt: '',
  gmailMessageId: 'message1',
  gmailThreadId: 'thread1',
  prospectIds: [prospect.id],
};
const followup: HistoryInteraction = {
  ...initial,
  id: 'recFollowup',
  type: 'Follow-up',
  sentAt: '2026-09-04T12:00:00Z',
  gmailMessageId: 'message2',
};
const assess = (history: HistoryInteraction[], person = prospect) =>
  assessFollowUp(person, history, FOLLOW_UP_STEPS, now);

describe('follow-up eligibility', () => {
  it('uses inclusive delay from the latest Sent At and advances without per-step branches', () => {
    expect(
      assessFollowUp(
        prospect,
        [initial],
        FOLLOW_UP_STEPS,
        Date.parse(initial.sentAt) + 3 * 86400000,
      ).due?.step.number,
    ).toBe(1);
    expect(
      assess([{ ...initial, sentAt: '2026-09-11T12:00:00Z' }]).reason,
    ).toBe('Not due yet');
    expect(assess([initial, followup]).due?.step.number).toBe(2);
    expect(
      assess([initial, { ...followup, sentAt: '2026-09-10T12:00:00Z' }]).reason,
    ).toBe('Not due yet');
    const sequence = [
      initial,
      followup,
      { ...followup, id: 'recThree', sentAt: '2026-09-05T12:00:00Z' },
      { ...followup, id: 'recFour', sentAt: '2026-09-06T12:00:00Z' },
    ];
    expect(assess(sequence).reason).toBe('Sequence complete');
    expect(
      assessFollowUp(
        prospect,
        sequence,
        [
          ...FOLLOW_UP_STEPS,
          { number: 4, waitDays: 1, guidance: 'Fourth step' },
        ],
        now,
      ).due?.step.number,
    ).toBe(4);
  });
  it.each([
    [
      'missing thread',
      [{ ...initial, gmailThreadId: '' }],
      'Missing Gmail Thread ID',
    ],
    [
      'missing message',
      [{ ...initial, gmailMessageId: '' }],
      'Missing Gmail Message ID',
    ],
    [
      'missing Sent At',
      [{ ...initial, sentAt: '' }],
      'Missing or invalid outbound Sent At',
    ],
    [
      'reply after latest outbound',
      [
        initial,
        followup,
        {
          ...initial,
          direction: 'Inbound',
          receivedAt: '2026-09-05T12:00:00Z',
        },
      ],
      'Reply already received',
    ],
    [
      'reply before a subsequent outbound',
      [
        initial,
        followup,
        {
          ...initial,
          direction: 'Inbound',
          receivedAt: '2026-09-02T12:00:00Z',
        },
      ],
      'Reply already received',
    ],
    [
      'backfilled reply without timestamp',
      [
        initial,
        {
          ...initial,
          direction: 'Inbound',
          createdAt: '2026-08-01T12:00:00Z',
          receivedAt: '',
        },
      ],
      'Inbound Interaction missing reliable Received At',
    ],
    [
      'draft already exists',
      [
        initial,
        { ...followup, status: 'Draft', sentAt: '', gmailMessageId: '' },
      ],
      'Existing Draft Follow-up',
    ],
    [
      'conflicting threads',
      [initial, { ...followup, gmailThreadId: 'otherThread' }],
      'Conflicting Gmail threads',
    ],
  ] as const)('skips %s', (_label, history, reason) => {
    expect(assess([...history]).reason).toBe(reason);
  });
  it('does not reset a sequence when another Initial Message is logged', () => {
    expect(
      assess([
        initial,
        followup,
        { ...initial, id: 'recSecondInitial', sentAt: '2026-09-06T12:00:00Z' },
      ]).reason,
    ).toBe('Ambiguous initial conversation');
  });
  it('honours Do Not Contact and invalid email', () => {
    expect(assess([initial], { ...prospect, doNotContact: true }).reason).toBe(
      'Do Not Contact',
    );
    expect(assess([initial], { ...prospect, email: '' }).reason).toContain(
      'Prospect Email',
    );
  });
});

function setup() {
  const prospects = {
    page: vi.fn().mockResolvedValue({ ids: [prospect.id] }),
    findById: vi.fn().mockResolvedValue(prospect),
  };
  const interactions = {
    history: vi.fn().mockResolvedValue([initial]),
    createDraft: vi.fn().mockResolvedValue(undefined),
  };
  const campaigns = {
    findById: vi.fn().mockResolvedValue({
      id: 'recCampaign',
      name: 'Relevant offer',
      guidance: { Offer: 'Existing offer' },
    }),
  };
  const generator = {
    generate: vi.fn().mockResolvedValue('A short, relevant follow-up.'),
  };
  const service = new FollowUpsService(
    prospects,
    interactions,
    campaigns,
    generator,
    FOLLOW_UP_STEPS,
    () => new Date(now),
  );

  return { service, prospects, interactions, campaigns, generator };
}
async function finished(service: FollowUpsService) {
  await vi.waitFor(() =>
    expect(['running', 'stopping']).not.toContain(service.snapshot().status),
  );
}

describe('preparation workflow', () => {
  it('locks concurrent runs, saves only a draft, and suppresses duplicates on the next run', async () => {
    const { service, interactions, generator, prospects } = setup();
    interactions.createDraft.mockImplementation(async () => {
      interactions.history.mockResolvedValue([
        initial,
        { ...followup, status: 'Draft', sentAt: '', gmailMessageId: '' },
      ]);
    });
    service.start();
    expect(() => service.start()).toThrow('already running');
    await finished(service);
    expect(service.snapshot()).toMatchObject({
      checked: 1,
      eligible: 1,
      drafted: 1,
      skipped: 0,
    });
    expect(interactions.createDraft).toHaveBeenCalledWith({
      prospectId: prospect.id,
      subject: initial.subject,
      message: 'A short, relevant follow-up.',
      gmailThreadId: initial.gmailThreadId,
    });
    expect(prospects.findById).toHaveBeenCalledTimes(2);
    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prospect,
        campaign: expect.objectContaining({ name: 'Relevant offer' }),
        history: [initial],
        due: expect.objectContaining({ step: FOLLOW_UP_STEPS[0] }),
      }),
      expect.any(AbortSignal),
    );
    service.start();
    await finished(service);
    expect(interactions.createDraft).toHaveBeenCalledTimes(1);
    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(service.snapshot().reasons['Existing Draft Follow-up']).toBe(1);
  });
  it('rechecks for a reply arriving during generation', async () => {
    const { service, interactions } = setup();
    interactions.history.mockResolvedValueOnce([initial]).mockResolvedValue([
      initial,
      {
        ...initial,
        direction: 'Inbound',
        receivedAt: '2026-09-12T11:00:00Z',
      },
    ]);
    service.start();
    await finished(service);
    expect(interactions.createDraft).not.toHaveBeenCalled();
    expect(service.snapshot().reasons['Reply already received']).toBe(1);
  });
  it('continues across pages after generation and write failures without retrying either', async () => {
    const { service, prospects, generator, interactions } = setup();
    prospects.page
      .mockResolvedValueOnce({ ids: ['recFirst', 'recSecond'], offset: 'next' })
      .mockResolvedValueOnce({ ids: ['recThird'] });
    generator.generate.mockRejectedValueOnce(
      new Error('private provider error'),
    );
    interactions.createDraft.mockRejectedValueOnce(
      new Error('private write error'),
    );
    service.start();
    await finished(service);
    expect(prospects.page).toHaveBeenLastCalledWith('next');
    expect(service.snapshot()).toMatchObject({
      status: 'completed',
      checked: 3,
      eligible: 3,
      drafted: 1,
      skipped: 2,
      errorCount: 2,
    });
    expect(generator.generate).toHaveBeenCalledTimes(3);
    expect(interactions.createDraft).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(service.snapshot())).not.toContain('private');
  });
});

describe('preparation stop and limits', () => {
  it('limits confirmed drafts, without counting skips or reading the next page', async () => {
    const { service, prospects, interactions, generator } = setup();
    prospects.page.mockResolvedValue({
      ids: ['recSkip', 'recReady', 'recUnused'],
      offset: 'next',
    });
    prospects.findById.mockResolvedValueOnce({ ...prospect, email: '' });
    service.start(1);
    await finished(service);
    expect(service.snapshot()).toMatchObject({
      status: 'completed',
      limit: 1,
      checked: 2,
      drafted: 1,
      skipped: 1,
    });
    expect(prospects.page).toHaveBeenCalledTimes(1);
    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(interactions.createDraft).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid limits without starting any work', () => {
    const { service, prospects } = setup();
    for (const limit of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => service.start(limit)).toThrow('positive whole number');
    }
    expect(prospects.page).not.toHaveBeenCalled();
    expect(service.snapshot().status).toBe('idle');
  });

  it('stops during a candidate read without beginning a prospect', async () => {
    const { service, prospects } = setup();
    let resolve!: (page: { ids: string[] }) => void;
    prospects.page.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    service.start();
    expect(service.stop().status).toBe('stopping');
    expect(() => service.start()).toThrow('already running');
    resolve({ ids: [prospect.id] });
    await finished(service);
    expect(service.snapshot()).toMatchObject({ status: 'stopped', checked: 0 });
    expect(prospects.findById).not.toHaveBeenCalled();
  });

  it('cancels generation, creates no draft and allows a fresh run after stopping', async () => {
    const { service, generator, interactions } = setup();
    generator.generate.mockImplementation(
      (_context, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('Cancelled')),
            { once: true },
          );
        }),
    );
    service.start();
    await vi.waitFor(() => expect(generator.generate).toHaveBeenCalledTimes(1));
    expect(service.stop().status).toBe('stopping');
    expect(() => service.start()).toThrow('already running');
    await finished(service);
    expect(service.snapshot()).toMatchObject({
      status: 'stopped',
      drafted: 0,
      skipped: 1,
      errorCount: 0,
    });
    expect(interactions.createDraft).not.toHaveBeenCalled();
    expect(generator.generate.mock.calls[0]?.[1].aborted).toBe(true);
    generator.generate.mockResolvedValue('A fresh follow-up.');
    service.start(1);
    await finished(service);
    expect(service.snapshot()).toMatchObject({
      status: 'completed',
      drafted: 1,
      skipped: 0,
    });
  });

  it.each([false, true])(
    'settles an in-flight draft write before releasing the lock (failure: %s)',
    async (failure) => {
      const { service, prospects, interactions } = setup();
      prospects.page.mockResolvedValue({
        ids: [prospect.id, 'recNext'],
        offset: 'next',
      });
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      interactions.createDraft.mockReturnValueOnce(
        new Promise<void>((done, fail) => {
          resolve = done;
          reject = fail;
        }),
      );
      service.start();
      await vi.waitFor(() =>
        expect(interactions.createDraft).toHaveBeenCalledTimes(1),
      );
      expect(service.stop().status).toBe('stopping');
      expect(service.stop().status).toBe('stopping');
      expect(() => service.start()).toThrow('already running');
      if (failure) reject(new Error('Unknown write outcome'));
      else resolve();
      await finished(service);
      expect(service.snapshot()).toMatchObject({
        status: 'stopped',
        drafted: failure ? 0 : 1,
        errorCount: failure ? 1 : 0,
        checked: 1,
      });
      expect(prospects.page).toHaveBeenCalledTimes(1);
      expect(interactions.createDraft).toHaveBeenCalledTimes(1);
      expect(service.stop().status).toBe('stopped');
    },
  );
});

it('shows safe generation diagnostics without exposing unexpected provider errors', async () => {
  for (const cause of [
    new TextGenerationError('quota', 'req_test'),
    new Error('PRIVATE upstream detail'),
  ]) {
    const { service, generator, interactions } = setup();
    generator.generate.mockRejectedValueOnce(cause);
    service.start();
    await finished(service);
    const message = service.snapshot().errors[0]!.message;
    expect(message).not.toContain('PRIVATE');
    if (cause instanceof TextGenerationError) {
      expect(message).toContain('quota');
      expect(message).toContain('req_test');
    }
    expect(interactions.createDraft).not.toHaveBeenCalled();
    expect(generator.generate).toHaveBeenCalledTimes(1);
  }
});
