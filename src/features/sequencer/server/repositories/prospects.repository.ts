import 'server-only';

import { recordSchema, recordsSchema } from '@/infrastructure/airtable/schemas';

import { AIRTABLE } from '../../constants/airtable';
import { mapProspect } from '../mappers/prospect.mapper';

import type { IProspectsRepository } from '../interfaces/prospects-repository.interface';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

export class ProspectsRepository implements IProspectsRepository {
  constructor(private readonly client: IAirtableClient) {}

  async findById(id: string) {
    const record = recordSchema.parse(
      await this.client.request(
        `${AIRTABLE.prospects}/${encodeURIComponent(id)}`,
      ),
    );

    if (record.id !== id) {
      throw new Error(
        'Airtable returned a different Prospect than requested. Run stopped.',
      );
    }

    return mapProspect(record);
  }

  async checkConnection() {
    const query = new URLSearchParams({
      maxRecords: '1',
      filterByFormula: 'FALSE()',
    });
    Object.values(AIRTABLE.prospect).forEach((name) =>
      query.append('fields[]', name),
    );

    recordsSchema.parse(
      await this.client.request(`${AIRTABLE.prospects}?${query}`),
    );
  }
}
