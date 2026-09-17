import { expect, it, vi } from 'vitest';

import { InteractionRepository } from '@/modules/outreach/interactions/airtable/interaction.repository';

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
  };
  const request = vi.fn().mockResolvedValue({ id: 'recDraft', fields });
  const repository = new InteractionRepository({ request });
  await repository.createFollowUpDraft({
    prospectId: 'recProspect',
    subject: 'Original',
    message: 'Follow-up body',
    gmailThreadId: 'thread1',
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
