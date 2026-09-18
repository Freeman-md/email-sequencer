import { expect, it, vi } from 'vitest';

import { InteractionRepository } from '@/modules/outreach/interactions/airtable/interaction.repository';

it('pages candidate prospects through completed outbound initial emails with mailbox attribution', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      records: [
        { id: 'recInitialA', fields: { Prospect: ['recProspectA'] } },
        { id: 'recInitialB', fields: { Prospect: ['recProspectA'] } },
        { id: 'recUnlinked', fields: {} },
        {
          id: 'recAmbiguous',
          fields: { Prospect: ['recProspectA', 'recProspectB'] },
        },
      ],
      offset: 'next',
    })
    .mockResolvedValueOnce({ records: [] });
  const repository = new InteractionRepository({ request });

  expect(await repository.pageFollowUpCandidateProspects()).toEqual({
    ids: ['recProspectA', 'recProspectA', 'recProspectA', 'recProspectB'],
    offset: 'next',
  });
  expect(request.mock.calls[0]?.[0]).toBe('tblqbyXiQs2ZAHTrH/listRecords');
  expect(request.mock.calls[0]?.[1].method).toBe('POST');
  const query = JSON.parse(request.mock.calls[0]?.[1].body);
  expect(query).toEqual({
    pageSize: 25,
    fields: ['Prospect'],
    filterByFormula:
      "AND({Channel}='Email',{Direction}='Outbound',{Status}='Completed',{Type}='Initial Message',{Sent From Mailbox}!=BLANK())",
  });

  expect(await repository.pageFollowUpCandidateProspects('next')).toEqual({
    ids: [],
    offset: undefined,
  });
  expect(JSON.parse(request.mock.calls[1]?.[1].body)).toEqual({
    ...query,
    offset: 'next',
  });
});

it('retains replies and drafts without mailbox attribution when reading complete history', async () => {
  const request = vi.fn().mockResolvedValue({
    records: [
      {
        id: 'recReply',
        fields: {
          Direction: 'Inbound',
          Status: 'Completed',
          Channel: 'LinkedIn',
          Prospect: ['recProspect'],
          'Received At': '2026-09-12T11:00:00Z',
        },
      },
      {
        id: 'recDraft',
        fields: {
          Direction: 'Outbound',
          Status: 'Draft',
          Channel: 'Email',
          Type: 'Follow-up',
          Prospect: ['recProspect'],
        },
      },
    ],
  });
  const repository = new InteractionRepository({ request });

  expect(await repository.findHistoryByIds(['recReply', 'recDraft'])).toEqual([
    expect.objectContaining({
      id: 'recReply',
      direction: 'Inbound',
      channel: 'LinkedIn',
      mailboxIds: [],
    }),
    expect.objectContaining({
      id: 'recDraft',
      status: 'Draft',
      type: 'Follow-up',
      mailboxIds: [],
    }),
  ]);
  expect(JSON.parse(request.mock.calls[0]?.[1].body).filterByFormula).toBe(
    "OR(RECORD_ID()='recReply',RECORD_ID()='recDraft')",
  );
});

it('creates a linked Draft with the original subject/thread and no send identifiers or timestamps', async () => {
  const fields = {
    Direction: 'Outbound',
    Channel: 'Email',
    Type: 'Follow-up',
    Status: 'Draft',
    Subject: 'Original',
    Message: 'Follow-up body',
    Prospect: ['recProspect'],
    'Gmail Thread ID': 'thread1',
    'Initial Interaction': ['recInitial'],
    'Sent From Mailbox': [],
  };
  const request = vi.fn().mockResolvedValue({ id: 'recDraft', fields });
  const repository = new InteractionRepository({ request });
  await repository.createFollowUpDraft({
    prospectId: 'recProspect',
    subject: 'Original',
    message: 'Follow-up body',
    gmailThreadId: 'thread1',
    initialInteractionId: 'recInitial',
  });
  expect(JSON.parse(request.mock.calls[0]?.[1].body)).toEqual({ fields });
  request.mockResolvedValue({
    id: 'recDraft',
    fields: { ...fields, 'Gmail Thread ID': 'wrong' },
  });
  await expect(
    repository.createFollowUpDraft({
      prospectId: 'recProspect',
      subject: 'Original',
      message: 'Follow-up body',
      gmailThreadId: 'thread1',
      initialInteractionId: 'recInitial',
    }),
  ).rejects.toThrow('did not confirm');
});

it('loads linked history in bounded ID batches and rejects incomplete history', async () => {
  const ids = Array.from({ length: 51 }, (_, i) => `recHistory${i}`);
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      records: ids.slice(0, 50).map((id) => ({ id, fields: {} })),
    })
    .mockResolvedValueOnce({ records: [{ id: ids[50], fields: {} }] });
  const repository = new InteractionRepository({ request });
  expect(await repository.findHistoryByIds(ids)).toHaveLength(51);
  expect(request).toHaveBeenCalledTimes(2);
  const query = JSON.parse(request.mock.calls[0]?.[1].body);
  expect(query.filterByFormula).toContain("RECORD_ID()='recHistory0'");
  expect(query.fields).toContain('Received At');
  request.mockResolvedValue({ records: [] });
  await expect(repository.findHistoryByIds(['recMissing'])).rejects.toThrow(
    'incomplete',
  );
});
