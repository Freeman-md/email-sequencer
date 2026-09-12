import 'server-only';

import { recordSchema, recordsSchema } from '@/infrastructure/airtable/client';

import { AIRTABLE } from '../../constants/airtable';
import { mapProspect } from '../mappers/prospect.mapper';

import type { AirtableRequest } from '../interfaces/airtable-request.interface';
import type { IProspectsRepository } from '../interfaces/prospects-repository.interface';

export class ProspectsRepository implements IProspectsRepository {
  constructor(private readonly request: AirtableRequest) {}

  async findById(id: string) {
    const record = recordSchema.parse(
      await this.request(`${AIRTABLE.prospects}/${encodeURIComponent(id)}`),
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

    recordsSchema.parse(await this.request(`${AIRTABLE.prospects}?${query}`));
  }
}
