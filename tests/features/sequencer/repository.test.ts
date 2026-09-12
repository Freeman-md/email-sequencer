import { describe, expect, it, vi } from 'vitest';

import { AIRTABLE } from '@/features/sequencer/constants/airtable';
import {
  InteractionsRepository,
  eligibleQuery,
} from '@/features/sequencer/server/repositories/interactions.repository';
import { ProspectsRepository } from '@/features/sequencer/server/repositories/prospects.repository';

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
      await new InteractionsRepository({ request }).next(cutoff, new Set()),
    ).toMatchObject({
      id: record.id,
      prospectIds: ['recProspect'],
      subject: 'Exact subject',
      message: 'Exact message',
    });
    expect(
      await new ProspectsRepository({ request }).findById('recProspect'),
    ).toMatchObject({ email: 'maya@example.com' });
    expect(request.mock.calls[0]?.[0]).toBe(
      `${AIRTABLE.interactions}/listRecords`,
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      `${AIRTABLE.prospects}/recProspect`,
    );
  });

  it('rejects malformed field values instead of treating them as empty fields', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ...prospect, fields: { Email: 42 } });

    await expect(
      new ProspectsRepository({ request }).findById('recProspect'),
    ).rejects.toThrow('Expected text');
  });

  it('writes only Completed and actual Sent At, and requires confirmation', async () => {
    const request = vi.fn().mockResolvedValue({
      id: record.id,
      fields: { Status: 'Completed', 'Sent At': cutoff },
    });
    await new InteractionsRepository({ request }).complete(record.id, cutoff);
    expect(request.mock.calls[0]?.[1]).toEqual({
      method: 'PATCH',
      body: JSON.stringify({
        fields: { Status: 'Completed', 'Sent At': cutoff },
      }),
    });
    request.mockResolvedValue({ id: record.id, fields: { Status: 'Draft' } });
    await expect(
      new InteractionsRepository({ request }).complete(record.id, cutoff),
    ).rejects.toThrow('did not confirm');
  });
});
