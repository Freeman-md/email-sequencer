import 'server-only';

import { AIRTABLE } from '@/infrastructure/airtable/constants';
import { recordsSchema, recordSchema } from '@/infrastructure/airtable/schemas';

import {
  mapInteraction,
  mapInteractionCompletion,
} from '../mappers/interaction.mapper';

import type { IInteractionsRepository } from '../interfaces/interactions-repository.interface';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';
import type { SendResult } from '@/infrastructure/email/types/send-result';

const field = AIRTABLE.interaction;
const literal = (value: string) =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

export function eligibleQuery(
  runStartedAt: string,
  excludedIds: ReadonlySet<string>,
) {
  const cutoff = new Date(runStartedAt).toISOString();
  const conditions = [
    `{${field.status}}='Draft'`,
    `{${field.direction}}='Outbound'`,
    `{${field.channel}}='Email'`,
    `LEN(TRIM({${field.subject}}&''))>0`,
    `LEN(TRIM({${field.message}}&''))>0`,
    `{${field.prospect}}!=BLANK()`,
    `{${field.createdAt}}!=BLANK()`,
    `{${field.createdAt}}<=DATETIME_PARSE(${literal(cutoff)})`,
    ...Array.from(excludedIds, (id) => `RECORD_ID()!=${literal(id)}`),
  ];

  return {
    filterByFormula: `AND(${conditions.join(',')})`,
    maxRecords: 1,
    pageSize: 1,
    sort: [{ field: field.createdAt, direction: 'asc' }],
    fields: Object.values(field),
  };
}

export class InteractionsRepository implements IInteractionsRepository {
  constructor(private readonly client: IAirtableClient) {}

  async next(runStartedAt: string, excludedIds: ReadonlySet<string>) {
    const data = recordsSchema.parse(
      await this.client.request(`${AIRTABLE.interactions}/listRecords`, {
        method: 'POST',
        body: JSON.stringify(eligibleQuery(runStartedAt, excludedIds)),
      }),
    );
    const record = data.records[0];

    return record ? mapInteraction(record) : null;
  }

  async complete(
    id: string,
    confirmation: Extract<SendResult, { kind: 'confirmed' }>,
  ) {
    const { sentAt, gmailMessageId, gmailThreadId } = confirmation;
    const result = mapInteractionCompletion(
      recordSchema.parse(
        await this.client.request(
          `${AIRTABLE.interactions}/${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              fields: {
                [field.status]: 'Completed',
                [field.sentAt]: sentAt,
                [field.gmailMessageId]: gmailMessageId,
                [field.gmailThreadId]: gmailThreadId,
              },
            }),
          },
        ),
      ),
    );

    if (
      result.id !== id ||
      result.status !== 'Completed' ||
      result.gmailMessageId !== gmailMessageId ||
      result.gmailThreadId !== gmailThreadId ||
      Date.parse(result.sentAt) !== Date.parse(sentAt)
    ) {
      throw new Error(
        'Airtable did not confirm the Completed status, Sent At and Gmail IDs update.',
      );
    }
  }

  async checkConnection() {
    const query = new URLSearchParams({
      maxRecords: '1',
      filterByFormula: 'FALSE()',
    });
    Object.values(field).forEach((name) => query.append('fields[]', name));

    recordsSchema.parse(
      await this.client.request(`${AIRTABLE.interactions}?${query}`),
    );
  }
}
