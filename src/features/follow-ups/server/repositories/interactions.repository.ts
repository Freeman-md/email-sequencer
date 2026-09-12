import 'server-only';
import { AIRTABLE } from '@/infrastructure/airtable/constants';
import { recordSchema, recordsSchema } from '@/infrastructure/airtable/schemas';

import { mapInteraction, draftFields } from '../mappers/interaction.mapper';

import type { IInteractionsRepository } from '../interfaces/interactions-repository.interface';
import type { HistoryInteraction, FollowUpDraft } from '../types';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

export class InteractionsRepository implements IInteractionsRepository {
  constructor(private readonly client: IAirtableClient) {}

  async history(ids: string[]) {
    const result: HistoryInteraction[] = [];
    const uniqueIds = [...new Set(ids)];
    for (let start = 0; start < uniqueIds.length; start += 50) {
      const batch = uniqueIds.slice(start, start + 50);
      if (batch.some((id) => !/^rec[a-zA-Z0-9]+$/.test(id)))
        throw new Error('Invalid Interaction link.');
      // Linked-field formulas compare display values, not record IDs. Use the
      // Prospect's reciprocal links and RECORD_ID() to retrieve complete history.
      const data = recordsSchema.parse(
        await this.client.request(`${AIRTABLE.interactions}/listRecords`, {
          method: 'POST',
          body: JSON.stringify({
            pageSize: 100,
            filterByFormula: `OR(${batch.map((id) => `RECORD_ID()='${id}'`).join(',')})`,
            fields: [...Object.values(AIRTABLE.interaction), 'Received At'],
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
      result.push(...data.records.map(mapInteraction));
    }

    return result;
  }

  async createDraft(draft: FollowUpDraft) {
    const record = recordSchema.parse(
      await this.client.request(AIRTABLE.interactions, {
        method: 'POST',
        body: JSON.stringify({ fields: draftFields(draft) }),
      }),
    );
    const saved = mapInteraction(record);
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
      saved.prospectIds.length !== 1 ||
      saved.prospectIds[0] !== draft.prospectId
    )
      throw new Error('Airtable did not confirm the follow-up Draft.');
  }
}
