import 'server-only';
import { AIRTABLE } from '@/infrastructure/airtable/constants';
import { recordSchema, recordsSchema } from '@/infrastructure/airtable/schemas';

import { mapProspect } from '../mappers/prospect.mapper';

import type { IProspectsRepository } from '../interfaces/prospects-repository.interface';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

export class ProspectsRepository implements IProspectsRepository {
  constructor(private readonly client: IAirtableClient) {}

  async page(offset?: string) {
    const data = recordsSchema.parse(
      await this.client.request(`${AIRTABLE.prospects}/listRecords`, {
        method: 'POST',
        body: JSON.stringify({
          pageSize: 25,
          fields: ['Full Name'],
          filterByFormula: '{Interactions}!=BLANK()',
          ...(offset ? { offset } : {}),
        }),
      }),
    );

    return {
      ids: data.records.map((record) => record.id),
      offset: data.offset,
    };
  }

  async findById(id: string) {
    const record = recordSchema.parse(
      await this.client.request(
        `${AIRTABLE.prospects}/${encodeURIComponent(id)}`,
      ),
    );
    if (record.id !== id)
      throw new Error('Airtable returned a different Prospect.');

    return mapProspect(record);
  }
}
