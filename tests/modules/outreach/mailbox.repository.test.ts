import { expect, it, vi } from 'vitest';

import { MailboxRepository } from '@/modules/outreach/mailboxes/airtable/mailbox.repository';

it('lists every page and confirms verified metadata writes without credentials', async () => {
  const record = {
    id: 'recMailboxA',
    fields: { Email: 'a@example.com', 'Google Subject': 'subject-a' },
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce({ records: [record], offset: 'next-page' })
    .mockResolvedValueOnce({
      records: [
        {
          id: 'recMailboxB',
          fields: { Email: 'b@example.com', 'Google Subject': 'subject-b' },
        },
      ],
    });
  const repository = new MailboxRepository({ request });
  expect(await repository.list()).toHaveLength(2);
  expect(request.mock.calls[1]?.[0]).toContain('offset=next-page');
  request.mockResolvedValue(record);
  expect(
    await repository.create({
      email: 'a@example.com',
      googleSubject: 'subject-a',
    }),
  ).toEqual({
    id: record.id,
    email: 'a@example.com',
    googleSubject: 'subject-a',
  });
  expect(JSON.parse(request.mock.lastCall?.[1].body)).toEqual({
    fields: { Email: 'a@example.com', 'Google Subject': 'subject-a' },
  });
  request.mockResolvedValue({
    ...record,
    fields: { ...record.fields, Email: 'updated@example.com' },
  });
  await repository.updateEmail(record.id, 'updated@example.com', 'subject-a');
  request.mockResolvedValue({
    ...record,
    fields: { ...record.fields, 'Google Subject': 'wrong-subject' },
  });
  await expect(
    repository.create({ email: 'a@example.com', googleSubject: 'subject-a' }),
  ).rejects.toThrow('did not confirm');
});
