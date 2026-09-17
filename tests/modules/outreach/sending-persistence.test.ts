import { describe, expect, it, vi } from 'vitest';

import { INTERACTION_TABLE } from '@/modules/outreach/interactions/airtable/fields';
import {
  InteractionRepository,
  eligibleQuery,
} from '@/modules/outreach/interactions/airtable/interaction.repository';
import { PROSPECT_TABLE } from '@/modules/outreach/prospects/airtable/fields';
import { ProspectRepository } from '@/modules/outreach/prospects/airtable/prospect.repository';

const confirmation = {
  kind: 'confirmed' as const,
  sentAt: '2026-09-09T12:00:00.000Z',
  gmailMessageId: 'gmail-id',
  gmailThreadId: 'thread-id',
};
const cutoff = '2026-09-09T12:00:00.000Z';
const record = {
  id: 'recFirst',
  fields: {
    Status: 'Draft',
    Direction: 'Outbound',
    Channel: 'Email',
    Subject: 'Exact subject',
    Message: 'Exact message',
    Prospect: ['recProspect'],
    'Created At': cutoff,
  },
};
const prospect = {
  id: 'recProspect',
  fields: {
    'Full Name': 'Maya',
    Company: 'Northstar',
    Email: 'maya@example.com',
  },
};

describe('Airtable contract', () => {
  it('uses every V1 filter, an inclusive fixed cutoff, oldest-first sort and a one-record limit', () => {
    const query = eligibleQuery(cutoff, new Set(['recFailed']));
    expect(query).toMatchObject({
      maxRecords: 1,
      pageSize: 1,
      sort: [{ field: 'Created At', direction: 'asc' }],
    });
    for (const rule of [
      "{Status}='Draft'",
      "{Direction}='Outbound'",
      "{Channel}='Email'",
      "LEN(TRIM({Subject}&''))>0",
      "LEN(TRIM({Message}&''))>0",
      '{Prospect}!=BLANK()',
      `{Created At}<=DATETIME_PARSE('${cutoff}')`,
      "RECORD_ID()!='recFailed'",
    ])
      expect(query.filterByFormula).toContain(rule);
  });

  it('resolves the linked Prospect Email and preserves Interaction Subject and Message', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ records: [record] })
      .mockResolvedValueOnce(prospect);
    expect(
      await new InteractionRepository({ request }).findNextDraft(
        cutoff,
        new Set(),
      ),
    ).toMatchObject({
      id: record.id,
      prospectIds: ['recProspect'],
      subject: 'Exact subject',
      message: 'Exact message',
    });
    expect(
      await new ProspectRepository({ request }).findContactById('recProspect'),
    ).toMatchObject({ email: 'maya@example.com' });
    expect(request.mock.calls[0]?.[0]).toBe(`${INTERACTION_TABLE}/listRecords`);
    expect(request.mock.calls[1]?.[0]).toBe(`${PROSPECT_TABLE}/recProspect`);
  });

  it('rejects malformed field values instead of treating them as empty fields', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ...prospect, fields: { Email: 42 } });

    await expect(
      new ProspectRepository({ request }).findContactById('recProspect'),
    ).rejects.toThrow('Expected text');
  });

  it('writes Completed, actual Sent At and both Gmail IDs, and requires confirmation', async () => {
    const request = vi.fn().mockResolvedValue({
      id: record.id,
      fields: {
        Status: 'Completed',
        'Sent At': cutoff,
        'Gmail Message ID': 'gmail-id',
        'Gmail Thread ID': 'thread-id',
      },
    });
    await new InteractionRepository({ request }).confirmSent(
      record.id,
      confirmation,
    );
    expect(request.mock.calls[0]?.[1]).toEqual({
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          Status: 'Completed',
          'Sent At': cutoff,
          'Gmail Message ID': 'gmail-id',
          'Gmail Thread ID': 'thread-id',
        },
      }),
    });
    request.mockResolvedValue({ id: record.id, fields: { Status: 'Draft' } });
    await expect(
      new InteractionRepository({ request }).confirmSent(
        record.id,
        confirmation,
      ),
    ).rejects.toThrow('did not confirm');
  });
});

it('keeps contact reads independent of research validation and validates opt-out data', async () => {
  const request = vi.fn().mockResolvedValue({
    ...prospect,
    fields: { ...prospect.fields, Role: 42, 'Do Not Contact': true },
  });
  const repository = new ProspectRepository({ request });
  await expect(repository.findContactById(prospect.id)).resolves.toMatchObject({
    email: 'maya@example.com',
    doNotContact: true,
  });
  await expect(repository.findContextById(prospect.id)).rejects.toThrow(
    'Expected text',
  );
  request.mockResolvedValue({
    ...prospect,
    fields: { ...prospect.fields, 'Do Not Contact': 'false' },
  });
  await expect(repository.findContactById(prospect.id)).rejects.toThrow();
});

it('applies the same relationship validation to sending and history reads', async () => {
  const invalid = {
    ...record,
    fields: { ...record.fields, Prospect: ['not-a-record-id'] },
  };
  const request = vi.fn().mockResolvedValue({ records: [invalid] });
  const repository = new InteractionRepository({ request });
  await expect(repository.findNextDraft(cutoff, new Set())).rejects.toThrow(
    'invalid Prospect links',
  );
  await expect(repository.findHistoryByIds([record.id])).rejects.toThrow(
    'invalid Prospect links',
  );
});
