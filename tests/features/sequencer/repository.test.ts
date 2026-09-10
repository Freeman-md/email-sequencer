import { describe, expect, it, vi } from 'vitest';
import {
  createInteractionRepository,
  eligibleQuery,
} from '@/features/sequencer/server/repositories/interactions';
import { AIRTABLE } from '@/features/sequencer/constants/airtable';

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
      await createInteractionRepository(request).next(cutoff, new Set()),
    ).toMatchObject({
      id: record.id,
      email: 'maya@example.com',
      subject: 'Exact subject',
      message: 'Exact message',
    });
    expect(request.mock.calls[0]?.[0]).toBe(
      `${AIRTABLE.interactions}/listRecords`,
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      `${AIRTABLE.prospects}/recProspect`,
    );
  });
  it('skips a Prospect without Email and queries one new candidate instead of ending early', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ records: [record] })
      .mockResolvedValueOnce({ id: 'recProspect', fields: {} })
      .mockResolvedValueOnce({ records: [{ ...record, id: 'recSecond' }] })
      .mockResolvedValueOnce(prospect);
    expect(
      (await createInteractionRepository(request).next(cutoff, new Set()))?.id,
    ).toBe('recSecond');
    expect(JSON.parse(request.mock.calls[2]?.[1].body)).toMatchObject({
      maxRecords: 1,
      pageSize: 1,
    });
    expect(
      JSON.parse(request.mock.calls[2]?.[1].body).filterByFormula,
    ).toContain("RECORD_ID()!='recFirst'");
  });
  it('does not choose an arbitrary recipient when multiple Prospects are linked', async () => {
    const request = vi.fn().mockResolvedValue({
      records: [
        {
          ...record,
          fields: { ...record.fields, Prospect: ['recOne', 'recTwo'] },
        },
      ],
    });
    await expect(
      createInteractionRepository(request).next(cutoff, new Set()),
    ).rejects.toThrow('exactly one');
  });
  it('writes only Completed and actual Sent At, and requires confirmation', async () => {
    const request = vi.fn().mockResolvedValue({
      id: record.id,
      fields: { Status: 'Completed', 'Sent At': cutoff },
    });
    await createInteractionRepository(request).complete(record.id, cutoff);
    expect(request.mock.calls[0]?.[1]).toEqual({
      method: 'PATCH',
      body: JSON.stringify({
        fields: { Status: 'Completed', 'Sent At': cutoff },
      }),
    });
    request.mockResolvedValue({ id: record.id, fields: { Status: 'Draft' } });
    await expect(
      createInteractionRepository(request).complete(record.id, cutoff),
    ).rejects.toThrow('did not confirm');
  });
});
