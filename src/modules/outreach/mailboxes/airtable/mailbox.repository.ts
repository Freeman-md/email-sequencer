import 'server-only';

import { recordsSchema, recordSchema } from '@/infrastructure/airtable/schemas';

import { MAILBOX_TABLE, MAILBOX_FIELDS as field } from './fields';
import { mapMailbox } from './mailbox.mapper';

import type { IMailboxRepository } from '../interfaces/mailbox-repository.interface';
import type { Mailbox } from '../types';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

export class MailboxRepository implements IMailboxRepository {
  constructor(private readonly client: IAirtableClient) {}

  async list(): Promise<Mailbox[]> {
    const result: Mailbox[] = [];
    const offsets = new Set<string>();
    let offset: string | undefined;

    do {
      const query = new URLSearchParams({ pageSize: '100' });
      Object.values(field).forEach((name) => query.append('fields[]', name));
      if (offset) {
        query.set('offset', offset);
      }
      const page = recordsSchema.parse(
        await this.client.request(`${MAILBOX_TABLE}?${query}`),
      );
      result.push(...page.records.map(mapMailbox));
      offset = page.offset;
      if (offset && offsets.has(offset)) {
        throw new Error('Mailbox listing repeated a page. Check Airtable.');
      }
      if (offset) {
        offsets.add(offset);
      }
    } while (offset);

    return result;
  }

  async create(identity: Omit<Mailbox, 'id'>): Promise<Mailbox> {
    const saved = mapMailbox(
      recordSchema.parse(
        await this.client.request(MAILBOX_TABLE, {
          method: 'POST',
          body: JSON.stringify({
            fields: {
              [field.email]: identity.email,
              [field.googleSubject]: identity.googleSubject,
            },
          }),
        }),
      ),
    );
    if (
      saved.email !== identity.email ||
      saved.googleSubject !== identity.googleSubject
    ) {
      throw new Error(
        'Airtable did not confirm the mailbox identity. Reconnect; do not create a record manually.',
      );
    }

    return saved;
  }

  async updateEmail(
    id: string,
    email: string,
    googleSubject: string,
  ): Promise<Mailbox> {
    const saved = mapMailbox(
      recordSchema.parse(
        await this.client.request(
          `${MAILBOX_TABLE}/${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ fields: { [field.email]: email } }),
          },
        ),
      ),
    );
    if (
      saved.id !== id ||
      saved.email !== email ||
      saved.googleSubject !== googleSubject
    ) {
      throw new Error(
        'Airtable did not confirm the reconnected mailbox identity. Refresh and reconcile its metadata.',
      );
    }

    return saved;
  }
}
