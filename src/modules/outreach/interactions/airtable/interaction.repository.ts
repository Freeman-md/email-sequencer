import 'server-only';

import { recordsSchema, recordSchema } from '@/infrastructure/airtable/schemas';

import {
  INTERACTION_TABLE,
  INTERACTION_FIELDS as field,
  RECEIVED_AT_FIELD,
} from './fields';
import {
  mapDraftCandidate,
  mapInteractionHistory,
  draftFields,
  mapInteractionCompletion,
} from './interaction.mapper';

import type { IInteractionRepository } from '../interfaces/interaction-repository.interface';
import type {
  SentConfirmation,
  HistoryInteraction,
  FollowUpDraft,
  SendingInteraction,
} from '../types';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

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

export class InteractionRepository implements IInteractionRepository {
  constructor(private readonly client: IAirtableClient) {}

  async findNextDraft(runStartedAt: string, excludedIds: ReadonlySet<string>) {
    const data = recordsSchema.parse(
      await this.client.request(`${INTERACTION_TABLE}/listRecords`, {
        method: 'POST',
        body: JSON.stringify(eligibleQuery(runStartedAt, excludedIds)),
      }),
    );
    const record = data.records[0];

    return record ? mapDraftCandidate(record) : null;
  }

  async confirmSent(id: string, confirmation: SentConfirmation) {
    const { sentAt, gmailMessageId, gmailThreadId, mailboxId } = confirmation;
    const result = mapInteractionCompletion(
      recordSchema.parse(
        await this.client.request(
          `${INTERACTION_TABLE}/${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              fields: {
                [field.status]: 'Completed',
                [field.sentAt]: sentAt,
                [field.gmailMessageId]: gmailMessageId,
                [field.gmailThreadId]: gmailThreadId,
                [field.mailbox]: [mailboxId],
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
      result.mailboxIds.length !== 1 ||
      result.mailboxIds[0] !== mailboxId ||
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
      await this.client.request(`${INTERACTION_TABLE}?${query}`),
    );
  }

  async findById(id: string): Promise<SendingInteraction> {
    const record = recordSchema.parse(
      await this.client.request(
        `${INTERACTION_TABLE}/${encodeURIComponent(id)}`,
      ),
    );
    if (record.id !== id) {
      throw new Error('Airtable returned a different root Interaction.');
    }

    return mapDraftCandidate(record);
  }

  async findHistoryByIds(ids: string[]) {
    const result: HistoryInteraction[] = [];
    const uniqueIds = [...new Set(ids)];
    for (let start = 0; start < uniqueIds.length; start += 50) {
      const batch = uniqueIds.slice(start, start + 50);
      if (batch.some((id) => !/^rec[a-zA-Z0-9]+$/.test(id)))
        throw new Error('Invalid Interaction link.');
      // Linked-field formulas compare display values, not record IDs. Use the
      // Prospect's reciprocal links and RECORD_ID() to retrieve complete history.
      const data = recordsSchema.parse(
        await this.client.request(`${INTERACTION_TABLE}/listRecords`, {
          method: 'POST',
          body: JSON.stringify({
            pageSize: 100,
            filterByFormula: `OR(${batch.map((id) => `RECORD_ID()='${id}'`).join(',')})`,
            fields: [...Object.values(field), RECEIVED_AT_FIELD],
          }),
        }),
      );
      if (
        data.offset ||
        data.records.length !== batch.length ||
        data.records.some((record) => !batch.includes(record.id))
      )
        throw new Error(
          'Interaction history is incomplete. Refresh Airtable relationships before preparation.',
        );
      result.push(...data.records.map(mapInteractionHistory));
    }

    return result;
  }

  async createFollowUpDraft(draft: FollowUpDraft) {
    const record = recordSchema.parse(
      await this.client.request(INTERACTION_TABLE, {
        method: 'POST',
        body: JSON.stringify({ fields: draftFields(draft) }),
      }),
    );
    const saved = mapInteractionHistory(record);
    if (
      saved.status !== 'Draft' ||
      saved.direction !== 'Outbound' ||
      saved.channel !== 'Email' ||
      saved.type !== 'Follow-up' ||
      saved.subject !== draft.subject ||
      saved.message !== draft.message ||
      saved.gmailThreadId !== draft.gmailThreadId ||
      saved.gmailMessageId ||
      saved.sentAt ||
      saved.mailboxIds.length !== 0 ||
      saved.initialInteractionIds.length !== 1 ||
      saved.initialInteractionIds[0] !== draft.initialInteractionId ||
      saved.prospectIds.length !== 1 ||
      saved.prospectIds[0] !== draft.prospectId
    )
      throw new Error('Airtable did not confirm the follow-up Draft.');
  }
}
